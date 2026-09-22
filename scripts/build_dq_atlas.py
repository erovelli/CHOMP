#!/usr/bin/env python3
"""Build the DQ Atlas overlay data file for the front end.

Reads the per-topic-per-year DQ Atlas CSVs published by CMS at
https://www.medicaid.gov/dq-atlas/ (mirrored into `data/DQ Atlas/`) and emits
one JSON blob into `public/data/dq_atlas.json` that the map's Data-Quality
overlay reads at runtime.

Output shape (single JSON object, not NDJSON — the file is ~40 KB gzipped):

    {
      "topics": {
        "<topic-key>": {
          "label": "<human title>",
          "description": "<assessment basis, from the CSV header>",
          "metric_label": "<name of the headline % column>",
          "years": {
            "2023": {
              "AL": {"assessment": "Low concern", "pct": 0.2},
              ...
            },
            ...
          }
        },
        ...
      },
      "assessments": ["Low concern", "Medium concern", "High concern",
                      "Unusable", "Unclassified"]
    }

Filename → topic-key mapping (10 topics; every CSV in `data/DQ Atlas/` maps to
exactly one key). Anything that fails to match is a hard error — better to
notice a new release CMS added than to silently drop it.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_IN = REPO_ROOT / "data" / "DQ Atlas"
DEFAULT_OUT = REPO_ROOT / "public" / "data" / "dq_atlas.json"

# Ten front-end topic keys. Each pattern matches the CSV base name after
# stripping the `-<year>-<release>.csv` suffix. Order also drives the
# LayerControl-style ribbon in the DetailPanel.
TOPIC_PATTERNS: list[tuple[str, str, str]] = [
    ("link-bene", "TAF-DQ-Link-Claims-Bene", "Linking Claims to Beneficiaries"),
    ("link-providers", "TAF-DQ-Link-Claims-Providers", "Linking Claims to Providers"),
    ("claims-volume", "TAF-DQ-Claims-Volume-OT", "Claims Volume – OT"),
    ("service-users", "TAF-DQ-Service-Users-OT", "Service Users – OT"),
    ("cmc-encounters", "TAF-DQ-CMC-Plan-Encounters-OT", "CMC Plan Encounters – OT"),
    ("missing-pmt-ffs", "TAF-DQ-Missing-Pmt-FFS-Claims", "Missing Payment Data – FFS Claims"),
    ("missing-pmt-enc", "TAF-DQ-Missing-Pmt-Encounters", "Missing Payment Data – Encounters"),
    ("pmt-consistency", "TAF-DQ-Pmt-Consistency-OT", "Payment Data Consistency – OT"),
    ("proc-cd-prof", "TAF-DQ-Proc-Cd-OT-Prof", "Procedure Codes – OT Professional"),
    ("proc-cd-inst", "TAF-DQ-Proc-Cd-OT-Institution", "Procedure Codes – OT Institutional"),
]

# State-name → USPS. Mirrors src/constants/stateFips.ts; kept in sync manually
# because the pipeline doesn't otherwise import from TS. "Virgin Islands" in
# the CSVs (no "US " prefix) still maps to VI.
STATE_NAME_TO_USPS: dict[str, str] = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME",
    "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
    "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
    "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
    "Puerto Rico": "PR", "Guam": "GU", "Virgin Islands": "VI",
    "US Virgin Islands": "VI", "American Samoa": "AS",
    "Northern Mariana Islands": "MP", "Commonwealth of the Northern Mariana Islands": "MP",
}

# The five categorical tiers CMS uses. Anything else in the "DQ Assessment"
# column collapses to "Unclassified" so the front end always has a defined
# swatch to render.
KNOWN_ASSESSMENTS = {
    "Low concern",
    "Medium concern",
    "High concern",
    "Unusable",
    "Unclassified",
}

YEAR_RE = re.compile(r"-(\d{4})-(?:Release|Preliminary)")


def topic_key_for(basename: str) -> str | None:
    for key, prefix, _label in TOPIC_PATTERNS:
        if basename.startswith(prefix + "-"):
            return key
    return None


def label_and_description_for(key: str) -> tuple[str, str]:
    for k, _prefix, label in TOPIC_PATTERNS:
        if k == key:
            return label, ""
    raise KeyError(key)


def parse_year(basename: str) -> str:
    m = YEAR_RE.search(basename)
    if not m:
        raise ValueError(f"could not extract year from filename: {basename}")
    return m.group(1)


def parse_pct(raw: str) -> float | None:
    """CSVs write '0.2', '99.5', or 'Not applicable'. Return None for anything
    that isn't a bare number so the front end can dim the metric."""
    s = raw.strip().strip('"').replace(",", "")
    if not s or s.lower() in {"not applicable", "n/a", "na", "unknown", "*", ".", "--"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_assessment(raw: str) -> str:
    s = raw.strip().strip('"')
    return s if s in KNOWN_ASSESSMENTS else "Unclassified"


def load_csv(path: Path) -> tuple[str, list[dict[str, str]], list[list[str]]]:
    """Return (assessment_basis, header_row_as_dict_of_col_index, data_rows).

    The DQ Atlas CSVs prefix the table with 3 meta lines (Title / DQ Assessment
    basis / Source) and a blank line before the column-header row. We read
    everything into memory (files are tiny — ~60 rows × 15 cols).
    """
    with path.open("r", encoding="utf-8", newline="") as fh:
        reader = list(csv.reader(fh))
    # Row 1 (title), 2 (basis), 3 (source), 4 (blank), 5 (header), 6..N (data).
    basis = ""
    if len(reader) >= 2 and reader[1]:
        cell = reader[1][0]
        if cell.startswith("DQ Assessment based on: "):
            basis = cell[len("DQ Assessment based on: "):].strip()
    if len(reader) < 6:
        raise ValueError(f"{path.name}: too short ({len(reader)} rows)")
    header = reader[4]
    data = [row for row in reader[5:] if row and row[0].strip()]
    return basis, header, data


def headline_pct_column(header: list[str]) -> tuple[int, str] | None:
    """Locate the primary '%' column that drives the assessment.

    Heuristic: prefer a column whose title starts with "%" (the convention for
    most topics — headline percentage sits right after the "# Total ..."
    denominator, before any sub-file breakdowns). Fall back to the first
    column CONTAINING "%" for the two topics (Claims Volume OT, CMC Plan
    Encounters OT) whose headline metric is worded "... as % of National
    Median" and so doesn't lead with the sign. Returns None if no percent
    column is present — that would be a schema surprise worth surfacing.
    """
    titles = [name.strip().strip('"') for name in header]
    for i, title in enumerate(titles):
        if title.startswith("%"):
            return i, title
    for i, title in enumerate(titles):
        if "%" in title:
            return i, title
    return None


def build(csv_dir: Path) -> dict:
    csvs = sorted(csv_dir.glob("TAF-DQ-*.csv"))
    if not csvs:
        raise SystemExit(f"no CSVs found under {csv_dir}")

    topics: dict[str, dict] = {}
    unmapped_files: list[str] = []
    unmapped_states: set[str] = set()

    for path in csvs:
        key = topic_key_for(path.stem)
        if key is None:
            unmapped_files.append(path.name)
            continue
        year = parse_year(path.stem)
        basis, header, data = load_csv(path)
        pct_col = headline_pct_column(header)
        if pct_col is None:
            print(f"warn: {path.name} has no '%...' column; recording assessment only")
        pct_idx, pct_label = (pct_col[0], pct_col[1]) if pct_col else (-1, "")

        label, _ = label_and_description_for(key)
        entry = topics.setdefault(key, {
            "label": label,
            "description": basis,
            "metric_label": pct_label,
            "years": {},
        })
        # First non-empty basis/metric_label wins so preliminary/early files
        # don't overwrite the canonical wording once we hit a Release CSV.
        if not entry["description"] and basis:
            entry["description"] = basis
        if not entry["metric_label"] and pct_label:
            entry["metric_label"] = pct_label

        year_bucket: dict[str, dict] = entry["years"].setdefault(year, {})
        for row in data:
            if len(row) < 3:
                continue
            state_name = row[0].strip().strip('"')
            usps = STATE_NAME_TO_USPS.get(state_name)
            if usps is None:
                unmapped_states.add(state_name)
                continue
            assessment = normalize_assessment(row[2])
            pct = parse_pct(row[pct_idx]) if pct_idx >= 0 and pct_idx < len(row) else None
            rec: dict[str, object] = {"assessment": assessment}
            if pct is not None:
                rec["pct"] = pct
            year_bucket[usps] = rec

    if unmapped_files:
        raise SystemExit(
            "unrecognized DQ CSV filenames (extend TOPIC_PATTERNS): "
            + ", ".join(unmapped_files)
        )
    if unmapped_states:
        # A new territory or a rename is worth a warning but shouldn't crash
        # the build — the rest of the data is still usable.
        print(f"warn: unmapped state names: {sorted(unmapped_states)}")

    return {
        "topics": topics,
        "assessments": sorted(KNOWN_ASSESSMENTS),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in-dir", type=Path, default=DEFAULT_IN)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    out = build(args.in_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"), sort_keys=True)

    topic_count = len(out["topics"])
    year_count = sum(len(t["years"]) for t in out["topics"].values())
    state_count = sum(
        len(bucket)
        for t in out["topics"].values()
        for bucket in t["years"].values()
    )
    print(
        f"wrote {args.out.relative_to(REPO_ROOT)}: "
        f"{topic_count} topics × avg {year_count / topic_count:.1f} years, "
        f"{state_count:,} state-year records"
    )


if __name__ == "__main__":
    main()
