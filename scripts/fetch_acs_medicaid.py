"""Fetch ACS 5-year table C27007 (Medicaid/Means-Tested Public Coverage by Sex
by Age) for every US county and ZCTA, for each endpoint year 2018-2024.

Produces the two ACS inputs called out in the workflow diagram:
    ../data/ACS/acs_medicaid_county.csv   <- county-year panel
    ../data/ACS/acs_medicaid_zcta.csv     <- ZCTA-year panel

Each row gives the number of people with Medicaid coverage in that geography,
broken out by the six sex x age cells C27007 publishes, plus a pre-summed
medicaid_enrollees column to use as a per-enrollee denominator.

Why ACS 5-year (not 1-year):
  - ACS 1-year is only published for geographies with population >= 65,000,
    which excludes ~75% of US counties and effectively all ZCTAs.
  - C27007 is published at ZCTA level only in the 5-year release.
  - So 5-year is the only option that gives complete coverage of every
    county and ZCTA in the country.
  - The label year is the ENDPOINT of a rolling 5-year pool, e.g. the
    "2023" file is pooled 2019-2023. Consecutive years overlap heavily.

Cell suppression / missing values:
  - ACS does not suppress cells the way Medicaid claims data does. Instead
    it publishes a margin of error, and uses a small set of sentinel "jam"
    values for cells that cannot be released (sample too small, controlled
    to zero, etc.). This script maps every known jam value to NaN.

Usage (from repo root):
    set CENSUS_API_KEY=...                                  # PowerShell: $env:CENSUS_API_KEY="..."
    python scripts/fetch_acs_medicaid.py
    python scripts/fetch_acs_medicaid.py --force            # re-download even if cached
    python scripts/fetch_acs_medicaid.py --years 2022 2023  # subset of years
    python scripts/fetch_acs_medicaid.py --geo county       # only counties

Requires: pandas>=2.0, requests (see requirements.txt).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

API_BASE = "https://api.census.gov/data"

# C27007 = Medicaid/Means-Tested Public Coverage by Sex by Age.
# Universe: civilian noninstitutionalized population.
# We pull the universe (_001) plus the six "with Medicaid" cells. The "no
# Medicaid" cells are recoverable as universe - sum(with), so we skip them
# to keep the payload small.
UNIVERSE_VAR = "C27007_001"
WITH_MEDICAID_VARS = [
    "C27007_004",  # Male, under 19, with Medicaid
    "C27007_007",  # Male, 19-64,    with Medicaid
    "C27007_010",  # Male, 65+,      with Medicaid
    "C27007_014",  # Female, under 19, with Medicaid
    "C27007_017",  # Female, 19-64,    with Medicaid
    "C27007_020",  # Female, 65+,      with Medicaid
]
ALL_VARS = [UNIVERSE_VAR] + WITH_MEDICAID_VARS

# ACS sentinel "jam" values. Treat as missing.
# https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html
ACS_JAM_VALUES = {
    -666666666,  # estimate not displayable / sample too small
    -999999999,  # estimate cannot be displayed
    -888888888,  # not applicable
    -222222222,  # estimate / MOE could not be computed
    -333333333,  # ratio MOE could not be computed
    -555555555,  # controlled to zero (no sampling error)
    -111111111,  # estimate not available
}

DEFAULT_YEARS = list(range(2018, 2025))  # 2018..2024 inclusive
DEFAULT_GEOS = ("county", "zcta")


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def data_dir() -> Path:
    # Mirror merge_hhs_nppes.py: data/ lives next to the repo, not inside it.
    out = repo_root().parent / "data" / "ACS"
    out.mkdir(parents=True, exist_ok=True)
    (out / "raw").mkdir(exist_ok=True)
    return out


def build_url(year: int, geo: str) -> str:
    # Estimates and MOEs in one shot.
    vars_with_moe = []
    for v in ALL_VARS:
        vars_with_moe.append(f"{v}E")
        vars_with_moe.append(f"{v}M")
    get_clause = ",".join(["NAME"] + vars_with_moe)

    if geo == "county":
        # Every county in every state.
        for_clause = "for=county:*&in=state:*"
    elif geo == "zcta":
        # ZCTAs are not nested under state in ACS5; wildcard returns all.
        # The literal space in the geo name must be URL-encoded.
        for_clause = "for=zip%20code%20tabulation%20area:*"
    else:
        raise ValueError(f"unknown geo: {geo}")

    return f"{API_BASE}/{year}/acs/acs5?get={get_clause}&{for_clause}"


def fetch_one(year: int, geo: str, api_key: str, timeout: int = 120) -> pd.DataFrame:
    url = build_url(year, geo) + f"&key={api_key}"
    # Don't print the key.
    safe = url.replace(api_key, "***")
    print(f"  GET {safe}", flush=True)

    resp = requests.get(url, timeout=timeout)
    if resp.status_code == 404:
        raise FileNotFoundError(f"{year} {geo}: 404 (table or year not published yet)")
    resp.raise_for_status()
    rows = resp.json()
    header, *data = rows
    df = pd.DataFrame(data, columns=header)
    return df


def coerce_numeric(df: pd.DataFrame) -> pd.DataFrame:
    # All C27007_* columns come back as strings. Convert and replace ACS
    # jam sentinels with NaN.
    for col in df.columns:
        if col.startswith("C27007_"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df.loc[df[col].isin(ACS_JAM_VALUES), col] = pd.NA
    return df


def normalize_county(df: pd.DataFrame, year: int) -> pd.DataFrame:
    df = df.copy()
    # state and county come back as zero-padded strings already, but be defensive.
    df["state"] = df["state"].astype(str).str.zfill(2)
    df["county"] = df["county"].astype(str).str.zfill(3)
    df.insert(0, "geoid", df["state"] + df["county"])
    df.insert(0, "year", year)
    df = df.rename(columns={"NAME": "name"})
    return df


def normalize_zcta(df: pd.DataFrame, year: int) -> pd.DataFrame:
    df = df.copy()
    # Column name varies slightly across years; normalize.
    zcol = next(c for c in df.columns if "zip" in c.lower())
    # ZCTAs are 5-digit; defend leading zeros.
    df[zcol] = df[zcol].astype(str).str.zfill(5)
    df.insert(0, "geoid", df[zcol])
    df.insert(0, "year", year)
    df = df.rename(columns={"NAME": "name"})
    return df


def add_aggregate_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    est_cols = [f"{v}E" for v in WITH_MEDICAID_VARS]
    moe_cols = [f"{v}M" for v in WITH_MEDICAID_VARS]
    # Sum of with-Medicaid cells. NaN if any component is NaN — that's the
    # honest answer; we don't silently treat missing as zero.
    df["medicaid_enrollees"] = df[est_cols].sum(axis=1, min_count=len(est_cols))
    # Standard Census formula for the MOE of a sum: sqrt of sum of squared MOEs.
    df["medicaid_enrollees_moe"] = (df[moe_cols] ** 2).sum(axis=1, min_count=len(moe_cols)) ** 0.5
    df = df.rename(columns={f"{UNIVERSE_VAR}E": "noninst_population",
                            f"{UNIVERSE_VAR}M": "noninst_population_moe"})
    return df


def cache_path(year: int, geo: str) -> Path:
    return data_dir() / "raw" / f"C27007_{geo}_{year}.csv"


def get_one(year: int, geo: str, api_key: str, force: bool) -> pd.DataFrame:
    cache = cache_path(year, geo)
    if cache.exists() and not force:
        print(f"[{geo} {year}] cache hit: {cache.name}")
        return pd.read_csv(cache, dtype={"geoid": str, "state": str, "county": str})

    print(f"[{geo} {year}] fetching...")
    raw = fetch_one(year, geo, api_key)
    raw = coerce_numeric(raw)
    if geo == "county":
        norm = normalize_county(raw, year)
    else:
        norm = normalize_zcta(raw, year)
    norm = add_aggregate_columns(norm)
    norm.to_csv(cache, index=False)
    print(f"[{geo} {year}] wrote {len(norm):,} rows -> {cache.name}")
    # Be polite even though Census doesn't strictly require it.
    time.sleep(0.5)
    return norm


def summarize(combined: dict[str, pd.DataFrame]) -> None:
    print("\n=== Validation summary ===")
    for geo, df in combined.items():
        if df.empty:
            print(f"  {geo}: empty")
            continue
        for year, sub in df.groupby("year"):
            n_rows = len(sub)
            n_missing = sub["medicaid_enrollees"].isna().sum()
            total = sub["medicaid_enrollees"].sum(skipna=True)
            print(f"  {geo} {year}: {n_rows:>6,} rows | "
                  f"{n_missing:>4} missing | "
                  f"national total = {int(total):>12,}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--years", type=int, nargs="+", default=DEFAULT_YEARS,
                    help=f"endpoint years to fetch (default {DEFAULT_YEARS[0]}..{DEFAULT_YEARS[-1]})")
    ap.add_argument("--geo", choices=["county", "zcta", "both"], default="both",
                    help="which geography to fetch (default: both)")
    ap.add_argument("--force", action="store_true",
                    help="re-download even if cached")
    ap.add_argument("--api-key", default=os.environ.get("CENSUS_API_KEY"),
                    help="Census API key (or set CENSUS_API_KEY env var)")
    args = ap.parse_args()

    if not args.api_key:
        print("ERROR: no API key. Set CENSUS_API_KEY or pass --api-key.", file=sys.stderr)
        print("Get one at https://api.census.gov/data/key_signup.html", file=sys.stderr)
        return 2

    geos = DEFAULT_GEOS if args.geo == "both" else (args.geo,)
    out_dir = data_dir()

    combined: dict[str, pd.DataFrame] = {}
    for geo in geos:
        frames: list[pd.DataFrame] = []
        for year in args.years:
            try:
                frames.append(get_one(year, geo, args.api_key, args.force))
            except FileNotFoundError as e:
                print(f"  SKIP: {e}", file=sys.stderr)
        if not frames:
            combined[geo] = pd.DataFrame()
            continue
        df = pd.concat(frames, ignore_index=True)
        out = out_dir / f"acs_medicaid_{geo}.csv"
        df.to_csv(out, index=False)
        print(f"\n=> wrote {len(df):,} rows to {out}")
        combined[geo] = df

    summarize(combined)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
