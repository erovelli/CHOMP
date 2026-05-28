#!/usr/bin/env python3
"""Build the procedure-category aggregate NDJSON files from the merged+geocoded CSV.

This is the DuckDB-based equivalent of the Postgres view chain in
`migrations/aggregate_views/` (006 -> 010). It reads the single merged/geocoded
claims CSV directly and emits the six NDJSON files the frontend consumes:

    provider_procedure_category_aggregate_{annual,monthly}_{state,county,zip3}.json

Grains
------
- zip3   : LEFT(practice_zip5, 3)                  (USPS 3-digit prefix; matches zip3 pmtiles `3dig_zip`)
- county : county_fips (5-digit GEOID)             (matches county geometry GEOID)
- state  : USPS postal derived from LEFT(county_fips, 2)

State is built from COUNTY sums (pure): the state postal is derived from the
county FIPS state prefix, so `state total == SUM(its counties)` holds exactly by
construction. Rows with NULL county_fips (territories per L15, and the ~32k
geocode failures per L13/L32) are therefore excluded from county AND state
totals. This is the "pure county sum" rollup. See docs/LIMITATIONS.md.

The HCPCS -> category mapping is identical to migration 006.

Usage
-----
    python scripts/build_aggregates.py                 # writes to public/data/
    python scripts/build_aggregates.py --out some/dir
    python scripts/build_aggregates.py --csv path/to/merged_hhs_nppes_geo.csv
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import duckdb

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = REPO_ROOT / "data" / "MergedHHS-NPI" / "merged_hhs_nppes_geo.csv"
DEFAULT_OUT = REPO_ROOT / "public" / "data"

# ── 2-digit state FIPS -> USPS postal ───────────────────────────────────────────
# 50 states + DC + the five inhabited territories. Every county_fips in the data
# maps to one of these, so state total == SUM(its counties) holds for the whole
# universe. The only rows excluded from the county/state rollups are those with a
# truly NULL county_fips (the ~32k geocode failures, L13/L32). Territory postals
# (PR/GU/VI/MP/AS) may have no matching state polygon on the map; that is a
# geometry concern, not a data one, and such keys are simply ignored by the UI.
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
    # Inhabited territories
    "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}

# HCPCS D-code numeric range -> category (mirrors migration 006 exactly).
CATEGORY_CASE = """
    CASE
        WHEN hcpcs_numeric BETWEEN 100 AND 999   THEN 'Diagnostic'
        WHEN hcpcs_numeric BETWEEN 1000 AND 1999 THEN 'Preventive'
        WHEN hcpcs_numeric BETWEEN 2000 AND 2999 THEN 'Restorative'
        WHEN hcpcs_numeric BETWEEN 3000 AND 3999 THEN 'Endodontics'
        WHEN hcpcs_numeric BETWEEN 4000 AND 4999 THEN 'Periodontics'
        WHEN hcpcs_numeric BETWEEN 5000 AND 5899 THEN 'Prosthodontics (removable)'
        WHEN hcpcs_numeric BETWEEN 5900 AND 5999 THEN 'Maxillofacial Prosthetics'
        WHEN hcpcs_numeric BETWEEN 6000 AND 6199 THEN 'Implant Services'
        WHEN hcpcs_numeric BETWEEN 6200 AND 6999 THEN 'Prosthodontics (fixed)'
        WHEN hcpcs_numeric BETWEEN 7000 AND 7999 THEN 'Oral Surgery'
        WHEN hcpcs_numeric BETWEEN 8000 AND 8999 THEN 'Orthodontics'
        WHEN hcpcs_numeric BETWEEN 9000 AND 9999 THEN 'Adjunctive General Services'
        ELSE 'Uncategorized'
    END
