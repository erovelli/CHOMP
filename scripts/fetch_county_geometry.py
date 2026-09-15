#!/usr/bin/env python3
"""Fetch US county polygons and emit a trimmed GeoJSON for the map.

The frontend renders states and ZIP3 areas from PMTiles (built with tippecanoe
upstream). Counties are served as a plain GeoJSON source instead: the build
environment has no tippecanoe/ogr2ogr to produce a county .pmtiles, and ~3.2k
county polygons are small enough to ship as GeoJSON (MapLibre supports
`feature-state` + `promoteId` on GeoJSON sources exactly like vector tiles).

Source: Census cartographic-boundary counties, 2023 vintage, 1:5,000,000
scale. This vintage is what makes the choropleth join to the aggregate NDJSON
correctly — the 2022 Census redistricting replaced Connecticut's 8 legacy
counties (09001..09015) with 9 Planning Regions (09110..09190), and the
aggregate is built on the new codes. Older mirrors (Plotly's geojson-counties-
fips.json, pre-2022 Census CB) still carry the legacy CT counties, which
silently drop every CT polygon at paint time. `NAMELSAD` is the Census-
canonical display label ("Autauga County", "Capitol Planning Region",
"Alexandria city", ...) so we don't have to reassemble it from NAME + LSAD.

Public domain (17 U.S.C. § 105).

Output: public/counties.geojson with per-feature properties trimmed to:
    GEOID : 5-digit FIPS string (also promoted to the feature id)
    name  : e.g. "Autauga County, AL"

Usage:
    python scripts/fetch_county_geometry.py
"""

from __future__ import annotations

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import shapefile  # type: ignore[import-untyped]  # pyshp

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "public" / "counties.geojson"
SRC_URL = "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip"

# 2-digit STATEFP we accept. 50 states + DC + the five inhabited territories
# whose postals appear in the aggregate NDJSON. Reject anything else loudly
# rather than silently emit a polygon the front end can't join to.
KEEP_STATEFP = frozenset(
    [
        "01", "02", "04", "05", "06", "08", "09", "10", "11", "12",
        "13", "15", "16", "17", "18", "19", "20", "21", "22", "23",
        "24", "25", "26", "27", "28", "29", "30", "31", "32", "33",
        "34", "35", "36", "37", "38", "39", "40", "41", "42", "44",
        "45", "46", "47", "48", "49", "50", "51", "53", "54", "55",
        "56",
        "60", "66", "69", "72", "78",
    ]
)


def main() -> int:
    print(f"Fetching {SRC_URL} ...")
    with urllib.request.urlopen(SRC_URL, timeout=120) as resp:
        payload = resp.read()

    zf = zipfile.ZipFile(io.BytesIO(payload))
    shp_name = next(n for n in zf.namelist() if n.endswith(".shp"))
    stem = shp_name[:-4]

    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(f"{stem}.shp")),
        dbf=io.BytesIO(zf.read(f"{stem}.dbf")),
        shx=io.BytesIO(zf.read(f"{stem}.shx")),
    )

    field_names = [f[0] for f in reader.fields[1:]]  # skip DeletionFlag
    required = {"STATEFP", "GEOID", "NAMELSAD", "STUSPS"}
    if not required.issubset(field_names):
        print(
            f"Unexpected shapefile schema — fields were {field_names}",
            file=sys.stderr,
        )
        return 1
    statefp_i = field_names.index("STATEFP")
    geoid_i = field_names.index("GEOID")
    namelsad_i = field_names.index("NAMELSAD")
    stusps_i = field_names.index("STUSPS")

    out_features = []
    seen_statefp: set[str] = set()
    for sr in reader.iterShapeRecords():
        statefp = sr.record[statefp_i]
        if statefp not in KEEP_STATEFP:
            continue
        seen_statefp.add(statefp)
        geoid = str(sr.record[geoid_i]).zfill(5)
        namelsad = sr.record[namelsad_i]
        postal = sr.record[stusps_i]
        # pyshp's built-in GeoJSON emitter handles MultiPolygon for multi-part
        # counties correctly (Aleutians, Louisiana parishes with islands, etc.).
        geom = sr.shape.__geo_interface__
        out_features.append(
            {
                "type": "Feature",
                "id": geoid,
                "properties": {"GEOID": geoid, "name": f"{namelsad}, {postal}"},
                "geometry": geom,
            }
        )

    missing_states = sorted(KEEP_STATEFP - seen_statefp)
    if missing_states:
        # Louder than a silent partial: a state falling out of the source
        # would leave that whole state blank on the county view.
        print(f"Missing STATEFP from source: {missing_states}", file=sys.stderr)
        return 1

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
