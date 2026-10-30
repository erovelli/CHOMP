#!/usr/bin/env python3
"""Late-2024 claims completeness: how far November and December fall below the
January-October monthly mean, with the same months of 2023 as a seasonal reference.

Reads the published state-level monthly aggregate (public/data/), so it runs from
a fresh clone with no raw data. Writes docs/validation/late_2024_completeness.csv.

Usage
-----
    python scripts/validate_completeness.py
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
MONTHLY_STATE = REPO_ROOT / "public" / "data" / "provider_procedure_category_aggregate_monthly_state.json"
OUT = REPO_ROOT / "docs" / "validation" / "late_2024_completeness.csv"
YEARS = ("2023", "2024")


def main() -> None:
    claims: Counter[str] = Counter()
    with MONTHLY_STATE.open() as fh:
        for line in fh:
            for rows in json.loads(line).values():
                for r in rows:
                    claims[r["year_month"]] += r["total_claims"]

    out = []
    for year in YEARS:
        base = sum(claims[f"{year}-{m:02d}"] for m in range(1, 11)) / 10
        for month in (11, 12):
            n = claims[f"{year}-{month:02d}"]
            out.append(
                {
                    "year": year,
                    "month": month,
                    "claims": n,
                    "jan_oct_mean_claims": round(base),
                    "pct_below_jan_oct_mean": round(100 * (1 - n / base), 1),
                }
            )

    df = pd.DataFrame(out)
    df.to_csv(OUT, index=False)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
