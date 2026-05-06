"""One-off helper: build a small HHS smoke-test CSV using pandas (fast).

Reads the HHS CSV in chunks, accumulates D-code rows for 2018-01 only,
stops as soon as we have N matching rows. Pandas reads C-fast so this
finds matches in seconds, not the 15+ min a pure-Python scan would take.

Run from the worktree root:
    python scratch/build_smoke_sample.py
"""
import pandas as pd
import sys
from pathlib import Path

SRC = Path("../../../data/HHS/medicaid-provider-spending.csv")
DST = Path("../../../data/HHS/_smoke_sample.csv")
TARGET_MONTH = "2018-01"
TARGET_ROWS = 5000

if not SRC.exists():
    print(f"ERROR: source not found: {SRC}")
    sys.exit(1)

found = []
total_scanned = 0
chunk_size = 2_000_000

print(f"scanning {SRC} for D-codes in {TARGET_MONTH}...")
for chunk in pd.read_csv(SRC, dtype=str, chunksize=chunk_size):
    total_scanned += len(chunk)
    matches = chunk[
        chunk["HCPCS_CODE"].str.startswith("D", na=False)
        & (chunk["CLAIM_FROM_MONTH"] == TARGET_MONTH)
    ]
    if not matches.empty:
        found.append(matches)
    have = sum(len(m) for m in found)
    print(f"  scanned {total_scanned:,} rows total, found {have:,} matches")
    if have >= TARGET_ROWS:
        break

if not found:
    print(f"ERROR: no D-code rows found for {TARGET_MONTH} in {total_scanned:,} rows scanned")
    sys.exit(2)

out = pd.concat(found, ignore_index=True).head(TARGET_ROWS)
out.to_csv(DST, index=False)
print(f"\nwrote {len(out):,} rows -> {DST}")
print(f"sample row:\n{out.iloc[0].to_dict()}")
