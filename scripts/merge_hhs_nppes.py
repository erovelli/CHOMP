"""Merge HHS Medicaid dental spending against NPPES practice-location data,
one month at a time, without ever loading the full NPPES corpus into memory.

Replaces the SQL join in migrations/005_populate_provider_procedure_monthly_geo.sql.

Default layout (data/ is a sibling of the repo, not inside it):
    ../data/HHS/medicaid-provider-spending.csv  <- HHS CSV
    ../data/NPPES/npi_raw_YYYYMM.zip            <- one NPPES zip per month
    ../data/MergedHHS-NPI/                      <- output (created by this script)
        merged_hhs_nppes.csv                    <- the single growing output CSV
        .processed_months.txt                   <- tracker; lets re-runs skip done months
        hhs_dental/                             <- internal cache (parquet per month)

Usage (from repo root):
    python scripts/merge_hhs_nppes.py
    python scripts/merge_hhs_nppes.py --force                 # rebuild everything
    python scripts/merge_hhs_nppes.py --hhs-csv path/to/x.csv

Re-running is safe. Months recorded in .processed_months.txt are skipped.

Requires: pandas>=2.0, pyarrow>=14 (see requirements.txt).
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import zipfile
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

import pandas as pd

# NBER's larger NPPES archives use deflate64 compression (method 9). Neither
# Python's stdlib zipfile nor Windows' bundled tar/libarchive supports it.
# We use stdlib zipfile to list contents (the central directory is
# compression-agnostic) and shell out to 7-Zip to read member contents.
# 7-Zip handles deflate64 (and every other zip variant in the wild).


@lru_cache(maxsize=1)
def _find_7z() -> str:
    """Locate 7z.exe on PATH or in standard install locations."""
    for name in ("7z", "7z.exe"):
        p = shutil.which(name)
        if p:
            return p
    for candidate in (
        Path(r"C:\Program Files\7-Zip\7z.exe"),
        Path(r"C:\Program Files (x86)\7-Zip\7z.exe"),
    ):
        if candidate.exists():
            return str(candidate)
    raise RuntimeError(
        "7z.exe not found. Install 7-Zip from https://www.7-zip.org/ "
        "(or run: winget install 7zip.7zip) and re-run."
    )


def _sniff_zip_member_header(zip_path: Path, member: str) -> list[str]:
    """Read only the CSV header from a zip member, then kill the 7-Zip
    process. Avoids decompressing the full ~3 GB just to grab column names —
    and avoids the broken-pipe exit code that 7-Zip would otherwise raise
    when we close the pipe after a partial read."""
    sevenz = _find_7z()
    proc = subprocess.Popen(
        [sevenz, "e", "-so", str(zip_path), member],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        header = pd.read_csv(proc.stdout, nrows=0).columns.tolist()
    finally:
        # Force-kill rather than wait — we only consumed the first line.
        proc.kill()
        proc.wait()
    return header


@contextmanager
def _open_zip_member(zip_path: Path, member: str):
    """Stream a single zip member's contents via 7-Zip for FULL reads
    (caller must consume the entire stream). Works for plain deflate AND
    deflate64. Yields a binary file-like object suitable for pd.read_csv.
    For header-only peeks, use _sniff_zip_member_header() instead."""
    sevenz = _find_7z()
    proc = subprocess.Popen(
        [sevenz, "e", "-so", str(zip_path), member],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        yield proc.stdout
    finally:
        if proc.stdout is not None:
            proc.stdout.close()
        proc.wait()
        if proc.returncode != 0:
            err_bytes = proc.stderr.read() if proc.stderr else b""
            raise RuntimeError(
                f"7z failed extracting {member!r} from {zip_path.name} "
                f"(exit {proc.returncode}): {err_bytes.decode(errors='replace').strip()}"
            )

NPPES_FILENAME_RE = re.compile(r"npi_raw_(\d{6})\.zip$", re.IGNORECASE)

HHS_RAW_DTYPES = {
    "SERVICING_PROVIDER_NPI_NUM": "string",
    "BILLING_PROVIDER_NPI_NUM": "string",
    "HCPCS_CODE": "string",
    "CLAIM_FROM_MONTH": "string",
    "TOTAL_UNIQUE_BENEFICIARIES": "Int64",
    "TOTAL_CLAIMS": "Int64",
    "TOTAL_PAID": "float64",
}

HHS_RENAME = {
    "SERVICING_PROVIDER_NPI_NUM": "servicing_npi",
    "BILLING_PROVIDER_NPI_NUM": "billing_npi",
    "HCPCS_CODE": "hcpcs_code",
    "CLAIM_FROM_MONTH": "year_month",
    "TOTAL_UNIQUE_BENEFICIARIES": "beneficiaries_served_count",
    "TOTAL_CLAIMS": "claims_count",
    "TOTAL_PAID": "total_amount_paid",
}

NPPES_ADDRESS_COLS = [
    "Provider First Line Business Practice Location Address",
    "Provider Second Line Business Practice Location Address",
    "Provider Business Practice Location Address City Name",
    "Provider Business Practice Location Address State Name",
    "Provider Business Practice Location Address Postal Code",
]

OUTPUT_COLUMNS = [
    "servicing_npi",
    "billing_npi",
    "hcpcs_code",
    "year_month",
    "beneficiaries_served_count",
    "claims_count",
    "total_amount_paid",
    "practice_address_line_1",
    "practice_address_line_2",
    "practice_city",
    "practice_state",
    "practice_zip5",
    "practice_country_code",
    "primary_taxonomy_code",
]


def hhs_year_month_to_yyyymm(s: pd.Series) -> pd.Series:
    """Normalize HHS year_month text ('YYYY-MM', 'YYYYMM', 'YYYY/MM', etc.) to 'YYYYMM'."""
    return s.astype(str).str.replace(r"[^0-9]", "", regex=True).str[:6]


def phase_a_prefilter_hhs(hhs_csv: Path, dental_dir: Path, force: bool) -> None:
    """Read HHS CSV once, write one parquet per year_month containing only D-codes."""
    dental_dir.mkdir(parents=True, exist_ok=True)
    if not force and any(dental_dir.glob("*.parquet")):
        print(f"[phase A] skip: {dental_dir} already populated (use --force to redo)")
        return
    if force:
        for f in dental_dir.glob("*.parquet"):
            f.unlink()

    print(f"[phase A] reading {hhs_csv} (chunked)...")
    by_month: dict[str, list[pd.DataFrame]] = {}
    rows_in = 0
    rows_out = 0

    chunks = pd.read_csv(
        hhs_csv,
        usecols=list(HHS_RAW_DTYPES),
        dtype=HHS_RAW_DTYPES,
        chunksize=1_000_000,
    )
    for i, chunk in enumerate(chunks):
        rows_in += len(chunk)
        chunk = chunk.rename(columns=HHS_RENAME)
        dental = chunk[chunk["hcpcs_code"].str.startswith("D", na=False)].copy()
        if dental.empty:
            continue
        rows_out += len(dental)
        dental["__ym"] = hhs_year_month_to_yyyymm(dental["year_month"])
        for ym, group in dental.groupby("__ym", sort=False):
            by_month.setdefault(ym, []).append(group.drop(columns="__ym"))
        if (i + 1) % 10 == 0:
            print(f"[phase A]  chunk {i + 1}: {rows_in:,} read, {rows_out:,} dental kept")

    print(f"[phase A] writing {len(by_month)} month parquet files...")
    for ym, parts in by_month.items():
        df = pd.concat(parts, ignore_index=True) if len(parts) > 1 else parts[0]
        df.to_parquet(dental_dir / f"{ym}.parquet", index=False)
    print(f"[phase A] done: {rows_in:,} HHS rows read, {rows_out:,} dental rows written")


def _find_nppes_csv(zip_path: Path) -> str:
    """Find the dissemination CSV (the largest .csv) inside an NPPES zip."""
    with zipfile.ZipFile(zip_path) as z:
        candidates = [
            n
            for n in z.namelist()
            if n.lower().endswith(".csv")
            and "fileheader" not in n.lower()
            and "endpoint" not in n.lower()
            and "othername" not in n.lower()
            and "pl_pfile" not in n.lower()
        ]
        if not candidates:
            raise FileNotFoundError(f"no NPPES dissemination CSV in {zip_path}")
        return max(candidates, key=lambda n: z.getinfo(n).file_size)


def merge_one_month(
    nppes_zip: Path,
    hhs_parquet: Path,
    output_csv: Path,
    write_header: bool,
) -> int:
    """Merge one month and append to output_csv. Returns row count appended."""
    csv_name = _find_nppes_csv(nppes_zip)

    header = _sniff_zip_member_header(nppes_zip, csv_name)

    missing = [c for c in NPPES_ADDRESS_COLS if c not in header]
    if missing:
        raise KeyError(f"{nppes_zip.name}: missing NPPES address columns: {missing}")

    country_col = next(
        (c for c in header if c.startswith("Provider Business Practice Location Address Country Code")),
        None,
    )
    if country_col is None:
        raise KeyError(f"{nppes_zip.name}: missing practice-location country code column")

    tax_code_cols = sorted(
        (c for c in header if c.startswith("Healthcare Provider Taxonomy Code_")),
        key=lambda c: int(c.rsplit("_", 1)[1]),
    )
    tax_switch_cols = sorted(
        (c for c in header if c.startswith("Healthcare Provider Primary Taxonomy Switch_")),
        key=lambda c: int(c.rsplit("_", 1)[1]),
    )

    usecols = ["NPI", *NPPES_ADDRESS_COLS, country_col, *tax_code_cols, *tax_switch_cols]
    dtype = {c: "string" for c in usecols}

    with _open_zip_member(nppes_zip, csv_name) as f:
        nppes = pd.read_csv(f, usecols=usecols, dtype=dtype)

    primary = pd.Series(pd.NA, index=nppes.index, dtype="string")
    for code_col, switch_col in zip(tax_code_cols, tax_switch_cols):
        mask = primary.isna() & (nppes[switch_col] == "Y")
        primary = primary.mask(mask, nppes[code_col])
    nppes["primary_taxonomy_code"] = primary

    nppes = nppes.rename(
        columns={
            NPPES_ADDRESS_COLS[0]: "practice_address_line_1",
            NPPES_ADDRESS_COLS[1]: "practice_address_line_2",
            NPPES_ADDRESS_COLS[2]: "practice_city",
            NPPES_ADDRESS_COLS[3]: "practice_state",
            NPPES_ADDRESS_COLS[4]: "_postal_code",
            country_col: "practice_country_code",
        }
    )
    # NPPES postal codes are typically 9-char ZIP+4 unhyphenated (e.g., "071034521").
    # Truncate to 5, then zfill to defend against any upstream-stripped leading zeros
    # (e.g., a 4-char "7103" gets re-padded to "07103"). Empty strings -> NA so we
    # don't fabricate "00000" out of nothing. Stored as string so leading zeros
    # survive to_csv; downstream readers should pass dtype={'practice_zip5': 'string'}
    # to avoid pandas auto-inferring int and dropping the leading zero on read.
    zip5 = nppes["_postal_code"].str[:5]
    nppes["practice_zip5"] = zip5.mask(zip5 == "", pd.NA).str.zfill(5)
    nppes_slim = nppes[
        [
            "NPI",
            "practice_address_line_1",
            "practice_address_line_2",
            "practice_city",
            "practice_state",
            "practice_zip5",
            "practice_country_code",
            "primary_taxonomy_code",
        ]
    ]

    hhs = pd.read_parquet(hhs_parquet)
    merged = hhs.merge(nppes_slim, left_on="servicing_npi", right_on="NPI", how="inner")
    merged = merged.drop(columns="NPI")[OUTPUT_COLUMNS]

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(output_csv, mode="a", header=write_header, index=False)
    return len(merged)


def _read_tracker(tracker: Path) -> set[str]:
    if not tracker.exists():
        return set()
    return {line.strip() for line in tracker.read_text().splitlines() if line.strip()}


def _append_tracker(tracker: Path, ym: str) -> None:
    tracker.parent.mkdir(parents=True, exist_ok=True)
    with tracker.open("a") as f:
        f.write(ym + "\n")


def phase_b_merge(
    nppes_dir: Path,
    dental_dir: Path,
    output_csv: Path,
    tracker: Path,
    force: bool,
) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    if force:
        if output_csv.exists():
            output_csv.unlink()
        if tracker.exists():
            tracker.unlink()

    nppes_zips: dict[str, Path] = {}
    for zp in sorted(nppes_dir.glob("npi_raw_*.zip")):
        m = NPPES_FILENAME_RE.search(zp.name)
        if not m:
            print(f"[phase B] skip {zp.name}: doesn't match npi_raw_YYYYMM.zip")
            continue
        nppes_zips[m.group(1)] = zp

    if not nppes_zips:
        print(f"[phase B] no NPPES zips found in {nppes_dir}")
        return

    available_hhs = {p.stem for p in dental_dir.glob("*.parquet")}
    already_done = _read_tracker(tracker)

    processed = 0
    skipped_done = 0
    skipped_no_hhs = 0
    total_rows = 0

    for ym in sorted(nppes_zips):
        zp = nppes_zips[ym]
        if ym in already_done:
            skipped_done += 1
            continue
        if ym not in available_hhs:
            print(f"[phase B] skip {ym}: no HHS dental rows for this month")
            skipped_no_hhs += 1
            continue
        print(f"[phase B] {ym}: merging {zp.name}...")
        write_header = not output_csv.exists()
        n = merge_one_month(zp, dental_dir / f"{ym}.parquet", output_csv, write_header)
        _append_tracker(tracker, ym)
        print(f"[phase B] {ym}: appended {n:,} rows -> {output_csv}")
        processed += 1
        total_rows += n

    only_hhs = sorted(available_hhs - set(nppes_zips) - already_done)
    print(
        f"[phase B] done: processed={processed} "
        f"skipped_already_done={skipped_done} skipped_no_hhs={skipped_no_hhs} "
        f"rows_appended={total_rows:,}"
    )
    if only_hhs:
        preview = ", ".join(only_hhs[:5]) + ("..." if len(only_hhs) > 5 else "")
        print(
            f"[phase B] note: {len(only_hhs)} HHS months have no NPPES zip on disk; "
            f"swap zips and re-run to merge them. ({preview})"
        )


def _resolve_hhs_csv(default: Path) -> Path | None:
    """If default exists use it; else fall back to a single .csv in default's parent dir."""
    if default.exists():
        return default
    parent = default.parent
    if not parent.is_dir():
        return None
    candidates = list(parent.glob("*.csv"))
    if len(candidates) == 1:
        return candidates[0]
    return None


