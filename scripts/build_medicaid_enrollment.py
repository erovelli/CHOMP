#!/usr/bin/env python3
"""Build ACS Medicaid-enrollment denominator NDJSONs for the front end.

Reads the two CSVs emitted by fetch_acs_medicaid.py:

    data/ACS medicaid enrollment/acs_medicaid_county.csv   (geoid = 5-digit FIPS)
    data/ACS medicaid enrollment/acs_medicaid_zcta.csv     (geoid = 5-digit ZCTA)

Emits three NDJSON files into public/data/, one record per geography keyed by
its UI id, listing medicaid_enrollees by year:

    medicaid_enrollment_state.json    key = USPS postal   (state = sum of counties)
    medicaid_enrollment_county.json   key = 5-digit FIPS  (direct)
    medicaid_enrollment_zip3.json     key = 3-digit ZIP3  (sum of ZCTAs sharing the first 3 digits)

Each NDJSON line: {"<id>": [{"year": "2018", "medicaid_enrollees": 1234567}, ...]}

These mirror the shape of the existing provider-procedure aggregates so they
can flow through the same fetchNDJSON parser in src/lib/dataService.ts.

Rollup notes:
  - State postal is derived from the county FIPS state prefix via FIPS_TO_USPS
    (same mapping used by build_aggregates.py).
  - ZIP3 is LEFT(zcta, 3). ZCTAs are Census tabulations of ZIP areas; first-3
    rollup matches the front end's zip3 grain. This is an approximation —
    ZCTA boundaries don't perfectly nest under USPS ZIP3s — but it's the
    standard denominator construction and aligns with how zip3 totals are
    built in build_aggregates.py.
  - Year is the ACS 5-year endpoint year (e.g. "2023" = pool 2019-2023).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ACS_DIR = REPO_ROOT / "data" / "ACS medicaid enrollment"
DEFAULT_OUT = REPO_ROOT / "public" / "data"

# 2-digit state FIPS -> USPS postal. Same table as build_aggregates.py.
FIPS_TO_USPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
    "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}


def load_county(acs_dir: Path) -> pd.DataFrame:
    df = pd.read_csv(
        acs_dir / "acs_medicaid_county.csv",
        usecols=["year", "geoid", "state", "medicaid_enrollees"],
        dtype={"year": int, "geoid": str, "state": str},
    )
    df["geoid"] = df["geoid"].str.zfill(5)
    df["state"] = df["state"].str.zfill(2)
    df["medicaid_enrollees"] = df["medicaid_enrollees"].fillna(0).astype(int)
    return df


def load_zcta(acs_dir: Path) -> pd.DataFrame:
    df = pd.read_csv(
        acs_dir / "acs_medicaid_zcta.csv",
        usecols=["year", "geoid", "medicaid_enrollees"],
        dtype={"year": int, "geoid": str},
    )
    df["geoid"] = df["geoid"].str.zfill(5)
    df["medicaid_enrollees"] = df["medicaid_enrollees"].fillna(0).astype(int)
    return df


def write_ndjson(
    df: pd.DataFrame, key_col: str, out_path: Path
) -> tuple[int, int]:
    """df has columns [key_col, 'year', 'medicaid_enrollees']. One JSON-line per key."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df = df.sort_values([key_col, "year"])
    n_keys = 0
    n_rows = 0
    with out_path.open("w", encoding="utf-8") as fh:
        for key, sub in df.groupby(key_col, sort=False):
            records = [
                {"year": str(int(y)), "medicaid_enrollees": int(e)}
                for y, e in zip(sub["year"], sub["medicaid_enrollees"])
            ]
            fh.write(json.dumps({key: records}, separators=(",", ":")))
            fh.write("\n")
            n_keys += 1
            n_rows += len(records)
    return n_keys, n_rows


def build_state(county: pd.DataFrame) -> pd.DataFrame:
    df = county.copy()
    df["postal"] = df["state"].map(FIPS_TO_USPS)
    df = df.dropna(subset=["postal"])
    out = (
        df.groupby(["postal", "year"], as_index=False)["medicaid_enrollees"]
        .sum()
    )
    return out


def build_county(county: pd.DataFrame) -> pd.DataFrame:
    return county[["geoid", "year", "medicaid_enrollees"]].copy()


def build_zip3(zcta: pd.DataFrame) -> pd.DataFrame:
    df = zcta.copy()
    df["zip3"] = df["geoid"].str[:3]
    out = (
        df.groupby(["zip3", "year"], as_index=False)["medicaid_enrollees"]
        .sum()
    )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--acs-dir", type=Path, default=DEFAULT_ACS_DIR)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    county = load_county(args.acs_dir)
    zcta = load_zcta(args.acs_dir)
    print(
        f"loaded {len(county):,} county-year rows, {len(zcta):,} ZCTA-year rows"
    )

    state_df = build_state(county)
    county_df = build_county(county)
    zip3_df = build_zip3(zcta)

    for label, df, key, fname in [
        ("state", state_df, "postal", "medicaid_enrollment_state.json"),
        ("county", county_df, "geoid", "medicaid_enrollment_county.json"),
        ("zip3", zip3_df, "zip3", "medicaid_enrollment_zip3.json"),
    ]:
        n_keys, n_rows = write_ndjson(df, key, args.out / fname)
        print(f"  {label:6} -> {fname}  ({n_keys:,} keys, {n_rows:,} rows)")


if __name__ == "__main__":
    main()
