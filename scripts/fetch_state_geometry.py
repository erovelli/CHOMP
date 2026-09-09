#!/usr/bin/env python3
"""Fetch US state polygons at 1:5,000,000 detail and emit a trimmed GeoJSON.

The frontend originally rendered states from a small (~107 KB) PMTiles archive
whose polygons were heavily generalized — coarse enough that the state fill's
coastline was visibly stepped against Protomaps' OSM-derived basemap
coastlines once the basemap was turned on. Bumping to Census's 1:5,000,000
cartographic-boundary tier gives coastlines that read as clean against the
basemap at every zoom the app allows (state view → county drill-down).
The 1:500,000 tier ships accurate to a few meters but weighs ~7 MB as
GeoJSON — overkill for a state-level choropleth where the map maxes out
at zoom 14 and states are the coarsest unit shown.

Follows the counties pattern (fetch_county_geometry.py): ship as GeoJSON
rather than PMTiles so we don't need tippecanoe in the build environment,
and so contributors can inspect / diff the geometry as text. 50 states + DC
+ 5 inhabited territories fits comfortably as a single GeoJSON — MapLibre
supports feature-state + promoteId on GeoJSON sources exactly like on
vector tiles.

Source: Census cartographic-boundary state shapefiles, 2023 edition,
1:5,000,000 scale. Public domain (17 U.S.C. § 105).

Output: public/states.geojson with per-feature properties trimmed to:
    postal : USPS two-letter code (also promoted to the feature id;
             matches the `state` key used across the aggregate NDJSON
             and the choropleth data-join)
    name   : Full state name (e.g. "California")

Usage:
    python scripts/fetch_state_geometry.py
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
OUT_PATH = REPO_ROOT / "public" / "states.geojson"
SRC_URL = "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_5m.zip"

# The .dbf carries `STUSPS` (USPS two-letter code) but only for the 50 states +
# DC + inhabited territories the counties layer also ships (AS/GU/MP/PR/VI).
# Everything else the CB file emits (nothing outside that set, but be safe) is
# rejected. Uninhabited territories (Baker Island, etc.) would break the join
# to the aggregate NDJSON, which is keyed on USPS.
KEEP_POSTAL = frozenset(
    [
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
        "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
        "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
        "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
        "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
        "WY",
        "AS", "GU", "MP", "PR", "VI",
    ]
)


def main() -> int:
    print(f"Fetching {SRC_URL} ...")
    with urllib.request.urlopen(SRC_URL, timeout=60) as resp:
        payload = resp.read()

    zf = zipfile.ZipFile(io.BytesIO(payload))
    shp_name = next(n for n in zf.namelist() if n.endswith(".shp"))
    stem = shp_name[:-4]

    # pyshp accepts file-like objects for shp/dbf/shx separately; feed the
    # in-memory zip entries directly so we don't touch disk for the raw
    # shapefile parts.
    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(f"{stem}.shp")),
        dbf=io.BytesIO(zf.read(f"{stem}.dbf")),
        shx=io.BytesIO(zf.read(f"{stem}.shx")),
    )

    field_names = [f[0] for f in reader.fields[1:]]  # skip the DeletionFlag
    if "STUSPS" not in field_names or "NAME" not in field_names:
        print(
            f"Unexpected shapefile schema — fields were {field_names}",
            file=sys.stderr,
        )
        return 1
    usps_idx = field_names.index("STUSPS")
    name_idx = field_names.index("NAME")

    out_features = []
    for sr in reader.iterShapeRecords():
        postal = sr.record[usps_idx]
        if postal not in KEEP_POSTAL:
            continue
        # Reuse pyshp's built-in GeoJSON emitter for the geometry so we
        # inherit correct MultiPolygon handling (Aleutian Islands, Florida
        # Keys, Michigan's UP, etc. — all multi-part).
        geom = sr.shape.__geo_interface__
        out_features.append(
            {
                "type": "Feature",
                "id": postal,
                "geometry": geom,
                "properties": {"postal": postal, "name": sr.record[name_idx]},
            }
        )

    if len(out_features) != len(KEEP_POSTAL):
        # Louder than a silent partial: if the source ever drops a state,
        # the choropleth join will silently render fewer polygons.
        got = {f["properties"]["postal"] for f in out_features}
        missing = sorted(KEEP_POSTAL - got)
        print(f"Missing states from source: {missing}", file=sys.stderr)
        return 1

    fc = {"type": "FeatureCollection", "features": out_features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(fc, fh, separators=(",", ":"))

    kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote {OUT_PATH.relative_to(REPO_ROOT)} — {len(out_features)} features, {kb:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