def main() -> int:
    data_root = Path("../data")
    default_hhs = data_root / "HHS" / "medicaid-provider-spending.csv"
    default_nppes = data_root / "NPPES"
    default_output = data_root / "MergedHHS-NPI"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--hhs-csv", type=Path, default=None, help=f"HHS spending CSV (default: {default_hhs}; falls back to any single .csv in HHS/)")
    p.add_argument("--nppes-dir", type=Path, default=default_nppes, help=f"Directory of npi_raw_YYYYMM.zip files (default: {default_nppes})")
    p.add_argument("--output-dir", type=Path, default=default_output, help=f"Output directory (default: {default_output})")
    p.add_argument("--force", action="store_true", help="Re-do already-completed work")
    args = p.parse_args()

    hhs_csv = args.hhs_csv if args.hhs_csv is not None else _resolve_hhs_csv(default_hhs)
    if hhs_csv is None or not hhs_csv.exists():
        print(
            f"error: HHS CSV not found. Expected {default_hhs} (or a single .csv in "
            f"{default_hhs.parent}). Pass --hhs-csv explicitly.",
            file=sys.stderr,
        )
        return 2
    if not args.nppes_dir.is_dir():
        print(f"error: NPPES directory not found: {args.nppes_dir}", file=sys.stderr)
        return 2

    dental_dir = args.output_dir / "hhs_dental"
    output_csv = args.output_dir / "merged_hhs_nppes.csv"
    tracker = args.output_dir / ".processed_months.txt"

    print(f"hhs_csv:    {hhs_csv}")
    print(f"nppes_dir:  {args.nppes_dir}")
    print(f"output_dir: {args.output_dir}")

    phase_a_prefilter_hhs(hhs_csv, dental_dir, args.force)
    phase_b_merge(args.nppes_dir, dental_dir, output_csv, tracker, args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
