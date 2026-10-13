#!/usr/bin/env python3
"""Internal reproducibility audit: re-derive the published aggregates from raw data.

This script deliberately does NOT import anything from the build pipeline
(merge_hhs_nppes.py / join_geocoded.py / build_aggregates.py). It re-implements
each step from the written methods and checks that the shipped files in
public/data/ are exactly what those methods produce.

Checks
------
  A. Dental filter     raw HHS CSV, HCPCS starting with 'D'  ==  hhs_dental/*.parquet
  B. NPPES join        every merged row exists in the raw dental rows with the same
                       claims/paid; merged rows == dental rows whose servicing NPI is
                       in the same-month NPPES NPI list (nppes_npi_cache/)
  C. Aggregation       independent CDT categorization + GROUP BY over the merged/geo
                       CSV == every record of the six published NDJSON files
  D. Invariants        state == SUM(counties); SUM(monthly) == annual; the
                       zip3-vs-state national gap == rows with a ZIP but no county
  E. Categories        share of claim lines/dollars with an uncategorized D-code

Linkage and geocoding quality (incl. the NPPES Registry audit) live in
scripts/validate_linkage.py.

Writes data/validation/reproducibility_report.md and .json (gitignored; for the
team, not for publication).

Usage
-----
    python scripts/validate_reproducibility.py --data-dir ../../../data
    python scripts/validate_reproducibility.py --skip-raw     # skip the 11 GB raw scan
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import duckdb
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLISHED_PREFIX = "provider_procedure_category_aggregate"

# CDT ranges written out from the ADA code-set divisions (not copied from the
# build script). Codes are D + 4 digits; D0100-D0999 is the Diagnostic block.
CDT_RANGES = [
    (100, 999, "Diagnostic"),
    (1000, 1999, "Preventive"),
    (2000, 2999, "Restorative"),
    (3000, 3999, "Endodontics"),
    (4000, 4999, "Periodontics"),
    (5000, 5899, "Prosthodontics (removable)"),
    (5900, 5999, "Maxillofacial Prosthetics"),
    (6000, 6199, "Implant Services"),
    (6200, 6999, "Prosthodontics (fixed)"),
    (7000, 7999, "Oral and Maxillofacial Surgery"),
    (8000, 8999, "Orthodontics"),
    (9000, 9999, "Adjunctive General Services"),
]

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

MONEY_TOL = 0.01  # dollars; published values are rounded to cents


class Report:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.results: dict[str, dict] = {}

    def section(self, title: str) -> None:
        print(f"\n=== {title} ===")
        self.lines.append(f"\n## {title}\n")

    def note(self, text: str) -> None:
        print(text)
        self.lines.append(text + "\n")

    def check(self, name: str, ok: bool, detail: str = "", **data) -> None:
        mark = "PASS" if ok else "FAIL"
        msg = f"[{mark}] {name}" + (f" — {detail}" if detail else "")
        print(msg)
        self.lines.append(f"- **{mark}** {name}" + (f" — {detail}" if detail else "") + "\n")
        self.results[name] = {"ok": ok, "detail": detail, **data}

    @property
    def n_fail(self) -> int:
        return sum(not r["ok"] for r in self.results.values())


def category_sql(col: str = "hcpcs_code") -> str:
    num = f"TRY_CAST(SUBSTRING({col}, 2, 4) AS INTEGER)"
    whens = "\n".join(
        f"            WHEN {num} BETWEEN {lo} AND {hi} THEN '{name}'" for lo, hi, name in CDT_RANGES
    )
    return f"""CASE
            WHEN NOT regexp_full_match({col}, 'D[0-9]{{4}}') THEN 'Uncategorized'
{whens}
            ELSE 'Uncategorized'
        END"""


# ── A. Dental filter ──────────────────────────────────────────────────────────


def check_dental_filter(con, rep: Report, raw_csv: Path, dental_glob: str) -> None:
    rep.section("A. Dental filter (raw HHS → D-codes)")
    con.execute(
        f"""
        CREATE TEMP TABLE raw_dental AS
        SELECT
            BILLING_PROVIDER_NPI_NUM   AS billing_npi,
            SERVICING_PROVIDER_NPI_NUM AS servicing_npi,
            HCPCS_CODE                 AS hcpcs_code,
            CLAIM_FROM_MONTH           AS year_month,
            TOTAL_UNIQUE_BENEFICIARIES AS benef,
            TOTAL_CLAIMS               AS claims,
            TOTAL_PAID                 AS paid
        FROM read_csv('{raw_csv.as_posix()}', header = true, all_varchar = true)
        WHERE HCPCS_CODE LIKE 'D%'
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE raw_dental AS
        SELECT billing_npi, servicing_npi, hcpcs_code, year_month,
               CAST(benef AS BIGINT) AS benef, CAST(claims AS BIGINT) AS claims,
               CAST(paid AS DECIMAL(18,2)) AS paid
        FROM raw_dental
        """
    )
    raw_totals = con.execute(
        f"""
        SELECT count(*), sum(TRY_CAST(TOTAL_CLAIMS AS BIGINT)),
               sum(TRY_CAST(TOTAL_PAID AS DECIMAL(18,2))),
               count(*) FILTER (WHERE upper(trim(HCPCS_CODE)) LIKE 'D%' AND HCPCS_CODE NOT LIKE 'D%'),
               min(CLAIM_FROM_MONTH), max(CLAIM_FROM_MONTH)
        FROM read_csv('{raw_csv.as_posix()}', header = true, all_varchar = true)
        """
    ).fetchone()
    n_raw, claims_raw, paid_raw, n_case_ws, mmin, mmax = raw_totals
    rep.note(
        f"Raw HHS file: {n_raw:,} rows, {claims_raw:,} claims, ${float(paid_raw):,.2f} paid, "
        f"months {mmin}–{mmax}."
    )
    rep.check(
        "No lowercase/whitespace-padded D-codes missed by the filter",
        n_case_ws == 0,
        f"{n_case_ws:,} rows",
    )

    d = con.execute("SELECT count(*), sum(claims), sum(paid) FROM raw_dental").fetchone()
    p = con.execute(
        f"SELECT count(*), sum(claims_count), sum(total_amount_paid) FROM '{dental_glob}'"
    ).fetchone()
    rep.note(f"Independent D-filter: {d[0]:,} rows, {d[1]:,} claims, ${float(d[2]):,.2f}.")
    rep.note(f"Pipeline hhs_dental/: {p[0]:,} rows, {p[1]:,} claims, ${p[2]:,.2f}.")
    rep.check(
        "Dental row/claim/dollar totals match pipeline intermediate",
        d[0] == p[0] and d[1] == p[1] and abs(float(d[2]) - p[2]) < 1.0,
        f"Δrows={d[0] - p[0]}, Δclaims={d[1] - p[1]}, Δpaid=${float(d[2]) - p[2]:,.2f}",
        raw_rows=n_raw, raw_claims=claims_raw, raw_paid=float(paid_raw),
        dental_rows=d[0], dental_claims=d[1], dental_paid=float(d[2]),
    )
    rep.results["_share_dental"] = {
        "ok": True, "detail": "",
        "rows": d[0] / n_raw, "claims": d[1] / claims_raw, "paid": float(d[2]) / float(paid_raw),
    }


# ── B. NPPES join ─────────────────────────────────────────────────────────────


def check_join(con, rep: Report, merged_geo_csv: Path, npi_cache_glob: str) -> None:
    rep.section("B. NPPES same-month join")
    con.execute(
        f"""
        CREATE TEMP TABLE merged AS
        SELECT * FROM read_csv('{merged_geo_csv.as_posix()}', header = true,
            types = {{'servicing_npi': 'VARCHAR', 'billing_npi': 'VARCHAR',
                      'county_fips': 'VARCHAR', 'practice_zip5': 'VARCHAR',
                      'total_amount_paid': 'DECIMAL(18,2)', 'year_month': 'VARCHAR'}})
        """
    )
    con.execute(
        f"""
        CREATE TEMP TABLE nppes_npis AS
        SELECT DISTINCT NPI AS npi,
               regexp_extract(filename, '(\\d{{6}})\\.parquet$', 1) AS yyyymm
        FROM read_parquet('{npi_cache_glob}', filename = true)
        """
    )
    n_months = con.execute("SELECT count(DISTINCT yyyymm) FROM nppes_npis").fetchone()[0]
    rep.note(f"NPPES NPI lists loaded for {n_months} months.")

    have_raw = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'raw_dental'"
    ).fetchone()[0]
    if not have_raw:
        rep.note("(raw scan skipped — using hhs_dental/ parquet as the dental universe)")
        return

    # Duplicate keys in the raw file would make the row-level comparison ambiguous.
    dup = con.execute(
        """
        SELECT count(*) FROM (
            SELECT billing_npi, servicing_npi, hcpcs_code, year_month, count(*) c
            FROM raw_dental GROUP BY ALL HAVING c > 1)
        """
    ).fetchone()[0]
    rep.note(f"Duplicate (billing, servicing, code, month) keys in raw dental: {dup:,}.")

    con.execute(
        """
        CREATE TEMP TABLE expected AS
        SELECT r.* FROM raw_dental r
        SEMI JOIN nppes_npis n
          ON n.npi = r.servicing_npi AND n.yyyymm = replace(r.year_month, '-', '')
        """
    )
    exp = con.execute("SELECT count(*), sum(claims), sum(paid) FROM expected").fetchone()
    got = con.execute("SELECT count(*), sum(claims_count), sum(total_amount_paid) FROM merged").fetchone()
    rep.note(f"Expected after same-month join: {exp[0]:,} rows, {exp[1]:,} claims, ${float(exp[2]):,.2f}.")
    rep.note(f"Merged file:                    {got[0]:,} rows, {got[1]:,} claims, ${float(got[2]):,.2f}.")
    rep.check(
        "Merged totals equal independently-joined totals",
        exp[0] == got[0] and exp[1] == got[1] and abs(float(exp[2]) - float(got[2])) < 1.0,
        f"Δrows={exp[0] - got[0]}, Δclaims={exp[1] - got[1]}",
        expected_rows=exp[0], merged_rows=got[0], merged_claims=got[1], merged_paid=float(got[2]),
    )

    # Row-level: multiset difference both directions on the full value tuple.
    cols_m = "billing_npi, servicing_npi, hcpcs_code, year_month, beneficiaries_served_count, claims_count, total_amount_paid"
    cols_e = "billing_npi, servicing_npi, hcpcs_code, year_month, benef, claims, paid"
    only_merged = con.execute(
        f"SELECT count(*) FROM (SELECT {cols_m} FROM merged EXCEPT ALL SELECT {cols_e} FROM expected)"
    ).fetchone()[0]
    only_expected = con.execute(
        f"SELECT count(*) FROM (SELECT {cols_e} FROM expected EXCEPT ALL SELECT {cols_m} FROM merged)"
    ).fetchone()[0]
    rep.check(
        "Row-level: every merged row is an unmodified raw row, and none are missing",
        only_merged == 0 and only_expected == 0,
        f"{only_merged:,} rows only in merged, {only_expected:,} only in expected",
    )


# ── C. Aggregation ────────────────────────────────────────────────────────────


def load_published(path: Path) -> pd.DataFrame:
    recs = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            for key, arr in obj.items():
                for r in arr:
                    period = r.get("year") or r.get("year_month")
                    recs.append(
                        (key, period, r["category"], r["total_beneficiaries_served"],
                         r["total_claims"], r["total_amount_paid"])
                    )
    return pd.DataFrame(recs, columns=["key", "period", "category", "benef", "claims", "paid"])


def check_aggregation(con, rep: Report, merged_geo_csv: Path, pub_dir: Path) -> None:
    rep.section("C. Aggregation (merged/geo CSV → published NDJSON)")
    have_merged = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'merged'"
    ).fetchone()[0]
    if not have_merged:
        con.execute(
            f"""
            CREATE TEMP TABLE merged AS
            SELECT * FROM read_csv('{merged_geo_csv.as_posix()}', header = true,
                types = {{'servicing_npi': 'VARCHAR', 'billing_npi': 'VARCHAR',
                          'county_fips': 'VARCHAR', 'practice_zip5': 'VARCHAR',
                          'total_amount_paid': 'DECIMAL(18,2)', 'year_month': 'VARCHAR'}})
            """
        )
    fips_rows = ", ".join(f"('{f}', '{s}')" for f, s in STATE_FIPS.items())
    con.execute(f"CREATE OR REPLACE TEMP TABLE fips(sf VARCHAR, st VARCHAR); INSERT INTO fips VALUES {fips_rows}")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE indep AS
        SELECT
            NULLIF(county_fips, '')                     AS county,
            f.st                                        AS state,
            LEFT(NULLIF(trim(practice_zip5), ''), 3)    AS zip3,
            LEFT(year_month, 4)                         AS year,
            year_month,
            {category_sql()}                            AS category,
            beneficiaries_served_count                  AS benef,
            claims_count                                AS claims,
            total_amount_paid                           AS paid,
            practice_state
        FROM merged
        LEFT JOIN fips f ON f.sf = LEFT(merged.county_fips, 2)
        """
    )

    levels = {"state": "state", "county": "county", "zip3": "zip3"}
    grains = {"annual": "year", "monthly": "year_month"}
    for grain, pcol in grains.items():
        for level, kcol in levels.items():
            path = pub_dir / f"{PUBLISHED_PREFIX}_{grain}_{level}.json"
            pub = load_published(path)
            mine = con.execute(
                f"""
                SELECT {kcol} AS key, {pcol} AS period, category,
                       sum(benef) AS benef, sum(claims) AS claims,
                       CAST(sum(paid) AS DOUBLE) AS paid
                FROM indep WHERE {kcol} IS NOT NULL GROUP BY ALL
                """
            ).df()
            pub["category"] = pub["category"].fillna("__none__")
            mine["category"] = mine["category"].fillna("__none__")
            m = mine.merge(pub, on=["key", "period", "category"], how="outer",
                           suffixes=("_mine", "_pub"), indicator=True)
            only_mine = int((m["_merge"] == "left_only").sum())
            only_pub = int((m["_merge"] == "right_only").sum())
            both = m[m["_merge"] == "both"]
            bad_claims = int((both["claims_mine"] != both["claims_pub"]).sum())
            bad_benef = int((both["benef_mine"] != both["benef_pub"]).sum())
            bad_paid = int(((both["paid_mine"] - both["paid_pub"]).abs() > MONEY_TOL).sum())
            ok = only_mine == only_pub == bad_claims == bad_benef == bad_paid == 0
            rep.check(
                f"{grain}/{level}: {len(pub):,} published records reproduced",
                ok,
                f"missing={only_mine}, extra={only_pub}, claim-diffs={bad_claims}, "
                f"benef-diffs={bad_benef}, $-diffs={bad_paid}",
            )


