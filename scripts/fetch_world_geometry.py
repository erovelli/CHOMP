#!/usr/bin/env python3
"""Fetch Natural Earth 110m country polygons (non-US) as GeoJSON for the map.

The map shows neighbouring countries (Canada, Mexico, Cuba, etc.) in a flat grey
so the US data sits in regional context even without a Protomaps API key. The
US itself is filtered out — its area is covered by the project's state, county,
and ZIP3 layers rendered on top.

Source: Natural Earth admin-0 (110m), via the nvkelso/natural-earth-vector
mirror. Roughly ~250 KB raw / ~70 KB gzip after filtering, small enough to
serve as a plain GeoJSON source.

Output: public/world.geojson
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "public" / "world.geojson"
SRC_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_admin_0_countries.geojson"
)


def _us_iso(props: dict) -> bool:
    for k in ("ISO_A3", "ADM0_A3", "SOV_A3", "ISO_A3_EH"):
        v = (props.get(k) or "").upper()
        if v in {"USA", "US1"}:
            return True
    name = (props.get("NAME") or props.get("ADMIN") or "").lower()
    return name in {"united states", "united states of america"}


def main() -> int:
    print(f"Fetching {SRC_URL} ...")
    with urllib.request.urlopen(SRC_URL, timeout=60) as resp:
        fc = json.load(resp)

    out_features = []
    for f in fc.get("features", []):
        props = f.get("properties", {}) or {}
        if _us_iso(props):
            continue  # The US area is covered by the state/county/zip3 layers.
        iso = (props.get("ISO_A3") or props.get("ADM0_A3") or "").upper()
        out_features.append(
            {
                "type": "Feature",
                "id": iso or props.get("NAME"),
                "properties": {
                    "name": props.get("NAME") or props.get("ADMIN") or iso,
                    "ISO_A3": iso,
                },
                "geometry": f["geometry"],
            }
        )

    out = {"type": "FeatureCollection", "features": out_features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote {len(out_features)} countries -> {OUT_PATH}  ({size_kb:.1f} KB)")
    if not out_features:
        print("ERROR: no country features written", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
