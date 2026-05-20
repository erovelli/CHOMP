"""Merge the geocoder's output (address_id -> lat/lon + county) back into
merged_hhs_nppes.csv, producing merged_hhs_nppes_geo.csv.

The geocoding collaborator runs the deduplicated address list through
ArcGIS and returns Dental_Provider_Locations.csv -- the unique-addresses
file we sent, with ArcGIS columns appended. This script keeps six of
them and renames to canonical snake_case:

    address_id  -> address_id       (join key)
    Status      -> geocode_status   'M' match, 'T' tentative, 'U' unmatched
    CountyFIPS  -> county_fips       5-digit zero-padded; NA for territories
    CountyNAME  -> county_name
    Latitude    -> latitude          NA for the 'U' rows that didn't geocode
    Longitude   -> longitude

`address_id` is recomputed on every merged claim row using the same
normalization extract_geocoding_input.py applied, so the join survives
the geocoder dropping/reordering rows or columns -- it only needs to
preserve the address_id column.

Every claim row that ends up without coordinates is sorted into one of
two failure buckets so the loss is attributable:

    geocoder_unmatched  the address_id DID join, but the geocoder placed
                        it as Status 'U' with no lat/lon -- the
                        collaborator's geocoder could not locate it.
    join_miss           the address_id matched no row in the geocoded
                        file at all -- a join-side problem (stale
                        geocoded file, or address normalization drift).

A per-address ledger of every failure is written to geocode_failures.csv.
`join_miss` rows, unused geocoded addresses, or an n_rows mismatch make
the script exit non-zero; `geocoder_unmatched` is expected loss (see L13)
and does not.

Inputs (defaults; data/ lives inside the repo and is git-ignored):
    data/MergedHHS-NPI/merged_hhs_nppes.csv          (the big merge)
    data/Geocoded/Dental_Provider_Locations.csv      (from collaborator)

Outputs:
    data/MergedHHS-NPI/merged_hhs_nppes_geo.csv      (claims + geo)
    data/MergedHHS-NPI/geocode_failures.csv          (per-address failures)

Usage (from repo root):
    python scripts/join_geocoded.py
    python scripts/join_geocoded.py --geocoded-csv path/to/other.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from extract_geocoding_input import ADDR_COLS, _address_id, _normalize  # noqa: E402

# ArcGIS column -> canonical name. These six are all we keep from the
# geocoder output; the rest (match diagnostics, echoed input fields) are
# dropped so they don't bloat every claim row in the output.
GEOCODE_COLUMNS = {
    "address_id": "address_id",
    "Status": "geocode_status",
    "CountyFIPS": "county_fips",
    "CountyNAME": "county_name",
    "Latitude": "latitude",
    "Longitude": "longitude",
}


def _data_root() -> Path:
    """data/ lives inside the repo (see .gitignore); scripts/ is one down."""
    return Path(__file__).resolve().parents[1] / "data"


def load_geocoded(path: Path) -> pd.DataFrame:
    """Read the geocoder output, keep+rename the six columns we use, pad
    county_fips to 5 digits, and return a frame indexed by address_id."""
    # utf-8-sig: the ArcGIS export carries a BOM on its first column.
    geo = pd.read_csv(
        path, usecols=list(GEOCODE_COLUMNS), dtype="string", encoding="utf-8-sig"
    )
    geo = geo.rename(columns=GEOCODE_COLUMNS)

    # County FIPS is 5 digits (SSCCC). Some tools strip the leading zero on
    # the ~10% of counties with FIPS 0XXXX; re-pad defensively. Empty -> NA
    # so we never fabricate "00000" for territory rows that have no FIPS.
    cf = geo["county_fips"].str.strip()
    geo["county_fips"] = cf.mask(cf == "", pd.NA).str.zfill(5)

    dups = int(geo["address_id"].duplicated().sum())
    if dups:
        print(f"warning: {dups:,} duplicate address_id in geocoded file; keeping first")
        geo = geo.drop_duplicates("address_id")

    return geo.set_index("address_id")


def _load_geocoded_meta(path: Path) -> pd.DataFrame:
    """Read the address-level context columns the failure ledger uses:
    n_rows (claim rows the extract step recorded) and address_full.
    Whichever are absent are simply skipped."""
    cols = pd.read_csv(path, nrows=0, encoding="utf-8-sig").columns
    want = [c for c in ("address_id", "n_rows", "address_full") if c in cols]
    meta = pd.read_csv(path, usecols=want, dtype="string", encoding="utf-8-sig")
    return meta.drop_duplicates("address_id").set_index("address_id")


def report(
    geocoded_csv: Path,
    geo: pd.DataFrame,
    seen_counts: pd.Series,
    total_rows: int,
    located_rows: int,
    failures_csv: Path,
) -> bool:
    """Print the results + failure ledger, write geocode_failures.csv, and
    run the integrity checks. Returns True only if the join is sound --
    expected `geocoder_unmatched` loss does not count against it."""
    geocoded_ids = set(geo.index)
    seen_ids = set(seen_counts.index)
    no_coords = set(geo.index[geo["latitude"].isna()])

    # Two failure buckets, by the address_ids that produced them.
    join_miss = sorted(seen_ids - geocoded_ids)
    geocoder_fail = sorted((seen_ids & geocoded_ids) & no_coords)

    def rows_for(ids: list[str]) -> int:
        return int(seen_counts.reindex(ids).sum()) if ids else 0

    jm_rows = rows_for(join_miss)
    gf_rows = rows_for(geocoder_fail)
    failed_rows = jm_rows + gf_rows

    def pct(n: int) -> str:
        return f"{100 * n / total_rows:.2f}%" if total_rows else "n/a"

    bar = "=" * 70
    print(f"\n{bar}\n  RESULTS\n{bar}")
    print(f"  total claim rows               : {total_rows:>14,}")
    print(f"  located (lat/lon present)      : {located_rows:>14,}  ({pct(located_rows)})")
    print(f"  failed (no coordinates)        : {failed_rows:>14,}  ({pct(failed_rows)})")

    print(f"\n{bar}\n  FAILURES BY REASON\n{bar}")
    print(f"  {'reason':<34}{'addresses':>11}{'claim rows':>15}")
    print(f"  {'-' * 60}")
    print(f"  {'geocoder_unmatched':<34}{len(geocoder_fail):>11,}{gf_rows:>15,}")
    print(f"  {'join_miss':<34}{len(join_miss):>11,}{jm_rows:>15,}")
    print(f"  {'-' * 60}")
    print(f"  {'TOTAL FAILED':<34}{len(geocoder_fail) + len(join_miss):>11,}{failed_rows:>15,}")
    print("  geocoder_unmatched -> collaborator's geocoder returned no match")
    print("                        (Status 'U'); expected loss, see L13.")
    print("  join_miss          -> address_id matched no geocoded row; a")
    print("                        join-side problem (stale file / drift).")

    # Per-address failure ledger.
    meta = _load_geocoded_meta(geocoded_csv)
    full = meta["address_full"] if "address_full" in meta.columns else pd.Series(dtype="string")
    records = [
        {
            "address_id": aid,
            "failure_reason": "geocoder_unmatched",
            "n_claim_rows": int(seen_counts[aid]),
            "geocode_status": geo.at[aid, "geocode_status"],
            "address_full": full.get(aid, pd.NA),
        }
        for aid in geocoder_fail
    ] + [
        {
            "address_id": aid,
            "failure_reason": "join_miss",
            "n_claim_rows": int(seen_counts[aid]),
            "geocode_status": pd.NA,
            "address_full": pd.NA,
        }
        for aid in join_miss
    ]
    fail_df = pd.DataFrame(
        records,
        columns=["address_id", "failure_reason", "n_claim_rows", "geocode_status", "address_full"],
    ).sort_values(["failure_reason", "n_claim_rows"], ascending=[True, False])
    failures_csv.parent.mkdir(parents=True, exist_ok=True)
    fail_df.to_csv(failures_csv, index=False)
    print(f"  per-address ledger ({len(fail_df):,} addresses) -> {failures_csv}")

    # Integrity checks: things that should never happen on a sound run.
    print(f"\n{bar}\n  QUALITY CHECKS\n{bar}")
    ok = True

    unused = geocoded_ids - seen_ids
    if unused:
        ok = False
        print(f"  unused geocoded addresses      : {len(unused):>14,}  <<< stale geocoded file?")
    else:
        print(f"  unused geocoded addresses      : {0:>14,}  OK")

    if jm_rows:
        ok = False
        print(f"  join_miss claim rows           : {jm_rows:>14,}  <<< join failed, investigate")
    else:
        print(f"  join_miss claim rows           : {0:>14,}  OK")

    if "n_rows" in meta.columns:
        expected = meta["n_rows"].astype("Int64")
        common = sorted(geocoded_ids & seen_ids)
        exp = expected.reindex(common).fillna(0).astype("int64")
        act = seen_counts.reindex(common).fillna(0).astype("int64")
        n_mism = int((exp != act).sum())
        if n_mism:
            ok = False
            print(f"  n_rows reconciliation          : {n_mism:>14,}  addresses disagree <<<")
        else:
            print(f"  n_rows reconciliation          : {len(common):>14,}  addresses match  OK")
    else:
        print("  n_rows reconciliation          :  skipped (no n_rows column)")

    print(f"{bar}")
    print("  RESULT: " + ("all checks passed" if ok else "PROBLEMS FOUND (see above)"))
    print(f"{bar}")
    return ok


def main() -> int:
    data_root = _data_root()
    merged_dir = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--merged-csv", type=Path, default=merged_dir / "merged_hhs_nppes.csv")
    p.add_argument(
        "--geocoded-csv", type=Path,
        default=data_root / "Geocoded" / "Dental_Provider_Locations.csv",
    )
    p.add_argument("--output-csv", type=Path, default=merged_dir / "merged_hhs_nppes_geo.csv")
    p.add_argument(
        "--failures-csv", type=Path, default=None,
        help="defaults to geocode_failures.csv beside --output-csv",
    )
    p.add_argument("--chunksize", type=int, default=2_000_000)
    args = p.parse_args()
    if args.failures_csv is None:
        args.failures_csv = args.output_csv.parent / "geocode_failures.csv"

    if not args.merged_csv.exists():
        print(f"error: {args.merged_csv} not found.", file=sys.stderr)
        return 2
    if not args.geocoded_csv.exists():
        print(f"error: {args.geocoded_csv} not found.", file=sys.stderr)
        return 2

    print(f"loading geocoded locations from {args.geocoded_csv}...")
    geo = load_geocoded(args.geocoded_csv)
    n_no_latlon = int(geo["latitude"].isna().sum())
    n_no_county = int(geo["county_fips"].isna().sum())
    status = geo["geocode_status"].value_counts(dropna=False)
    print(
        f"  {len(geo):,} unique addresses | {n_no_latlon:,} without lat/lon | "
        f"{n_no_county:,} without county FIPS"
    )
    print("  geocode_status: " + ", ".join(f"{k}={v:,}" for k, v in status.items()))

    print(
        f"\nstreaming {args.merged_csv} in {args.chunksize:,}-row chunks "
        f"-> {args.output_csv}..."
    )
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    if args.output_csv.exists():
        args.output_csv.unlink()  # fresh write

    total_rows = 0
    located_rows = 0  # rows whose joined address had usable lat/lon
    seen_counts = pd.Series(dtype="int64")  # address_id -> claim rows seen
    for i, chunk in enumerate(
        pd.read_csv(args.merged_csv, chunksize=args.chunksize, dtype="string")
    ):
        total_rows += len(chunk)
        # Recompute address_id on each merged row with the same normalization
        # extract_geocoding_input.py used, then join the geocoded fields.
        norm = pd.DataFrame({c: _normalize(chunk[c]) for c in ADDR_COLS})
        chunk["address_id"] = _address_id(norm)
        seen_counts = seen_counts.add(
            chunk["address_id"].value_counts(), fill_value=0
        )
        joined = chunk.merge(geo, left_on="address_id", right_index=True, how="left")
        located_rows += int(joined["latitude"].notna().sum())

        joined.to_csv(args.output_csv, mode="a", header=(i == 0), index=False)
        print(f"  chunk {i + 1}: {total_rows:>12,} rows | {located_rows:>12,} located")

    seen_counts = seen_counts.astype("int64")
    print(f"\noutput: {args.output_csv}")

    ok = report(
        args.geocoded_csv, geo, seen_counts, total_rows, located_rows, args.failures_csv
    )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
