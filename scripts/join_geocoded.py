"""Merge the collaborator's geocoded output (address_id -> lat/lon) back
into merged_hhs_nppes.csv, producing merged_hhs_nppes_geo.csv.

The address_id is recomputed on each merged row via the same normalization
used by extract_geocoding_input.py, so this script is robust to the
collaborator dropping/reordering rows or columns in their geocoded output —
they only need to preserve the address_id column.

Inputs (defaults):
    data/MergedHHS-NPI/merged_hhs_nppes.csv          (the big merge)
    data/MergedHHS-NPI/geocoded_addresses.csv        (from collaborator)

Required columns in geocoded_addresses.csv:
    address_id           must match the values in unique_addresses.csv
    latitude
    longitude

Any extra columns the collaborator includes (geocoding confidence,
matched address, etc.) are passed through to the output.

Output:
    data/MergedHHS-NPI/merged_hhs_nppes_geo.csv

Usage (from repo root):
    python scripts/join_geocoded.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from extract_geocoding_input import ADDR_COLS, _address_id, _normalize  # noqa: E402


def main() -> int:
    data_root = Path("../data")
    default_dir = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--merged-csv", type=Path, default=default_dir / "merged_hhs_nppes.csv")
    p.add_argument("--geocoded-csv", type=Path, default=default_dir / "geocoded_addresses.csv")
    p.add_argument("--output-csv", type=Path, default=default_dir / "merged_hhs_nppes_geo.csv")
    p.add_argument("--chunksize", type=int, default=2_000_000)
    args = p.parse_args()

    if not args.merged_csv.exists():
        print(f"error: {args.merged_csv} not found.", file=sys.stderr)
        return 2
    if not args.geocoded_csv.exists():
        print(f"error: {args.geocoded_csv} not found.", file=sys.stderr)
        return 2

    print(f"loading geocoded addresses from {args.geocoded_csv}...")
    geo = pd.read_csv(args.geocoded_csv)
    if "address_id" not in geo.columns:
        print("error: geocoded CSV must have an 'address_id' column.", file=sys.stderr)
        return 2
    geo = geo.set_index("address_id")
    print(f"  {len(geo):,} geocoded addresses, {len(geo.columns)} extra columns: {list(geo.columns)}")

    print(f"\nstreaming {args.merged_csv} in {args.chunksize:,}-row chunks "
          f"and writing to {args.output_csv}...")
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    if args.output_csv.exists():
        args.output_csv.unlink()  # fresh write

    total_rows = 0
    matched_rows = 0
    for i, chunk in enumerate(pd.read_csv(args.merged_csv, chunksize=args.chunksize, dtype="string")):
        total_rows += len(chunk)
        # Recompute address_id on each merged row using the same normalization
        norm = pd.DataFrame({c: _normalize(chunk[c]) for c in ADDR_COLS})
        chunk["address_id"] = _address_id(norm)
        # Join geocoded fields
        joined = chunk.merge(geo, left_on="address_id", right_index=True, how="left")
        matched_rows += joined["latitude"].notna().sum() if "latitude" in joined.columns else 0

        # Write header on first chunk only
        joined.to_csv(args.output_csv, mode="a", header=(i == 0), index=False)
        print(f"  chunk {i + 1}: {total_rows:>12,} rows written, {matched_rows:>12,} with lat/lon")

    print(f"\n{'=' * 60}")
    print(f"  total rows                     : {total_rows:>14,}")
    print(f"  rows with lat/lon              : {matched_rows:>14,}  "
          f"({100*matched_rows/total_rows:.2f}%)")
    print(f"  rows missing lat/lon           : {total_rows - matched_rows:>14,}  "
          f"({100*(total_rows-matched_rows)/total_rows:.2f}%)")
    print(f"\noutput: {args.output_csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
