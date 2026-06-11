#!/usr/bin/env python3
"""Fetch US State Dept World Polygons (non-US) as GeoJSON for the map.

The map shows neighbouring countries (Canada, Mexico, Cuba, etc.) in a flat grey
so the US data sits in regional context even without a Protomaps API key. The
US itself is filtered out — its area is covered by the project's state, county,
and ZIP3 layers rendered on top.

Source: Department of State, Office of the Geographer — "World Polygons", the
polygon companion to the Large Scale International Boundaries (LSIB) dataset.
A public-domain US government work (17 U.S.C. § 105); no use restrictions.
Catalog record: https://geodata.state.gov/geonetwork/srv/api/records/a3dfdc5a-9524-4a55-8e66-774690c45d73

The only bulk download is a 2.4 GB GeoPackage, so this script pulls the
99.5%-generalized layer (suited for global-scale maps) from the public
GeoServer's KML endpoint instead (~60 MB; WFS is disabled on that server).
Tiny island parts are dropped and rings are Douglas-Peucker-simplified to land
near the previous Natural Earth 110m backdrop's size (~250 KB raw).

Output: public/world.geojson

Usage:
    python scripts/fetch_world_geometry.py [cached.kml]

    Pass a path to a previously downloaded KML to skip the ~60 MB fetch.
"""

from __future__ import annotations

import html
import json
import math
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "public" / "world.geojson"
SRC_URL = (
    "https://services.geodata.state.gov/geoserver/wp/wms/kml"
    "?layers=wp:DoS_WP_99_5&mode=download&kmscore=100"
)
KML_NS = "{http://www.opengis.net/kml/2.2}"

# Polygon parts smaller than this are invisible at the backdrop's zoom range
# (the map is centred on the US at zoom 4); dropping them is what keeps the
# 9.6k source parts down near the old Natural Earth 110m footprint.
MIN_PART_KM2 = 1500.0
# Douglas-Peucker tolerance in degrees. The 99.5% layer is generalized for
# 1:20M scale; the backdrop is fine far coarser than that — this lands the
# output near the old 110m-resolution file's ~250 KB.
SIMPLIFY_TOL_DEG = 0.12
COORD_DECIMALS = 3

# US sovereignty is excluded: the fifty states plus DC are covered by the
# project's own layers, and the territories are either rendered there too
# (PR via state/ZIP3) or are sub-pixel at backdrop scale. Belt-and-braces
# fallback for the WP_PAR_ID parent-UUID check below.
US_GENC3 = {"USA", "PRI", "GUM", "VIR", "ASM", "MNP", "UMI"}

ATTR_RE = re.compile(
    r'class="atr-name">([^<]+)</span>\s*:\s*</strong>\s*'
    r'<span class="atr-value">([^<]*)</span>',
    re.S,
)


def _parse_attrs(description: str) -> dict[str, str]:
    """KML descriptions hold the attribute table as escaped HTML."""
    return {k.strip(): v.strip() for k, v in ATTR_RE.findall(html.unescape(description))}


def _parse_ring(coord_text: str) -> list[list[float]]:
    ring = []
    for token in coord_text.split():
        lon, lat = token.split(",")[:2]
        ring.append([float(lon), float(lat)])
    return ring


def _ring_area_km2(ring: list[list[float]]) -> float:
    """Planar shoelace on an equirectangular projection — fine at island scale."""
    if len(ring) < 4:
        return 0.0
    mean_lat = sum(p[1] for p in ring) / len(ring)
    kx = 111.32 * math.cos(math.radians(mean_lat))
    ky = 110.57
    area2 = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        area2 += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(area2) / 2.0


