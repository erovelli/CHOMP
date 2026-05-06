"""Quantify NPPES merge coverage:
  1. Drop rate per month — % of HHS dental claims dropped by the inner join
     because servicing_npi was absent from the same-month NPPES snapshot.
  2. Recoverability — % of those dropped rows that COULD be recovered if we
     looked up the servicing_npi in adjacent NPPES months (a sliding window
     of N months on each side).

The NPPES NPI columns are cached as parquet on first run (under
MergedHHS-NPI/nppes_npi_cache/) so repeat analyses are fast. The cache is
small (~one column × ~9M rows × 84 months ≈ 8 GB on disk; tiny in memory
since we slide a 3-month window).

Usage:
    python scripts/analyze_coverage.py                # default ±1 month
    python scripts/analyze_coverage.py --window 2     # ±2 months (5-month window)
    python scripts/analyze_coverage.py --rebuild-cache

Requires the merge to have completed (hhs_dental/*.parquet AND merged CSV
AND .processed_months.txt all present in MergedHHS-NPI/).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

# Reuse the merge script's helpers for finding/opening NPPES CSVs.
sys.path.insert(0, str(Path(__file__).parent))
from merge_hhs_nppes import _find_nppes_csv, _open_zip_member, _sniff_zip_member_header  # noqa: E402


def _yyyymm_to_dashed(yyyymm: str) -> str:
    """201801 -> 2018-01 (matches HHS CLAIM_FROM_MONTH format)."""
    return f"{yyyymm[:4]}-{yyyymm[4:]}"


def _shift_yyyymm(yyyymm: str, delta: int) -> str:
    """201801 + 1 -> 201802; 201812 + 1 -> 201901; etc."""
    y, m = int(yyyymm[:4]), int(yyyymm[4:])
    total = y * 12 + (m - 1) + delta
    new_y, new_m = divmod(total, 12)
    return f"{new_y:04d}{new_m + 1:02d}"


def _ensure_nppes_npi_cache(yyyymm: str, nppes_dir: Path, cache_dir: Path, rebuild: bool) -> Path:
    """Ensure a parquet of NPPES NPIs exists for this month; build if missing."""
    cache_path = cache_dir / f"{yyyymm}.parquet"
    if cache_path.exists() and not rebuild:
        return cache_path
    nppes_zip = nppes_dir / f"npi_raw_{yyyymm}.zip"
    if not nppes_zip.exists():
        return cache_path  # caller will check existence
    csv_name = _find_nppes_csv(nppes_zip)
    # Sniff header to confirm "NPI" exists (it always does, but defensive)
    header = _sniff_zip_member_header(nppes_zip, csv_name)
    if "NPI" not in header:
        raise KeyError(f"{nppes_zip.name}: no NPI column in {csv_name}")
    print(f"  caching NPI column from {nppes_zip.name}...")
    with _open_zip_member(nppes_zip, csv_name) as f:
        df = pd.read_csv(f, usecols=["NPI"], dtype="string")
    df = df.dropna(subset=["NPI"])
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache_path, index=False)
    return cache_path


def _load_npi_set(yyyymm: str, nppes_dir: Path, cache_dir: Path, rebuild: bool) -> set[str]:
    """Return set of NPIs present in a given month's NPPES, or empty set if no zip."""
    cache_path = _ensure_nppes_npi_cache(yyyymm, nppes_dir, cache_dir, rebuild)
    if not cache_path.exists():
        return set()
    return set(pd.read_parquet(cache_path)["NPI"].astype(str))


