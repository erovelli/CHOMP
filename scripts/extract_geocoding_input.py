"""Produce a deduplicated address list for geocoding.

Reads merged_hhs_nppes.csv (~22M rows) and emits one row per UNIQUE
practice address. This is the input file for the geocoding collaborator —
they geocode this short file (~tens of thousands of rows) instead of the
full claims table, dropping the query count by ~100-1000x.

Output: data/MergedHHS-NPI/unique_addresses.csv with columns:
    address_id              stable md5 hash of the normalized address
    address_full            single-line "LINE1, LINE2, CITY, STATE ZIP5"
                            ready to paste into any geocoder
    practice_address_line_1
    practice_address_line_2
    practice_city
    practice_state
    practice_zip5
    n_rows                  how many merged claim-rows reference this address
    n_claims                sum of claims_count across those rows
    total_paid              sum of total_amount_paid across those rows

Sorted by n_claims descending so the collaborator can geocode the highest-
volume addresses first if their budget runs out before the long tail.

Usage (from repo root):
    python scripts/extract_geocoding_input.py
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import pandas as pd

ADDR_COLS = [
    "practice_address_line_1",
    "practice_address_line_2",
    "practice_city",
    "practice_state",
    "practice_zip5",
]

USECOLS = ADDR_COLS + ["claims_count", "total_amount_paid"]
DTYPES = {c: "string" for c in ADDR_COLS} | {
    "claims_count": "Int64",
    "total_amount_paid": "float64",
}


def _normalize(s: pd.Series) -> pd.Series:
    """Uppercase + collapse whitespace + strip; keep NA as empty string."""
    return (
        s.fillna("")
        .astype(str)
        .str.upper()
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def _address_id(row_norm: pd.DataFrame) -> pd.Series:
    """Deterministic md5 hex over the pipe-joined normalized address fields."""
    joined = row_norm[ADDR_COLS].agg("|".join, axis=1)
    return joined.map(lambda s: hashlib.md5(s.encode("utf-8")).hexdigest())


def _address_full(row_raw: pd.DataFrame) -> pd.Series:
    """Single-line geocoder-friendly address using the raw NPPES values."""
    line1 = row_raw["practice_address_line_1"].fillna("").astype(str).str.strip()
    line2 = row_raw["practice_address_line_2"].fillna("").astype(str).str.strip()
    city = row_raw["practice_city"].fillna("").astype(str).str.strip()
    state = row_raw["practice_state"].fillna("").astype(str).str.strip()
    zip5 = row_raw["practice_zip5"].fillna("").astype(str).str.strip()

    parts1 = line1.where(line2 == "", line1 + " " + line2)
    return (parts1 + ", " + city + ", " + state + " " + zip5).str.replace(r"\s+", " ", regex=True).str.strip()


def main() -> int:
    data_root = Path("../data")
    default_output = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--output-dir", type=Path, default=default_output)
    p.add_argument("--chunksize", type=int, default=2_000_000, help="rows per pandas chunk (default 2M)")
    args = p.parse_args()

    merged_csv = args.output_dir / "merged_hhs_nppes.csv"
    out_csv = args.output_dir / "unique_addresses.csv"

    if not merged_csv.exists():
        print(f"error: {merged_csv} not found. Run merge_hhs_nppes.py first.", file=sys.stderr)
        return 2

    print(f"reading {merged_csv} in {args.chunksize:,}-row chunks...")
    chunk_aggs = []
    total_rows = 0
    for i, chunk in enumerate(
        pd.read_csv(merged_csv, usecols=USECOLS, dtype=DTYPES, chunksize=args.chunksize)
    ):
        total_rows += len(chunk)
        # Normalize once per chunk for grouping; keep raw as well so we can
        # surface the original NPPES casing in the output.
        for c in ADDR_COLS:
            chunk[c + "_norm"] = _normalize(chunk[c])
        norm_cols = [c + "_norm" for c in ADDR_COLS]

        agg = chunk.groupby(norm_cols, dropna=False).agg(
            n_rows=("claims_count", "size"),
            n_claims=("claims_count", "sum"),
            total_paid=("total_amount_paid", "sum"),
            # Keep the first-seen raw values for each address so we can show
            # the NPPES casing/spelling in the output. (After normalization
            # all variants for the same address collapse anyway.)
            practice_address_line_1=("practice_address_line_1", "first"),
            practice_address_line_2=("practice_address_line_2", "first"),
            practice_city=("practice_city", "first"),
            practice_state=("practice_state", "first"),
            practice_zip5=("practice_zip5", "first"),
        ).reset_index()
        chunk_aggs.append(agg)
        print(f"  chunk {i + 1}: {total_rows:,} rows seen, {sum(len(c) for c in chunk_aggs):,} unique-so-far")

    print(f"\nfinal aggregation across {len(chunk_aggs)} chunks...")
    combined = pd.concat(chunk_aggs, ignore_index=True)
    norm_cols = [c + "_norm" for c in ADDR_COLS]

    final = combined.groupby(norm_cols, dropna=False).agg(
        n_rows=("n_rows", "sum"),
        n_claims=("n_claims", "sum"),
        total_paid=("total_paid", "sum"),
        practice_address_line_1=("practice_address_line_1", "first"),
        practice_address_line_2=("practice_address_line_2", "first"),
        practice_city=("practice_city", "first"),
        practice_state=("practice_state", "first"),
        practice_zip5=("practice_zip5", "first"),
    ).reset_index()

    # Build address_id from the normalized columns. We can't use .rename to
    # drop the _norm suffix in-place because the raw columns of the same name
    # also live on `final` (as the "first"-aggregated values shown to humans),
    # and a rename with collision creates duplicate column names that bleed
    # NAs into the join. Build a clean DataFrame with just the normalized
    # values under the canonical ADDR_COLS names instead.
    norm_for_id = final[[c + "_norm" for c in ADDR_COLS]].copy()
    norm_for_id.columns = ADDR_COLS
    final["address_id"] = _address_id(norm_for_id)
    final["address_full"] = _address_full(final)

    out = final[
        [
            "address_id",
            "address_full",
            "practice_address_line_1",
            "practice_address_line_2",
            "practice_city",
            "practice_state",
            "practice_zip5",
            "n_rows",
            "n_claims",
            "total_paid",
        ]
    ].sort_values("n_claims", ascending=False)

    out.to_csv(out_csv, index=False)

    print(f"\n{'=' * 60}")
    print(f"  total merged rows scanned    : {total_rows:>14,}")
    print(f"  unique addresses             : {len(out):>14,}")
    print(f"  reduction factor             : {total_rows / len(out):>14,.0f}x")
    print(f"  top 1% addresses cover       : {100 * out.head(max(1, len(out) // 100))['n_claims'].sum() / out['n_claims'].sum():>13.1f}% of claims")
    print(f"  top 10% addresses cover      : {100 * out.head(max(1, len(out) // 10))['n_claims'].sum() / out['n_claims'].sum():>13.1f}% of claims")
    print(f"\nwrote {out_csv}")
    print(f"  share with collaborator. They geocode `address_full` (or the")
    print(f"  separate fields), and return a CSV with at minimum:")
    print(f"    address_id,latitude,longitude")
    print(f"  Then run scripts/join_geocoded.py to merge lat/lon back in.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