def _simplify(ring: list[list[float]], tol: float) -> list[list[float]]:
    """Iterative Douglas-Peucker; keeps the ring closed."""
    if len(ring) <= 4:
        return ring
    pts = ring[:-1]  # open the ring; re-close at the end
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        x1, y1 = pts[lo]
        x2, y2 = pts[hi]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best_d, best_i = -1.0, -1
        for i in range(lo + 1, hi):
            px, py = pts[i]
            if norm == 0.0:
                d = math.hypot(px - x1, py - y1)
            else:
                d = abs(dx * (y1 - py) - dy * (x1 - px)) / norm
            if d > best_d:
                best_d, best_i = d, i
        if best_d > tol:
            keep[best_i] = True
            stack.append((lo, best_i))
            stack.append((best_i, hi))
    out = [p for p, k in zip(pts, keep) if k]
    out.append(out[0])
    return out


def _round_ring(ring: list[list[float]]) -> list[list[float]]:
    out: list[list[float]] = []
    for lon, lat in ring:
        p = [round(lon, COORD_DECIMALS), round(lat, COORD_DECIMALS)]
        if not out or p != out[-1]:
            out.append(p)
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def _parse_kml(data: bytes) -> list[dict]:
    """One record per Placemark: attrs + polygon rings (label Points skipped)."""
    records = []
    root = ET.fromstring(data)
    for pm in root.iter(f"{KML_NS}Placemark"):
        desc = pm.findtext(f"{KML_NS}description") or ""
        attrs = _parse_attrs(desc)
        for poly in pm.iter(f"{KML_NS}Polygon"):
            outer = poly.findtext(
                f"{KML_NS}outerBoundaryIs/{KML_NS}LinearRing/{KML_NS}coordinates"
            )
            if not outer:
                continue
            holes = [
                _parse_ring(c.text)
                for c in poly.findall(
                    f"{KML_NS}innerBoundaryIs/{KML_NS}LinearRing/{KML_NS}coordinates"
                )
                if c.text
            ]
            records.append({"attrs": attrs, "outer": _parse_ring(outer), "holes": holes})
    return records


def main() -> int:
    if len(sys.argv) > 1:
        print(f"Reading cached KML {sys.argv[1]} ...")
        data = Path(sys.argv[1]).read_bytes()
    else:
        print(f"Fetching {SRC_URL} ...")
        req = urllib.request.Request(SRC_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = resp.read()
        print(f"  downloaded {len(data) / 1e6:.1f} MB")

    records = _parse_kml(data)
    print(f"Parsed {len(records):,} polygon parts")

    # The parent-UUID field ties dependencies to their sovereign; resolve the
    # US's WP_ID so its minor outlying islands drop with it.
    us_wp_ids = {
        r["attrs"].get("WP_ID")
        for r in records
        if r["attrs"].get("GENC_3") in US_GENC3 and r["attrs"].get("WP_ID")
    }

    countries: dict[str, dict] = {}
    for rec in records:
        attrs = rec["attrs"]
        if attrs.get("GENC_3") in US_GENC3 or attrs.get("WP_PAR_ID") in us_wp_ids:
            continue
        if _ring_area_km2(rec["outer"]) < MIN_PART_KM2:
            continue

        outer = _round_ring(_simplify(rec["outer"], SIMPLIFY_TOL_DEG))
        if len(outer) < 4:
            continue
        rings = [outer]
        for hole in rec["holes"]:
            if _ring_area_km2(hole) < MIN_PART_KM2:
                continue
            h = _round_ring(_simplify(hole, SIMPLIFY_TOL_DEG))
            if len(h) >= 4:
                rings.append(h)

        iso = attrs.get("GENC_3", "")
        name = attrs.get("DOS_Short") or attrs.get("WP_Name") or iso
        key = iso or name
        entry = countries.setdefault(
            key, {"name": name, "ISO_A3": iso, "polygons": []}
        )
        entry["polygons"].append(rings)

    out_features = []
    for key, entry in sorted(countries.items()):
        polys = entry["polygons"]
        geometry = (
            {"type": "Polygon", "coordinates": polys[0]}
            if len(polys) == 1
            else {"type": "MultiPolygon", "coordinates": polys}
        )
        out_features.append(
            {
                "type": "Feature",
                "id": key,
                "properties": {"name": entry["name"], "ISO_A3": entry["ISO_A3"]},
                "geometry": geometry,
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
    if any(c in countries for c in US_GENC3):
        print("ERROR: US feature leaked into the backdrop", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