# ── D. Invariants ─────────────────────────────────────────────────────────────


def check_invariants(con, rep: Report, pub_dir: Path) -> None:
    rep.section("D. Cross-level invariants (on the published files)")
    a_state = load_published(pub_dir / f"{PUBLISHED_PREFIX}_annual_state.json")
    a_county = load_published(pub_dir / f"{PUBLISHED_PREFIX}_annual_county.json")
    a_zip3 = load_published(pub_dir / f"{PUBLISHED_PREFIX}_annual_zip3.json")

    a_county["state"] = a_county["key"].str[:2].map(STATE_FIPS)
    c_sum = a_county.groupby(["state", "period"], dropna=False)[["claims", "paid"]].sum()
    s_sum = a_state.groupby(["key", "period"])[["claims", "paid"]].sum()
    s_sum.index.names = ["state", "period"]
    j = s_sum.join(c_sum, lsuffix="_s", rsuffix="_c", how="outer")
    bad = j[(j["claims_s"] != j["claims_c"]) | ((j["paid_s"] - j["paid_c"]).abs() > 1.0)]
    rep.check("State == SUM(counties) for every state-year", bad.empty, f"{len(bad)} mismatches")

    for level in ("state", "county", "zip3"):
        ann = load_published(pub_dir / f"{PUBLISHED_PREFIX}_annual_{level}.json")
        mon = load_published(pub_dir / f"{PUBLISHED_PREFIX}_monthly_{level}.json")
        mon["period"] = mon["period"].str[:4]
        a = ann.groupby(["key", "period"])[["claims", "paid"]].sum()
        mm = mon.groupby(["key", "period"])[["claims", "paid"]].sum()
        jj = a.join(mm, lsuffix="_a", rsuffix="_m", how="outer")
        bad = jj[(jj["claims_a"] != jj["claims_m"]) | ((jj["paid_a"] - jj["paid_m"]).abs() > 1.0)]
        rep.check(f"{level}: SUM(monthly) == annual for every key-year", bad.empty, f"{len(bad)} mismatches")

    nat_state = a_state["claims"].sum()
    nat_zip3 = a_zip3["claims"].sum()
    gap_expected = con.execute(
        "SELECT sum(claims) FROM indep WHERE county IS NULL AND zip3 IS NOT NULL"
    ).fetchone()[0] - con.execute(
        "SELECT coalesce(sum(claims), 0) FROM indep WHERE county IS NOT NULL AND zip3 IS NULL"
    ).fetchone()[0]
    rep.check(
        "National ZIP3 − state claim gap equals geocode-failure rows (L33)",
        nat_zip3 - nat_state == gap_expected,
        f"zip3={nat_zip3:,}, state={nat_state:,}, gap={nat_zip3 - nat_state:,}, expected={gap_expected:,}",
    )
    rep.results["_national"] = {
        "ok": True, "detail": "", "state_claims": int(nat_state), "zip3_claims": int(nat_zip3),
        "state_paid": float(a_state["paid"].sum()),
    }


