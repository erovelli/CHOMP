# ADR 0004 — Synthesized export via d3-geo + off-screen Canvas

- **Status:** Accepted
- **Date:** 2026-06-10
- **Supersedes:** —

## Context

The **Export** button needs to produce a self-contained PNG/JPEG of the current
choropleth view, plus a CSV of the per-region totals. The image is a save-action
target — likely destinations are slide decks, policy briefs, and Twitter — so
it has to look intentional, not like a screenshot of a dev tool.

Three rendering strategies were on the table:

1. **`map.getCanvas().toBlob()`** — capture whatever MapLibre is currently
   drawing.
2. **A second hidden MapLibre instance** with a fixed extent and a different
   style, rendered off-screen.
3. **Pure-JS synthesis** with [`d3-geo`](https://github.com/d3/d3-geo) drawing
   to an off-screen `<canvas>`, no MapLibre involved.

Option 1 is the cheap path. It also encodes everything that's wrong for the
output: the basemap tiles (which we're not licensed to redistribute under all
Protomaps tiers), the viewport at whatever zoom/pan the user happens to be on,
AK/HI placement that depends on Mercator scaling at that viewport, no PR (it's
outside the contiguous viewport), and no clean way to add a title block or
legend without overlaying React DOM that then needs to be flattened back into
the image.

Option 2 fixes the viewport problem but inherits the basemap-license problem
and the lack of layout control. It also doubles the MapLibre runtime cost on
the Export click (instantiate a second `Map`, addControl, addLayer, wait for
`load`, screenshot).

Option 3 has none of those problems but adds three runtime dependencies
(`d3-geo`, `topojson-client`, `papaparse`) and requires re-implementing
MapLibre's `interpolate(linear, value, …stops)` color logic in plain JS.

## Decision

**Option 3.** Render the export from scratch via `d3-geo` + off-screen Canvas.

Concretely, [`src/lib/export/synthesizeMap.ts`](../../src/lib/export/synthesizeMap.ts):

- Fetches [`public/data/export/states-10m.json`](../../public/data/export/states-10m.json)
  (us-atlas v3 TopoJSON, 56 features = 50 states + DC + PR + 4 territories) on
  first Export click and caches it module-scope.
- Projects the main features with `geoAlbersUsa()`, which positions AK and HI
  automatically. Renders PR via a separate `geoMercator()` clipped to a
  200×140 lower-right inset (Albers USA returns `null` for PR coordinates).
  At county level the PR municipios (GEOID prefix `72`) go in the inset; at
  ZIP3 level the PR/USVI ZIP3s `006`–`009` share the inset.
- At state level, renders GU / MP / VI as labeled color chips under the PR
  inset — they have state-level claims data but `geoAlbersUsa` projects
  them to null. AS is in the TopoJSON but not in the claims data, so it
  doesn't appear. County/ZIP3 levels skip these chips because the chip
  lookup is by USPS postal and isn't defined at sub-state grain.
- Geometry source switches per level: us-atlas TopoJSON for state,
  `counties.geojson` (3221 features, already shipped) for county,
  `zip3codes.geojson` (896 features, already shipped) for ZIP3. All three
  are fetched lazily and cached module-scope; an in-flight guard prevents
  duplicate concurrent fetches when the modal repaints during the 300 ms
  preview debounce.
- Computes each state's value with `getValueForRegion` (same call the live
  choropleth makes) and derives 7-quantile color stops via the same
  `quantileStops` helper in [`mapStyles.ts`](../../src/lib/mapStyles.ts).
- Maps a value → hex color via
  [`colorScale.ts`](../../src/lib/export/colorScale.ts) — a plain-JS port of
  MapLibre's `interpolate(linear)` expression. **One source of truth for stop
  positions; two evaluators (GPU expression, JS function) for the two paint
  destinations.**
- Returns the `HTMLCanvasElement`. Caller (the modal) calls `toBlob` for PNG
  or composes onto a white background before `toBlob("image/jpeg", 0.92)`.

The whole export module (modal + synthesizer + CSV + d3-geo/topojson-client/papaparse)
ships as a `React.lazy` chunk — loaded on the first Export click, not on map load.

## Consequences

**Positive**

- **Deterministic layout.** The exported image is identical regardless of
  current zoom, pan, or basemap availability. AK/HI/PR always land in the same
  places.
- **No basemap-license question.** Nothing from Protomaps appears in the
  exported file. Acceptable to redistribute the PNG/JPEG anywhere.
- **One color-scale source of truth.** Both the live MapLibre paint expression
  and the off-screen Canvas use the same `quantileStops` output — so the
  exported image's ramp matches the on-screen ramp by construction, not by
  best-effort visual match.
- **Critical path untouched.** Lazy chunk keeps `d3-geo` + `topojson-client` +
  `papaparse` (~22 KB gzip) out of the initial bundle. Initial JS stays under
  the 300 KB size-limit budget; the export chunk has its own 40 KB budget.
- **Cleanly testable.** The CSV builder is a pure function over the in-memory
  caches with 10 unit tests covering column order, period filtering, category
  aggregation, and territory naming.

**Negative**

- **No live basemap context.** The synthesized PNG shows state polygons on a
  blank background — no street grid, no city labels, no coastline shading.
  That's a feature for legibility but a regression for users who wanted the
  Protomaps backdrop.
- **Geometry weight on first county/ZIP3 export.** Counties and ZIP3 levels
  load `counties.geojson` (2.7 MB / 0.85 MB gz) or `zip3codes.geojson`
  (8.3 MB / ~2 MB gz) on first click. The files already ship with the site;
  the browser cache hits after the first fetch. A future iteration could
  ship a pre-simplified, export-only TopoJSON to cut payload further, but
  the tooling-light status quo (`tippecanoe`/`ogr2ogr` absent on the build
  host — see ADR drafts) makes that a follow-up.
- **Three new runtime dependencies.** `d3-geo`, `topojson-client`,
  `papaparse`. All small, all tree-shake friendly, all live in the lazy
  chunk — but they're still dependencies to track for CVEs.
- **Color logic duplicated, kind of.** MapLibre evaluates the linear
  interpolation on the GPU; `colorScale.ts` evaluates it in JS. The
  CHOROPLETH_COLORS palette and the `quantileStops` algorithm are still
  single-source — only the interpolation evaluator is duplicated, with a
  unit-test budget for keeping the two in lockstep.

## Alternatives considered

| Option                                       | Why not                                                                                                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map.getCanvas().toBlob()`                   | Captures basemap tiles, viewport-dependent layout, no PR, no title block. Quality unacceptable.                                                                                                     |
| Second hidden `maplibregl.Map`               | Inherits the basemap-licensing question; doubles MapLibre cost on the click; layout still hard.                                                                                                     |
| Server-side rendering via puppeteer / canvas | Reintroduces a backend; contradicts the static-site decision in [ADR 0001](0001-static-site-no-backend.md).                                                                                         |
| SVG export instead of PNG                    | SVG is editable downstream (a plus), but our color logic needs Canvas-style compositing for the JPEG white-bg case, and the file gets large with 50+ state polygons rendered at us-atlas precision. |

## Related

- [ADR 0001 — Static site, no backend](0001-static-site-no-backend.md)
- [ADR 0003 — Feature-state over `setData` for dynamic choropleth](0003-feature-state-over-setdata.md)
- [DATA_DICTIONARY § Downstream CSV export](../DATA_DICTIONARY.md#downstream-csv-export)
