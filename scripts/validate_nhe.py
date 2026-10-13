#!/usr/bin/env python3
"""Benchmark HHS/CHOMP Medicaid dental dollars against the National Health Expenditure Accounts.

Source (pinned)
---------------
CMS Office of the Actuary, NHE "Type of service and source of funds, CY 1960-2024"
(2024 release, data through CY2024; methodology paper "Definitions, Sources, and
Methods", 2024 edition, last updated Jan 2026). This release includes the 2024
comprehensive revision, which re-allocated Medicaid managed-care spending across
service categories; earlier vintages (e.g., MACStats Feb 2026, built on the prior
release) show materially higher Medicaid dental ($18.9B vs $14.4B for 2023):
    https://www.cms.gov/files/zip/national-health-expenditures-type-service-source-funds-cy-1960-2024.zip
The zip holds NHE2024.csv / NHE2024.xls. We read the "Total Dental Services
Expenditures" block and its "Medicaid (Title XIX)" and "CHIP (Title XIX and
Title XXI)" rows (millions of dollars). The script records the zip's SHA-256 so
a later CMS revision of the same URL is detectable.

Comparability (from the NHE methodology paper)
----------------------------------------------
- Geography: NHE is U.S. only — 50 states plus DC. Territories are excluded here too.
- Payer: Medicaid (Title XIX) and CHIP (Title XIX and Title XXI) are separate,
  non-overlapping NHE sources of funds; the HHS release covers both, so the
  benchmark is their sum. Both include federal and state shares, as does TOTAL_PAID.
- Service scope: NHE "Dental Services" is revenue of establishments classified as
  Offices of Dentists (NAICS 6212). Dental procedures billed by other establishment
  types (e.g., health centers) can fall in other NHE categories, while the HHS
  release keys on the procedure code. The ratio is therefore a coverage benchmark,
  not an identity.

HHS side, by calendar year of service (CLAIM_FROM_MONTH)
--------------------------------------------------------
  release_dental   all D-prefixed HCPCS rows in the raw HHS release (any geography)
  nppes_matched    after the same-month NPPES join (merged CSV)
  county_geocoded  rows with a geocoded county FIPS (state/county universe)
  chomp_50dc       county_geocoded restricted to 50 states + DC  <- compared to NHE

Also reports the share of dental claim lines with TOTAL_PAID = 0 (HHS sets missing
line-level paid amounts to $0), which is one measurable source of the gap.

Usage
-----
    python scripts/validate_nhe.py --data-dir ../../../data
    python scripts/validate_nhe.py --data-dir ../../../data --nhe-zip path/to/local.zip
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import time
import zipfile
from pathlib import Path

import duckdb
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "docs" / "validation"
NHE_URL = (
    "https://www.cms.gov/files/zip/"
    "national-health-expenditures-type-service-source-funds-cy-1960-2024.zip"
)
NHE_MEMBER = "NHE2024.csv"
YEARS = list(range(2018, 2025))
TERRITORY_FIPS = ("60", "66", "69", "72", "78")  # AS, GU, MP, PR, VI

DENTAL_BLOCK = "Total Dental Services Expenditures"
ROWS_WANTED = {
    "Total Dental Services Expenditures": "total_dental",
    "Out of pocket": "out_of_pocket",
    "Health Insurance": "health_insurance",
    "Other Third Party Payers and Programs": "other_third_party",
    "Medicaid (Title XIX)": "medicaid",
    "CHIP (Title XIX and Title XXI)": "chip",
}


# ── NHE ───────────────────────────────────────────────────────────────────────


def fetch_nhe(local_zip: Path | None, cache_dir: Path) -> tuple[bytes, dict]:
    if local_zip is not None:
        blob = local_zip.read_bytes()
        source = str(local_zip)
    else:
        import requests

        cache_dir.mkdir(parents=True, exist_ok=True)
        cached = cache_dir / Path(NHE_URL).name
        r = requests.get(NHE_URL, timeout=120)
        r.raise_for_status()
        blob = r.content
        if blob[:2] != b"PK":
            raise RuntimeError(f"{NHE_URL} did not return a zip (got {blob[:60]!r})")
        cached.write_bytes(blob)
        source = NHE_URL
    meta = {
        "source": source,
        "member": NHE_MEMBER,
        "sha256": hashlib.sha256(blob).hexdigest(),
        "bytes": len(blob),
        "retrieved": time.strftime("%Y-%m-%d"),
    }
    return blob, meta


def _num(s: str) -> float:
    s = s.strip().replace(",", "").replace('"', "")
    return float(s) if s not in ("", "-") else float("nan")


def parse_nhe(blob: bytes) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        text = zf.read(NHE_MEMBER).decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))

    header = next(r for r in rows if r and r[0].strip().startswith("Expenditure Amount"))
    col = {int(h): i for i, h in enumerate(header) if h.strip().isdigit()}
    missing = [y for y in YEARS if y not in col]
    if missing:
        raise ValueError(f"NHE header lacks years {missing}")

    start = next(i for i, r in enumerate(rows) if r and r[0].strip() == DENTAL_BLOCK)
    found: dict[str, list[float]] = {}
    for r in rows[start:]:
        label = r[0].strip() if r else ""
        if label.startswith("Total ") and label.endswith("Expenditures") and label != DENTAL_BLOCK:
            break  # next service block
        key = ROWS_WANTED.get(label)
        if key and key not in found:  # first occurrence inside the dental block
            found[key] = [_num(r[col[y]]) for y in YEARS]
    absent = set(ROWS_WANTED.values()) - set(found)
    if absent:
        raise ValueError(f"dental block missing rows: {absent}")

    df = pd.DataFrame({"year": YEARS, **found})
    # Internal consistency: payer components sum to the dental total (±$2M rounding).
    resid = df["total_dental"] - df["out_of_pocket"] - df["health_insurance"] - df["other_third_party"]
    if (resid.abs() > 2).any():
        raise ValueError(f"NHE dental payer components do not sum to total: {resid.tolist()}")
    df["medicaid_chip"] = df["medicaid"] + df["chip"]
    return df


# ── HHS side ──────────────────────────────────────────────────────────────────


def hhs_dollars(data_dir: Path) -> pd.DataFrame:
    raw_csv = (data_dir / "HHS" / "medicaid-provider-spending.csv").as_posix()
    geo_csv = (data_dir / "MergedHHS-NPI" / "merged_hhs_nppes_geo.csv").as_posix()
    con = duckdb.connect()
    con.execute("PRAGMA disable_progress_bar")

    release = con.execute(
        f"""
        SELECT CAST(LEFT(CLAIM_FROM_MONTH, 4) AS INT)            AS year,
               sum(CAST(TOTAL_PAID AS DECIMAL(18,2)))            AS release_dental,
               sum(CAST(TOTAL_CLAIMS AS BIGINT))                 AS release_lines,
               sum(CAST(TOTAL_CLAIMS AS BIGINT))
                   FILTER (WHERE CAST(TOTAL_PAID AS DECIMAL(18,2)) = 0) AS release_lines_zero_paid
        FROM read_csv('{raw_csv}', header = true, all_varchar = true)
        WHERE HCPCS_CODE LIKE 'D%'
        GROUP BY 1
        """
    ).df()

    terr = ", ".join(f"'{t}'" for t in TERRITORY_FIPS)
    merged = con.execute(
        f"""
        SELECT CAST(LEFT(year_month, 4) AS INT)                               AS year,
               sum(total_amount_paid)                                          AS nppes_matched,
               sum(total_amount_paid) FILTER (WHERE NULLIF(county_fips, '') IS NOT NULL)
                                                                               AS county_geocoded,
               sum(total_amount_paid) FILTER (WHERE NULLIF(county_fips, '') IS NOT NULL
                                              AND LEFT(county_fips, 2) NOT IN ({terr}))
                                                                               AS chomp_50dc
        FROM read_csv('{geo_csv}', header = true,
                      types = {{'county_fips': 'VARCHAR', 'total_amount_paid': 'DECIMAL(18,2)'}})
        GROUP BY 1
        """
    ).df()
    df = release.merge(merged, on="year").sort_values("year").reset_index(drop=True)
    for c in ("release_dental", "nppes_matched", "county_geocoded", "chomp_50dc"):
        df[c] = df[c].astype(float) / 1e6  # -> $ millions, NHE units
    df["share_lines_zero_paid"] = df["release_lines_zero_paid"] / df["release_lines"]
    return df


def published_check(df: pd.DataFrame) -> float:
    """Cross-check chomp_50dc against the shipped state file (should match to cents)."""
    pub = {}
    path = REPO_ROOT / "public" / "data" / "provider_procedure_category_aggregate_annual_state.json"
    for line in path.open(encoding="utf-8"):
        for st, recs in json.loads(line).items():
            if st in ("PR", "GU", "VI", "MP", "AS"):
                continue
            for r in recs:
                pub[int(r["year"])] = pub.get(int(r["year"]), 0.0) + r["total_amount_paid"]
    return max(abs(pub[y] / 1e6 - v) for y, v in zip(df["year"], df["chomp_50dc"]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--nhe-zip", type=Path, default=None, help="use a local copy instead of downloading")
    args = ap.parse_args()
    data_dir = args.data_dir.resolve()

    blob, meta = fetch_nhe(args.nhe_zip, data_dir / "benchmarks" / "nhe")
    nhe = parse_nhe(blob)
    hhs = hhs_dollars(data_dir)
    max_diff = published_check(hhs)
    if max_diff > 0.01:  # $10k in $M units
        raise SystemExit(f"chomp_50dc disagrees with published state file by ${max_diff:.3f}M")

    df = nhe.merge(hhs, on="year")
    df["release_pct_of_nhe"] = 100 * df["release_dental"] / df["medicaid_chip"]
    df["chomp_pct_of_nhe"] = 100 * df["chomp_50dc"] / df["medicaid_chip"]
    df["pipeline_retention_pct"] = 100 * df["county_geocoded"] / df["release_dental"]
    df["preliminary"] = df["year"] == 2024  # HHS marks 2024 T-MSIS as preliminary

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    nhe_out = OUT_DIR / "nhe_dental_2018_2024.csv"
    with nhe_out.open("w", encoding="utf-8", newline="") as fh:
        fh.write(f"# source: {meta['source']} ({meta['member']})\n")
        fh.write(f"# sha256: {meta['sha256']}  retrieved: {meta['retrieved']}  units: $ millions\n")
        nhe.to_csv(fh, index=False)
    df.to_csv(OUT_DIR / "nhe_benchmark.csv", index=False, float_format="%.3f")

    show = df[["year", "medicaid", "chip", "medicaid_chip", "release_dental", "nppes_matched",
               "county_geocoded", "chomp_50dc", "release_pct_of_nhe", "chomp_pct_of_nhe",
               "pipeline_retention_pct", "share_lines_zero_paid"]]
    print(f"NHE zip sha256 {meta['sha256']} ({meta['bytes']:,} bytes)")
    print(f"chomp_50dc vs published state file: max |diff| = ${max_diff * 1e6:,.2f}")
    print(show.round(3).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