# ── E. Categories ─────────────────────────────────────────────────────────────


def check_categories(con, rep: Report) -> None:
    rep.section("E. CDT category coverage")
    r = con.execute(
        """
        SELECT sum(claims) FILTER (WHERE category = 'Uncategorized'), sum(claims),
               sum(paid) FILTER (WHERE category = 'Uncategorized'), sum(paid)
        FROM indep
        """
    ).fetchone()
    unc_claims = (r[0] or 0) / r[1]
    unc_paid = float(r[2] or 0) / float(r[3])
    rep.check(
        "Uncategorized D-codes are <1% of claims",
        unc_claims < 0.01,
        f"{unc_claims:.4%} of claims, {unc_paid:.4%} of dollars",
        pct_claims=unc_claims, pct_paid=unc_paid,
    )
    codes = con.execute(
        """
        SELECT hcpcs_code, sum(claims_count) c FROM merged
        WHERE NOT regexp_full_match(hcpcs_code, 'D[0-9]{4}')
           OR TRY_CAST(SUBSTRING(hcpcs_code, 2, 4) AS INTEGER) < 100
        GROUP BY 1 ORDER BY c DESC LIMIT 10
        """
    ).fetchall()
    if codes:
        rep.note("Top uncategorized codes: " + ", ".join(f"{c} ({n:,})" for c, n in codes))


