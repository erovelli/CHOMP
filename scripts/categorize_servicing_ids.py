"""Categorize every HHS dental row by what kind of identifier appears in the
SERVICING_PROVIDER_NPI_NUM field, and report unique-ID / row / claim / dollar
totals per bucket. Answers "what % of dental claims fall outside the NPPES
universe, and why."

Buckets (in order of detection):
    NULL                            servicing_npi missing/empty/NA
    sentinel: all zeros             '0000000000'
    sentinel: nines pattern         '9999999999', '1999999992', etc.
    state-assigned: A-prefix        'A' followed by 9 alphanumerics (Atypical)
    state-assigned: M-prefix        'M' followed by 9 alphanumerics (state Medicaid)
    state-assigned: other letter    any other letter prefix
    NPI-format: matched same-month  10-digit numeric, in same-month NPPES
    NPI-format: unmatched any-month 10-digit numeric, never in any cached NPPES
    NPI-format: matched other-month 10-digit numeric, in some other month's NPPES
    other malformed                 mixed-letter-digit pattern not above

Reads the per-month hhs_dental/*.parquet cache (built by merge_hhs_nppes.py)
and the nppes_npi_cache/*.parquet (built by analyze_coverage.py). If the
NPPES cache is incomplete, NPI-format rows that COULD have been classified
as "matched other-month" will be undercounted; rebuild the NPPES cache by
running analyze_coverage.py first to make this exhaustive.

Usage (from worktree):
    python scripts/categorize_servicing_ids.py \\
        --output-dir ../../../data/MergedHHS-NPI
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from analyze_coverage import _load_npi_set  # noqa: E402

NINES_RE = re.compile(r"^[19]+$")
LETTER_PREFIX_RE = re.compile(r"^([A-Z])[A-Z0-9]{9}$")
NPI_RE = re.compile(r"^\d{10}$")


def categorize(npi: str | None) -> str:
    """Pure-string bucket; the NPPES match check happens later for NPI-format."""
    if npi is None or npi == "" or npi == "nan" or npi == "<NA>":
        return "NULL"
    s = str(npi).strip().upper()
    if s == "0000000000":
        return "sentinel: all zeros"
    if NINES_RE.fullmatch(s) and "9" in s:
        return "sentinel: nines pattern"
    m = LETTER_PREFIX_RE.match(s)
    if m:
        prefix = m.group(1)
        if prefix == "A":
            return "state-assigned: A-prefix (Atypical)"
        if prefix == "M":
            return "state-assigned: M-prefix (Medicaid)"
        return f"state-assigned: {prefix}-prefix"
    if NPI_RE.fullmatch(s):
        return "NPI-format"  # refined later by NPPES match check
    return "other malformed"


def main() -> int:
    data_root = Path("../data")
    default_nppes = data_root / "NPPES"
    default_output = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--nppes-dir", type=Path, default=default_nppes)
    p.add_argument("--output-dir", type=Path, default=default_output)
    args = p.parse_args()

    dental_dir = args.output_dir / "hhs_dental"
    cache_dir = args.output_dir / "nppes_npi_cache"

    if not dental_dir.is_dir():
        print(f"error: {dental_dir} not found.", file=sys.stderr)
        return 2

    months = sorted(p.stem for p in dental_dir.glob("*.parquet"))
    cached_months = sorted(p.stem for p in cache_dir.glob("*.parquet"))
    print(f"dental months: {len(months)}  ({months[0]} → {months[-1]})")
    print(f"NPPES cached months: {len(cached_months)}  ({cached_months[0] if cached_months else '-'} → {cached_months[-1] if cached_months else '-'})")
    if len(cached_months) < len(months):
        print(f"WARNING: NPPES cache incomplete ({len(cached_months)}/{len(months)}). "
              f"NPI-format 'matched other-month' counts will undercount. Run analyze_coverage.py "
              f"to build the rest of the cache, then re-run.")

    # Build a UNION of all cached NPPES NPIs (for the "ever in any NPPES" check)
    print("\nbuilding union of all cached NPPES NPI sets...")
    union_all_nppes: set[str] = set()
    for ym in cached_months:
        union_all_nppes |= _load_npi_set(ym, args.nppes_dir, cache_dir, False)
    print(f"  union size: {len(union_all_nppes):,} unique NPIs")

    # Aggregate per bucket
    bucket_unique: dict[str, set[str]] = defaultdict(set)
    bucket_rows: dict[str, int] = defaultdict(int)
    bucket_claims: dict[str, int] = defaultdict(int)
    bucket_paid: dict[str, float] = defaultdict(float)

    print("\nscanning per-month dental cache + classifying...")
    for ym in months:
        dental = pd.read_parquet(
            dental_dir / f"{ym}.parquet",
            columns=["servicing_npi", "claims_count", "total_amount_paid"],
        )
        # Classify
        same_npis = _load_npi_set(ym, args.nppes_dir, cache_dir, False) if ym in cached_months else set()
        npi_str = dental["servicing_npi"].astype(str)
        cats = npi_str.map(categorize)
        # Refine NPI-format bucket
        is_npi = cats == "NPI-format"
        if is_npi.any():
            in_same_month = npi_str.isin(same_npis)
            in_any = npi_str.isin(union_all_nppes)
            cats = cats.where(~is_npi, other="NPI-format: unmatched any-month")
            cats = cats.mask(is_npi & in_any, "NPI-format: matched other-month")
            cats = cats.mask(is_npi & in_same_month, "NPI-format: matched same-month")

        # Accumulate per category
        for cat, sub in dental.groupby(cats, dropna=False):
            ids = npi_str[sub.index].dropna().tolist()
            bucket_unique[cat].update(ids)
            bucket_rows[cat] += len(sub)
            bucket_claims[cat] += int(sub["claims_count"].fillna(0).sum())
            bucket_paid[cat] += float(sub["total_amount_paid"].fillna(0).sum())
        print(f"  {ym}: classified {len(dental):,} rows")

    # ---- Render report ----
    rows = []
    for cat in bucket_rows:
        rows.append({
            "bucket": cat,
            "unique_ids": len(bucket_unique[cat]),
            "row_count": bucket_rows[cat],
            "total_claims": bucket_claims[cat],
            "total_paid_usd": bucket_paid[cat],
        })
    df = pd.DataFrame(rows).sort_values("row_count", ascending=False)

    total_rows = df["row_count"].sum()
    total_claims = df["total_claims"].sum()
    total_paid = df["total_paid_usd"].sum()
    df["pct_of_rows"] = 100 * df["row_count"] / total_rows
    df["pct_of_claims"] = 100 * df["total_claims"] / total_claims
    df["pct_of_dollars"] = 100 * df["total_paid_usd"] / total_paid

    out_csv = args.output_dir / "servicing_id_categories.csv"
    df.to_csv(out_csv, index=False)

    print(f"\n{'=' * 100}")
    print(f"  HHS DENTAL SERVICING-ID CATEGORIES (across all {len(months)} months)")
    print(f"{'=' * 100}")
    pd.set_option("display.max_colwidth", 50)
    pd.set_option("display.width", 200)
    pd.set_option("display.float_format", lambda x: f"{x:,.2f}")
    print(df[["bucket", "unique_ids", "row_count", "pct_of_rows", "pct_of_claims", "pct_of_dollars", "total_paid_usd"]].to_string(index=False))
    print(f"\n  totals: {total_rows:,} rows, {total_claims:,} claims, ${total_paid:,.2f} paid")
    print(f"\nsaved per-bucket detail to {out_csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