"""

# Each output: (filename, geo key column, period column + JSON field name)
EXPORTS = [
    # (level, grain) -> resolved below
]


def build_base(con: duckdb.DuckDBPyConnection, csv_path: Path) -> None:
    """Materialize the row-level categorized + geo-resolved base table (one CSV scan)."""
    fips_values = ",\n        ".join(
        f"('{fips}', '{usps}')" for fips, usps in FIPS_TO_USPS.items()
    )
    con.execute(
        f"""
        CREATE TEMP TABLE fips_map (state_fips VARCHAR, postal VARCHAR);
        INSERT INTO fips_map VALUES
        {fips_values};
        """
    )

    con.execute(
        f"""
        CREATE TEMP TABLE base AS
        WITH raw AS (
            SELECT
                NULLIF(county_fips, '')                       AS county_fips,
                LEFT(NULLIF(TRIM(practice_zip5), ''), 3)      AS zip3,
                year_month,
                LEFT(year_month, 4)                           AS year,
                beneficiaries_served_count                    AS benef,
                claims_count                                  AS claims,
                total_amount_paid                             AS paid,
                CASE
                    WHEN hcpcs_code ~ '^D[0-9]{{4}}$'
                    THEN CAST(SUBSTRING(hcpcs_code FROM 2 FOR 4) AS INTEGER)
                    ELSE NULL
                END                                           AS hcpcs_numeric
            FROM read_csv(
                '{csv_path.as_posix()}',
                header = true,
                types = {{
                    'county_fips': 'VARCHAR',
                    'practice_zip5': 'VARCHAR',
                    'total_amount_paid': 'DECIMAL(18,2)'
                }}
            )
        )
        SELECT
            county_fips,
            m.postal                AS state,
            zip3,
            year_month,
            year,
            {CATEGORY_CASE}         AS category,
            benef,
            claims,
            paid
        FROM raw
        LEFT JOIN fips_map m
            ON LEFT(raw.county_fips, 2) = m.state_fips;
        """
    )


def aggregate_sql(key_col: str, period_col: str) -> str:
    """Return an aggregate query producing (key, period, category, sums) rows."""
    return f"""
        SELECT
            {key_col}                                   AS key,
            {period_col}                                AS period,
            category,
            SUM(benef)                                  AS total_beneficiaries_served,
            SUM(claims)                                 AS total_claims,
            SUM(paid)                                   AS total_amount_paid
        FROM base
        WHERE {key_col} IS NOT NULL
        GROUP BY key, period, category
    """


def write_ndjson(
    con: duckdb.DuckDBPyConnection,
    key_col: str,
    period_col: str,
    period_field: str,
    out_path: Path,
) -> tuple[int, int]:
    """Write one NDJSON file: one line per key -> [records ordered by period, category]."""
    agg = aggregate_sql(key_col, period_col)
    # json_group_array is a macro and can't take ORDER BY, so build the array body
    # with string_agg over the per-record json_object text (a true aggregate that
    # supports ORDER BY). Each record's field order matches the existing exports.
    rows = con.execute(
        f"""
        SELECT
            key,
            '[' || string_agg(
                CAST(
                    json_object(
                        '{period_field}',             period,
                        'category',                   category,
                        'total_beneficiaries_served', total_beneficiaries_served,
                        'total_claims',               total_claims,
                        'total_amount_paid',          total_amount_paid
                        -- Note: claims-per-beneficiary is intentionally NOT stored.
                        -- It is derived in the UI as total_claims / total_beneficiaries
                        -- (ratio of totals). Materializing it pushed monthly_county
                        -- past GitHub's 100 MB per-file limit for no functional gain.
                    ) AS VARCHAR
                ),
                ',' ORDER BY period, category
            ) || ']' AS arr
        FROM ({agg}) t
        GROUP BY key
        ORDER BY key
        """
    ).fetchall()

    n_records = 0
    with out_path.open("w", encoding="utf-8") as fh:
        for key, arr in rows:
            # `arr` is JSON-array text built above; key is a simple id.
            fh.write("{" + json.dumps(key) + ":" + arr + "}\n")
            n_records += arr.count('"category"')
    return len(rows), n_records


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="merged+geocoded claims CSV")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output dir for NDJSON files")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--memory-limit", default="6GB")
    args = ap.parse_args()

    if not args.csv.exists():
        print(f"ERROR: CSV not found: {args.csv}", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute(f"PRAGMA threads={args.threads}")
    con.execute(f"PRAGMA memory_limit='{args.memory_limit}'")
    con.execute(f"PRAGMA temp_directory='{(args.csv.parent / '_duckdb_tmp').as_posix()}'")
    con.execute("PRAGMA disable_progress_bar")

    t0 = time.time()
    print(f"Reading + categorizing: {args.csv} ...")
    build_base(con, args.csv)
    n_base = con.execute("SELECT count(*) FROM base").fetchone()[0]
    n_no_state = con.execute(
        "SELECT count(*) FROM base WHERE county_fips IS NOT NULL AND state IS NULL"
    ).fetchone()[0]
    print(f"  base rows: {n_base:,}  (built in {time.time() - t0:.1f}s)")
    if n_no_state:
        sample = con.execute(
            "SELECT DISTINCT LEFT(county_fips,2) FROM base "
            "WHERE county_fips IS NOT NULL AND state IS NULL LIMIT 10"
        ).fetchall()
        print(f"  WARNING: {n_no_state:,} rows have a county_fips whose state prefix "
              f"is unmapped (dropped from state rollup). Prefixes: {[s[0] for s in sample]}")

    prefix = "provider_procedure_category_aggregate"
    jobs = [
        ("state",  "state",       "year",       "year"),
        ("county", "county_fips", "year",       "year"),
        ("zip3",   "zip3",        "year",       "year"),
        ("state",  "state",       "year_month", "year_month"),
        ("county", "county_fips", "year_month", "year_month"),
        ("zip3",   "zip3",        "year_month", "year_month"),
    ]
    for level, key_col, period_col, period_field in jobs:
        grain = "annual" if period_col == "year" else "monthly"
        out_path = args.out / f"{prefix}_{grain}_{level}.json"
        t = time.time()
        n_keys, n_recs = write_ndjson(con, key_col, period_col, period_field, out_path)
        size_mb = out_path.stat().st_size / 1e6
        print(f"  wrote {out_path.name:62s} {n_keys:>5} keys  {n_recs:>9,} recs  "
              f"{size_mb:7.2f} MB  ({time.time() - t:.1f}s)")

    print(f"Done in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
