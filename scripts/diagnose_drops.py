"""Diagnose why ±1-month-window recovery is unexpectedly low.

For a chosen month:
  1. Sanity-check the comparison logic by sampling NPIs that successfully
     merged and verifying they're in the same-month NPPES set (should be 100%).
  2. Identify the dropped NPIs (in HHS dental but not in same-month NPPES).
  3. For each dropped NPI, search across ALL 84 NPPES caches to find which
     months (if any) the NPI appears in.
  4. Bucket the dropped NPIs by their NPPES coverage:
     - "never in any NPPES"     → genuine HHS-side issue (malformed, foreign,
                                   historic deactivated-and-purged, ...)
     - "in some months, not the claim month" → timing/coverage gap
       - sub-bucket: present in ±1?  ±3?  ±12?  any?

This tells us whether the low recovery rate is correct (most drops are
genuinely never-in-NPPES) or whether something in analyze_coverage.py is
miscounting.

Usage (from worktree, with explicit data paths):
    python scripts/diagnose_drops.py --month 201810 \\
        --nppes-dir ../../../data/NPPES \\
        --output-dir ../../../data/MergedHHS-NPI

Reads the same nppes_npi_cache that analyze_coverage.py builds. Run
analyze_coverage.py first to build the cache, or this script will build
it as a side effect.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from analyze_coverage import _load_npi_set, _shift_yyyymm  # noqa: E402


def main() -> int:
    data_root = Path("../data")
    default_nppes = data_root / "NPPES"
    default_output = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--month", type=str, default="201810", help="YYYYMM month to diagnose (default: 201810)")
    p.add_argument("--sample-size", type=int, default=20, help="number of dropped NPIs to print row-by-row (default 20)")
    p.add_argument("--nppes-dir", type=Path, default=default_nppes)
    p.add_argument("--output-dir", type=Path, default=default_output)
    args = p.parse_args()

    target_month = args.month
    dental_dir = args.output_dir / "hhs_dental"
    cache_dir = args.output_dir / "nppes_npi_cache"

    # ---- 1. Sanity-check the comparison logic ----
    print(f"=== Sanity check on {target_month} ===")
    target_dental = pd.read_parquet(dental_dir / f"{target_month}.parquet", columns=["servicing_npi"])
    same_month_npis = _load_npi_set(target_month, args.nppes_dir, cache_dir, False)
    print(f"  HHS dental rows in {target_month}      : {len(target_dental):,}")
    print(f"  Unique HHS NPIs in {target_month}      : {target_dental['servicing_npi'].nunique():,}")
    print(f"  NPIs in NPPES same-month               : {len(same_month_npis):,}")

    # Pick 5 NPIs that should match (sample from HHS), verify they're in NPPES set.
    target_dental["servicing_npi"] = target_dental["servicing_npi"].astype(str)
    sample_hhs = (
        target_dental["servicing_npi"]
        .dropna()
        .drop_duplicates()
        .sample(n=min(5, target_dental["servicing_npi"].nunique()), random_state=42)
        .tolist()
    )
    print(f"\n  5 random HHS NPIs from {target_month}; checking each against same-month NPPES set:")
    for npi in sample_hhs:
        in_set = npi in same_month_npis
        print(f"    {npi!r:<14} in NPPES same month? {in_set}")
    print("  (If any of these are False, the HHS column has at least some genuinely-")
    print("   unmatched NPIs — that's expected. If they're ALL False, something's wrong.)")

    # ---- 2. Identify dropped NPIs ----
    npi_counts = target_dental["servicing_npi"].value_counts(dropna=False)
    npi_counts.index = npi_counts.index.astype(str)
    dropped_mask = ~npi_counts.index.isin(same_month_npis)
    dropped_npi_counts = npi_counts[dropped_mask]

    print(f"\n=== Dropped NPIs in {target_month} ===")
    print(f"  Unique dropped NPIs                    : {len(dropped_npi_counts):,}")
    print(f"  Total dropped rows                     : {dropped_npi_counts.sum():,}")
    if "<NA>" in dropped_npi_counts.index or "nan" in dropped_npi_counts.index:
        n_na = dropped_npi_counts.get("<NA>", 0) + dropped_npi_counts.get("nan", 0)
        print(f"  ...of which servicing_npi is NULL     : {n_na:,} (these can never match)")

    # ---- 3. For each dropped NPI, search across all months' NPPES caches ----
    all_months = sorted(p.stem for p in cache_dir.glob("*.parquet"))
    if not all_months:
        print(f"\nerror: no NPPES caches found in {cache_dir}. Run analyze_coverage.py first.", file=sys.stderr)
        return 2
    print(f"\n=== Cross-month NPPES search ({len(all_months)} months in cache) ===")
    print(f"  Loading union of ALL NPPES NPIs (this is the 'ever in any month' set)...")

    # Build per-month sets and accumulate union
    month_sets: dict[str, set[str]] = {}
    for ym in all_months:
        month_sets[ym] = _load_npi_set(ym, args.nppes_dir, cache_dir, False)
    union_all = set().union(*month_sets.values())
    print(f"  Total unique NPIs across all 84 months : {len(union_all):,}")

    dropped_npis_set = set(dropped_npi_counts.index) - {"<NA>", "nan"}

    # Bucket: never in any vs. present somewhere
    in_any = dropped_npis_set & union_all
    never_in_any = dropped_npis_set - union_all

    print(f"\n  Dropped NPIs NEVER in any of the 84 NPPES files: {len(never_in_any):,} unique "
          f"({100 * len(never_in_any) / max(1, len(dropped_npis_set)):.1f}% of dropped NPIs)")
    rows_never = int(dropped_npi_counts[dropped_npi_counts.index.isin(never_in_any)].sum())
    print(f"    → row count: {rows_never:,} "
          f"({100 * rows_never / max(1, dropped_npi_counts.sum()):.1f}% of dropped rows)")

    print(f"\n  Dropped NPIs present in SOME other month       : {len(in_any):,} unique")
    rows_in_any = int(dropped_npi_counts[dropped_npi_counts.index.isin(in_any)].sum())
    print(f"    → row count: {rows_in_any:,} "
          f"({100 * rows_in_any / max(1, dropped_npi_counts.sum()):.1f}% of dropped rows)")

    # For the "in any" bucket, build a reverse index: NPI -> sorted list of months present
    print(f"\n  Within the 'present in some month' bucket, breakdown by closest month to {target_month}:")
    npi_to_months: dict[str, list[str]] = {npi: [] for npi in in_any}
    for ym, npi_set in month_sets.items():
        intersection = npi_set & in_any
        for npi in intersection:
            npi_to_months[npi].append(ym)
    for npi in npi_to_months:
        npi_to_months[npi].sort()

    # Distance-from-target_month bucketing
    def month_distance(a: str, b: str) -> int:
        ay, am = int(a[:4]), int(a[4:])
        by, bm = int(b[:4]), int(b[4:])
        return abs((ay - by) * 12 + (am - bm))

    bucket_stats = {1: 0, 3: 0, 6: 0, 12: 0, 999: 0}
    bucket_rows = {1: 0, 3: 0, 6: 0, 12: 0, 999: 0}
    for npi, months in npi_to_months.items():
        # Closest month to target
        min_dist = min(month_distance(target_month, m) for m in months)
        rows = int(dropped_npi_counts.get(npi, 0))
        for threshold in (1, 3, 6, 12, 999):
            if min_dist <= threshold:
                bucket_stats[threshold] += 1
                bucket_rows[threshold] += rows
                break

    for threshold, label in [(1, "±1 mo"), (3, "±3 mo"), (6, "±6 mo"), (12, "±12 mo"), (999, ">12 mo")]:
        n = bucket_stats[threshold]
        rows = bucket_rows[threshold]
        print(f"    closest within {label:<8}: {n:>6,} NPIs / {rows:>9,} rows "
              f"({100 * rows / max(1, dropped_npi_counts.sum()):5.2f}% of dropped rows)")

    # ---- 4. Sample some specific dropped NPIs for human inspection ----
    print(f"\n=== Sample {args.sample_size} dropped NPIs ({target_month}) ===")
    print("  (look these up at https://npiregistry.cms.hhs.gov/ to confirm)")
    sample = list(dropped_npis_set)[:args.sample_size]
    for npi in sample:
        rows = int(dropped_npi_counts.get(npi, 0))
        if npi in npi_to_months:
            months = npi_to_months[npi]
            closest = min(months, key=lambda m: month_distance(target_month, m))
            dist = month_distance(target_month, closest)
            print(f"    {npi:>12}  rows={rows:>4}  found in {len(months):>2} mo, "
                  f"closest={closest} (Δ={dist:>2} mo)")
        else:
            print(f"    {npi:>12}  rows={rows:>4}  NEVER in any of the 84 NPPES files")

    print("\n=== Verdict ===")
    if rows_never / max(1, dropped_npi_counts.sum()) > 0.8:
        print("  >80% of dropped rows have NPIs never present in ANY NPPES month.")
        print("  This is a structural HHS-side phenomenon, not a timing gap.")
        print("  Likely causes: malformed NPIs in HHS, foreign providers, or NPIs")
        print("  registered after Dec 2024 (post-dataset NBER snapshot).")
        print("  Widening the merge window will not help these rows.")
    elif bucket_rows[1] / max(1, dropped_npi_counts.sum()) > 0.5:
        print("  >50% of dropped rows have NPIs that DO appear in ±1 month.")
        print("  The low recovery in analyze_coverage.py would indicate a bug in")
        print("  that script's comparison logic. Compare counts:")
        print(f"    diagnose_drops.py says: {bucket_rows[1]:,} rows recoverable in ±1")
        print("    Compare against analyze_coverage.py's reported recoverable count for this month.")
    else:
        print("  Mixed picture. Look at the bucket breakdown above to decide.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
