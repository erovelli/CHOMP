#!/usr/bin/env python3
"""Fetch US county polygons and emit a trimmed GeoJSON for the map.

The frontend renders states and ZIP3 areas from PMTiles (built with tippecanoe
upstream). Counties are served as a plain GeoJSON source instead: the build
environment has no tippecanoe/ogr2ogr to produce a county .pmtiles, and ~3.2k
county polygons are small enough to ship as GeoJSON (MapLibre supports
`feature-state` + `promoteId` on GeoJSON sources exactly like vector tiles).

Source: Census cartographic-boundary counties, mirrored by Plotly. Each feature's
top-level `id` is the 5-digit county FIPS (GEOID) — the same key used by the
county aggregate NDJSON (`provider_procedure_category_aggregate_*_county.json`).

Output: public/counties.geojson with per-feature properties trimmed to:
    GEOID : 5-digit FIPS string (also promoted to the feature id)
    name  : e.g. "Autauga County, AL"

Usage:
    python scripts/fetch_county_geometry.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "public" / "counties.geojson"
SRC_URL = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"

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


def main() -> int:
    print(f"Fetching {SRC_URL} ...")
    with urllib.request.urlopen(SRC_URL, timeout=60) as resp:
        fc = json.load(resp)

    out_features = []
    for f in fc.get("features", []):
        geoid = str(f.get("id") or "").zfill(5)
        if len(geoid) != 5 or not geoid.isdigit():
            continue
        props = f.get("properties", {})
        county_name = props.get("NAME", "")
        lsad = props.get("LSAD", "County")
        postal = FIPS_TO_USPS.get(geoid[:2], geoid[:2])
        label = f"{county_name} {lsad}".strip()
        if postal:
            label = f"{label}, {postal}"
        out_features.append(
            {
                "type": "Feature",
                "id": geoid,
                "properties": {"GEOID": geoid, "name": label},
                "geometry": f["geometry"],
            }
        )

    out = {"type": "FeatureCollection", "features": out_features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))

    size_mb = OUT_PATH.stat().st_size / 1e6
    print(f"Wrote {len(out_features):,} counties -> {OUT_PATH}  ({size_mb:.2f} MB)")
    if not out_features:
        print("ERROR: no county features written", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
