#!/usr/bin/env python3
"""Linkage and geocoding quality metrics for the HHS x NPPES x ArcGIS pipeline.

  1. NPPES linkage   share of HHS dental rows / claim lines / dollars that matched a
                     same-month NPPES record, by year, and the servicing-ID type of
                     the unmatched rows (missing, non-numeric/state-assigned, or a
                     10-digit NPI absent from that month's snapshot).
  2. Geocoding       unique practice addresses and claim lines by ArcGIS match status
                     (M = matched, T = tied, U = unmatched).
  3. Consistency     state of the geocoded county FIPS vs. the state on the NPPES
                     practice address (U.S. NPPES addresses only; full state names
                     normalized to USPS codes).
  4. Registry audit  simple random sample of servicing NPIs billing in 2024; the
                     practice location in our data (latest 2024 month) is compared
                     with the live NPPES Registry API (v2.1). The API reports the
                     CURRENT address, so providers who moved after their last 2024
                     claim count as mismatches.

Writes docs/validation/linkage_quality.json and, for the team only, the per-NPI
audit sample to <data-dir>/validation/nppes_registry_sample.csv (gitignored).

Usage
-----
    python scripts/validate_linkage.py --data-dir ../../../data
    python scripts/validate_linkage.py --data-dir ../../../data --sample 200 --seed 20261012
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import duckdb
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "docs" / "validation"

STATE_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
    "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
    "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
    "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
    "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}
FULL_NAMES = {
    "TEXAS": "TX", "CALIFORNIA": "CA", "MARYLAND": "MD", "PUERTO RICO": "PR", "P.R.": "PR",
    "GUAM": "GU",
}


def pct(a, b) -> float:
    return round(100.0 * float(a) / float(b), 3) if b else float("nan")


def nppes_linkage(con, raw_csv: str) -> dict:
    con.execute(
        f"""
        CREATE TEMP TABLE dental AS
        SELECT SERVICING_PROVIDER_NPI_NUM AS sid, BILLING_PROVIDER_NPI_NUM AS bid,
               HCPCS_CODE AS code, CLAIM_FROM_MONTH AS ym,
               CAST(TOTAL_CLAIMS AS BIGINT) AS lines, CAST(TOTAL_PAID AS DECIMAL(18,2)) AS paid
        FROM read_csv('{raw_csv}', header = true, all_varchar = true)
        WHERE HCPCS_CODE LIKE 'D%'
        """
    )
    con.execute(
        """
        CREATE TEMP TABLE linked AS
        SELECT d.*, (k.servicing_npi IS NOT NULL) AS matched
        FROM dental d
        LEFT JOIN (SELECT DISTINCT servicing_npi, billing_npi, hcpcs_code, year_month FROM merged) k
          ON k.servicing_npi = d.sid AND k.billing_npi IS NOT DISTINCT FROM d.bid
         AND k.hcpcs_code = d.code AND k.year_month = d.ym
        """
    )
    by_year = con.execute(
        """
        SELECT LEFT(ym, 4) AS year,
               count(*) AS rows, sum(lines) AS lines, CAST(sum(paid) AS DOUBLE) AS paid,
               count(*) FILTER (WHERE matched) AS rows_m,
               sum(lines) FILTER (WHERE matched) AS lines_m,
               CAST(sum(paid) FILTER (WHERE matched) AS DOUBLE) AS paid_m
        FROM linked GROUP BY 1 ORDER BY 1
        """
    ).df()
    tot = by_year[["rows", "lines", "paid", "rows_m", "lines_m", "paid_m"]].sum()
    causes = con.execute(
        """
        SELECT CASE
                 WHEN sid IS NULL OR trim(sid) = '' THEN 'missing servicing ID'
                 WHEN regexp_full_match(trim(sid), '[0-9]{10}') THEN '10-digit NPI not in same-month NPPES'
                 ELSE 'non-NPI identifier (state-assigned / malformed)'
               END AS cause,
               count(*) AS rows, sum(lines) AS lines, CAST(sum(paid) AS DOUBLE) AS paid
        FROM linked WHERE NOT matched GROUP BY 1 ORDER BY rows DESC
        """
    ).df()
    return {
        "overall": {
            "rows": int(tot["rows"]), "rows_matched_pct": pct(tot["rows_m"], tot["rows"]),
            "lines_matched_pct": pct(tot["lines_m"], tot["lines"]),
            "dollars_matched_pct": pct(tot["paid_m"], tot["paid"]),
        },
        "by_year": [
            {"year": r.year, "rows_matched_pct": pct(r.rows_m, r.rows),
             "lines_matched_pct": pct(r.lines_m, r.lines), "dollars_matched_pct": pct(r.paid_m, r.paid)}
            for r in by_year.itertuples()
        ],
        "unmatched_by_cause": [
            {"cause": r.cause, "rows": int(r.rows), "rows_pct_of_unmatched": pct(r.rows, causes["rows"].sum()),
             "lines": int(r.lines), "dollars": round(r.paid, 2)}
            for r in causes.itertuples()
        ],
    }


def geocoding(con, geo_file: str) -> dict:
    addr = con.execute(
        f"""
        SELECT Status AS status, count(*) AS addresses
        FROM read_csv('{geo_file}', header = true, all_varchar = true)
        GROUP BY 1 ORDER BY 2 DESC
        """
    ).df()
    lines = con.execute(
        "SELECT geocode_status AS status, sum(claims_count) AS lines FROM merged GROUP BY 1"
    ).df()
    t = addr.merge(lines, on="status", how="outer").fillna(0)
    n_addr, n_lines = t["addresses"].sum(), t["lines"].sum()
    return {
        "unique_addresses": int(n_addr),
        "by_status": [
            {"status": r.status, "addresses": int(r.addresses), "addresses_pct": pct(r.addresses, n_addr),
             "lines_pct": pct(r.lines, n_lines)}
            for r in t.itertuples()
        ],
    }


def state_consistency(con) -> dict:
    fips = ", ".join(f"('{k}', '{v}')" for k, v in STATE_FIPS.items())
    names = ", ".join(f"('{k}', '{v}')" for k, v in FULL_NAMES.items())
    con.execute(f"CREATE TEMP TABLE fips(f VARCHAR, st VARCHAR); INSERT INTO fips VALUES {fips}")
    con.execute(f"CREATE TEMP TABLE names(n VARCHAR, st VARCHAR); INSERT INTO names VALUES {names}")
    r = con.execute(
        """
        WITH x AS (
            SELECT m.claims_count AS lines, f.st AS geo_state,
                   coalesce(nm.st, upper(trim(m.practice_state))) AS nppes_state,
                   m.practice_country_code AS cc
            FROM merged m
            JOIN fips f ON f.f = LEFT(m.county_fips, 2)
            LEFT JOIN names nm ON nm.n = upper(trim(m.practice_state))
        ), y AS (
            SELECT *, (cc = 'US' OR nppes_state IN ('PR', 'GU', 'VI', 'MP', 'AS')) AS us FROM x
        )
        SELECT sum(lines) FILTER (WHERE us)                            AS lines_us,
               sum(lines) FILTER (WHERE us AND geo_state = nppes_state) AS lines_agree,
               sum(lines) FILTER (WHERE NOT us)                         AS lines_foreign
        FROM y
        """
    ).fetchone()
    return {
        "lines_with_us_nppes_address": int(r[0]),
        "state_agreement_pct": pct(r[1], r[0]),
        "lines_with_foreign_nppes_address_geocoded": int(r[2] or 0),
    }


def registry_audit(con, n: int, seed: int, out_csv: Path) -> dict:
    import requests

    sample = con.execute(
        f"""
        WITH npi AS (SELECT DISTINCT servicing_npi FROM merged WHERE year_month LIKE '2024-%'),
             pick AS (SELECT servicing_npi FROM npi ORDER BY hash(servicing_npi || '{seed}') LIMIT {n}),
             last AS (
                SELECT m.servicing_npi, m.practice_state, m.practice_zip5, m.year_month,
                       row_number() OVER (PARTITION BY m.servicing_npi ORDER BY m.year_month DESC) AS rk
                FROM merged m JOIN pick USING (servicing_npi)
                WHERE m.year_month LIKE '2024-%'
             )
        SELECT servicing_npi, practice_state, practice_zip5, year_month FROM last WHERE rk = 1
        """
    ).df()

    rows = []
    for rec in sample.itertuples(index=False):
        url = f"https://npiregistry.cms.hhs.gov/api/?version=2.1&number={rec.servicing_npi}"
        status, api_zips = "error", ""
        for attempt in range(3):
            try:
                res = requests.get(url, timeout=30).json().get("results") or []
                if not res:
                    status = "not_found"
                    break
                locs = [a for a in res[0].get("addresses", []) if a.get("address_purpose") == "LOCATION"]
                locs += res[0].get("practiceLocations", []) or []
                zips = {str(a.get("postal_code", ""))[:5] for a in locs}
                states = {a.get("state") for a in locs}
                api_zips = ",".join(sorted(zips))
                status = ("zip5_match" if rec.practice_zip5 in zips
                          else "state_match_only" if rec.practice_state in states
                          else "mismatch")
                break
            except Exception:  # noqa: BLE001 — transient network error; retry
                time.sleep(2 * (attempt + 1))
        rows.append((rec.servicing_npi, rec.year_month, rec.practice_state, rec.practice_zip5, api_zips, status))
        time.sleep(0.2)

    df = pd.DataFrame(rows, columns=["npi", "last_2024_month", "our_state", "our_zip5", "api_location_zip5s", "status"])
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)
    counts = df["status"].value_counts().to_dict()
    found = int(sum(v for k, v in counts.items() if k in ("zip5_match", "state_match_only", "mismatch")))
    z, s = counts.get("zip5_match", 0), counts.get("state_match_only", 0)
    return {
        "n_sampled": len(df), "n_found": found, "counts": counts,
        "zip5_match_pct": pct(z, found), "zip5_or_state_match_pct": pct(z + s, found),
        "seed": seed, "frame": "distinct servicing NPIs with >=1 matched dental row in 2024",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--sample", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20261012)
    ap.add_argument("--skip-api", action="store_true")
    args = ap.parse_args()
    data = args.data_dir.resolve()

    con = duckdb.connect()
    con.execute("PRAGMA disable_progress_bar")
    con.execute("PRAGMA memory_limit='8GB'")
    con.execute(f"PRAGMA temp_directory='{(data / 'validation' / '_duckdb_tmp').as_posix()}'")
    con.execute(
        f"""
        CREATE TEMP TABLE merged AS
        SELECT * FROM read_csv('{(data / "MergedHHS-NPI" / "merged_hhs_nppes_geo.csv").as_posix()}',
            header = true,
            types = {{'servicing_npi': 'VARCHAR', 'billing_npi': 'VARCHAR', 'county_fips': 'VARCHAR',
                      'practice_zip5': 'VARCHAR', 'year_month': 'VARCHAR'}})
        """
    )

    out = {
        "nppes_linkage": nppes_linkage(con, (data / "HHS" / "medicaid-provider-spending.csv").as_posix()),
        "geocoding": geocoding(con, (data / "Geocoded" / "Dental_Provider_Locations.csv").as_posix()),
        "state_consistency": state_consistency(con),
    }
    if not args.skip_api:
        out["registry_audit"] = registry_audit(
            con, args.sample, args.seed, data / "validation" / "nppes_registry_sample.csv"
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "linkage_quality.json").write_text(json.dumps(out, indent=2) + "
", encoding="utf-8")
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