# ── main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=REPO_ROOT / "data")
    ap.add_argument("--published-dir", type=Path, default=REPO_ROOT / "public" / "data")
    ap.add_argument("--out-dir", type=Path, default=None, help="default: <data-dir>/validation")
    ap.add_argument("--skip-raw", action="store_true", help="skip checks A and B (11 GB raw scan)")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--memory-limit", default="8GB")
    args = ap.parse_args()

    data = args.data_dir.resolve()
    out_dir = (args.out_dir or data / "validation").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_csv = data / "HHS" / "medicaid-provider-spending.csv"
    merged_dir = data / "MergedHHS-NPI"
    merged_geo_csv = merged_dir / "merged_hhs_nppes_geo.csv"

    con = duckdb.connect()
    con.execute(f"PRAGMA threads={args.threads}")
    con.execute(f"PRAGMA memory_limit='{args.memory_limit}'")
    tmp = out_dir / "_duckdb_tmp"
    con.execute(f"PRAGMA temp_directory='{tmp.as_posix()}'")
    con.execute("PRAGMA disable_progress_bar")

    rep = Report()
    t0 = time.time()
    if not args.skip_raw:
        check_dental_filter(con, rep, raw_csv, (merged_dir / "hhs_dental" / "*.parquet").as_posix())
        check_join(con, rep, merged_geo_csv, (merged_dir / "nppes_npi_cache" / "*.parquet").as_posix())
    check_aggregation(con, rep, merged_geo_csv, args.published_dir)
    check_invariants(con, rep, args.published_dir)
    check_categories(con, rep)

    elapsed = time.time() - t0
    header = (
        "# CHOMP reproducibility audit (internal)\n\n"
        f"Generated {time.strftime('%Y-%m-%d %H:%M')} by `scripts/validate_reproducibility.py` "
        f"in {elapsed / 60:.1f} min. **{len(rep.results) - rep.n_fail - sum(k.startswith('_') for k in rep.results)} "
        f"checks passed, {rep.n_fail} failed.**\n"
    )
    (out_dir / "reproducibility_report.md").write_text(header + "".join(rep.lines), encoding="utf-8")
    (out_dir / "reproducibility_report.json").write_text(json.dumps(rep.results, indent=2, default=str), encoding="utf-8")
    print(f"\nWrote {out_dir / 'reproducibility_report.md'}  ({rep.n_fail} failures, {elapsed / 60:.1f} min)")
    return 1 if rep.n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