def main() -> int:
    data_root = Path("../data")
    default_nppes = data_root / "NPPES"
    default_output = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--nppes-dir", type=Path, default=default_nppes)
    p.add_argument("--output-dir", type=Path, default=default_output)
    p.add_argument("--window", type=int, default=1, help="±N months window for recovery (default 1 = ±1, a 3-month window total)")
    p.add_argument("--rebuild-cache", action="store_true", help="Rebuild the per-month NPPES NPI parquet cache")
    args = p.parse_args()

    dental_dir = args.output_dir / "hhs_dental"
    merged_csv = args.output_dir / "merged_hhs_nppes.csv"
    cache_dir = args.output_dir / "nppes_npi_cache"

    if not dental_dir.is_dir():
        print(f"error: dental cache not found at {dental_dir}. Run merge_hhs_nppes.py first.", file=sys.stderr)
        return 2
    if not merged_csv.exists():
        print(f"error: merged CSV not found at {merged_csv}. Run merge_hhs_nppes.py first.", file=sys.stderr)
        return 2

    months = sorted(p.stem for p in dental_dir.glob("*.parquet"))
    print(f"analyzing {len(months)} months ({months[0]} -> {months[-1]}) with ±{args.window} month recovery window")

    # ---- count merged rows per month from the big CSV ----
    print(f"\ncounting merged rows per month from {merged_csv} (read once, only year_month col)...")
    merged_counts_dashed = (
        pd.read_csv(merged_csv, usecols=["year_month"], dtype="string")["year_month"].value_counts()
    )
    # Reindex by yyyymm form for joining
    merged_counts = {ym: int(merged_counts_dashed.get(_yyyymm_to_dashed(ym), 0)) for ym in months}

    # ---- compute per-month drop & recovery ----
    rows = []
    print()
    for i, ym in enumerate(months):
        # HHS dental row counts and per-NPI counts (only servicing_npi column)
        dental = pd.read_parquet(dental_dir / f"{ym}.parquet", columns=["servicing_npi"])
        n_dental = len(dental)
        n_merged = merged_counts[ym]
        n_dropped = n_dental - n_merged

        # Identify dropped servicing_npis and their row counts (Series: NPI -> count)
        same_npis = _load_npi_set(ym, args.nppes_dir, cache_dir, args.rebuild_cache)
        npi_counts = dental["servicing_npi"].value_counts(dropna=False)
        # Dropped = NPIs not in same-month NPPES
        dropped_npi_counts = npi_counts[~npi_counts.index.astype(str).isin(same_npis)]

        # Build recovery NPI set from window of neighbors (skip 0 = same month)
        neighbor_npis: set[str] = set()
        for delta in range(-args.window, args.window + 1):
            if delta == 0:
                continue
            neighbor_npis |= _load_npi_set(_shift_yyyymm(ym, delta), args.nppes_dir, cache_dir, args.rebuild_cache)

        recoverable_mask = dropped_npi_counts.index.astype(str).isin(neighbor_npis)
        n_recoverable_rows = int(dropped_npi_counts[recoverable_mask].sum())
        n_recoverable_npis = int(recoverable_mask.sum())
        n_dropped_npis = int(len(dropped_npi_counts))

        rows.append({
            "year_month": ym,
            "hhs_dental_rows": n_dental,
            "merged_rows": n_merged,
            "dropped_rows": n_dropped,
            "drop_rate_pct": 100.0 * n_dropped / n_dental if n_dental else 0.0,
            "dropped_npis": n_dropped_npis,
            "recoverable_rows": n_recoverable_rows,
            "recoverable_npis": n_recoverable_npis,
            "recovery_rate_of_drops_pct": 100.0 * n_recoverable_rows / n_dropped if n_dropped else 0.0,
        })

        print(
            f"  {ym}: {n_dental:>10,} dental | {n_dropped:>9,} dropped "
            f"({rows[-1]['drop_rate_pct']:5.2f}%) | {n_recoverable_rows:>9,} recoverable "
            f"({rows[-1]['recovery_rate_of_drops_pct']:5.2f}% of drops)"
        )

    # ---- aggregate report ----
    df = pd.DataFrame(rows)
    out_csv = args.output_dir / "coverage_report.csv"
    df.to_csv(out_csv, index=False)

    total_dental = int(df["hhs_dental_rows"].sum())
    total_merged = int(df["merged_rows"].sum())
    total_dropped = int(df["dropped_rows"].sum())
    total_recoverable = int(df["recoverable_rows"].sum())

    print(f"\n{'=' * 60}")
    print(f"OVERALL COVERAGE  (window: ±{args.window} months)")
    print(f"{'=' * 60}")
    print(f"  HHS dental rows (pre-merge)      : {total_dental:>14,}")
    print(f"  Merged rows (post-inner-join)    : {total_merged:>14,}  ({100*total_merged/total_dental:5.2f}%)")
    print(f"  Dropped rows                     : {total_dropped:>14,}  ({100*total_dropped/total_dental:5.2f}%)")
    print(f"  Recoverable with ±{args.window} mo window     : {total_recoverable:>14,}  "
          f"({100*total_recoverable/total_dropped:5.2f}% of drops, "
          f"{100*total_recoverable/total_dental:5.2f}% of total)")
    print(f"  Residual unrecoverable           : {total_dropped - total_recoverable:>14,}  "
          f"({100*(total_dropped-total_recoverable)/total_dental:5.2f}% of total)")
    print(f"\nPer-month breakdown saved to {out_csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
