# Architecture

> **Audience:** engineers evaluating the codebase, contributors preparing a PR, and a future reader wondering why a given decision was made.

This document is the long-form complement to the [top-level README](../README.md). The README describes _what_ the project is; this document describes _why it's built the way it is_.

## Contents

1. [Problem framing](#1-problem-framing)
2. [System overview](#2-system-overview)
3. [Data pipeline](#3-data-pipeline)
4. [Frontend architecture](#4-frontend-architecture)
5. [Map rendering model](#5-map-rendering-model)
6. [State management](#6-state-management)
7. [Performance](#7-performance)
8. [Trade-offs and deferred work](#8-trade-offs-and-deferred-work)
9. [Architecture Decision Records](#9-architecture-decision-records)

---

## 1. Problem framing

The raw inputs are three large, public, and structurally incompatible datasets:

| Dataset                                | Shape                   | Size                     | What it has                                  | What is missing              |
| -------------------------------------- | ----------------------- | ------------------------ | -------------------------------------------- | ---------------------------- |
| HHS Open Data (Medicaid dental claims) | Per NPI × HCPCS × month | Tens of millions of rows | Claim counts, $ paid, beneficiaries served   | Any geography. Any category. |
| CMS NPPES                              | Per NPI                 | ~9M rows, ~330 columns   | Provider name, practice location, taxonomies | No claim or spending data.   |
| Census TIGER/Line                      | Polygons                | ~200 MB                  | State and ZIP-area geometries                | No healthcare data.          |

The "join everything, aggregate, serve over HTTP" problem is deliberately straightforward in concept and painful in practice. The source-of-truth table after join-and-enrichment is tens of millions of rows; the user-facing payload has to fit in a mobile-network budget. The pipeline exists to get from the first to the second without losing the ability to rebuild or audit any intermediate step.

## 2. System overview

```
   ╔═══════════════════╗      ╔═══════════════════╗      ╔═══════════════════╗
   ║    SOURCE DATA    ║─────►║      BUILD        ║─────►║      RUNTIME      ║
   ║  (external, raw)  ║      ║   (Python + DuckDB)║     ║    (browser)      ║
   ╚═══════════════════╝      ╚═══════════════════╝      ╚═══════════════════╝
          HHS + NPPES              merge + aggregate       React + MapLibre
            +Census                 NDJSON export           Static hosting
```

There are exactly two runtimes in this project, intentionally decoupled:

- **The build runtime** — a handful of Python scripts under `scripts/` (the HHS×NPPES merge, geocoded-CSV join, county/world-geometry fetch, ACS denominator fetch + rollup) plus [`scripts/build_aggregates.py`](../scripts/build_aggregates.py), a DuckDB script that reads the merged+geocoded CSV and emits the six numerator NDJSON files. A second script, [`scripts/build_medicaid_enrollment.py`](../scripts/build_medicaid_enrollment.py), rolls ACS C27007 county/ZCTA enrollment into three denominator NDJSONs that pair with the numerators for the per-enrollee rate metric. Produces those files plus PMTiles + GeoJSON geometry artifacts. Runs _on the maintainer's laptop, manually, when source data updates._
- **The serving runtime** — React + Vite + MapLibre. Reads only the static artifacts. Runs _in every visitor's browser._

The NDJSON files and `.pmtiles` archives are the **interface contract** between the two. Everything upstream of those artifacts can change without breaking the frontend, and vice versa, as long as the file names and schemas hold.

This is the single most consequential architectural decision in the project, and it flows from two constraints:

1. **Operations.** Production on Harvard SHARE and staging on GitHub Pages both serve the same static bundle, so there is no application server to provision or operate.
2. **Privacy.** The source data is public but a live backend would expose query patterns that the suppression rules (<12 claims / <12 beneficiaries per cell) are designed to prevent. Pre-aggregating at build time means only the published aggregations are accessible.

## 3. Data pipeline

### 3.1 Build chain

The build runtime is a series of Python scripts under `scripts/`, run manually
in order on the maintainer's laptop when source data updates. No database; no
shell glue; each step is a single `python …` invocation that reads one set of
files and writes another.

```text
HHS Medicaid CSV ┐
                 ├── merge_hhs_nppes.py ──► merged_hhs_nppes.csv ─┐
NBER NPPES zips  ┘                                                ├── join_geocoded.py ──► merged_hhs_nppes_geo.csv ──┐
                                ArcGIS-geocoded addresses ────────┘                                                  │
                                                                                                                      ▼
                                                              build_aggregates.py (DuckDB) ──► public/data/provider_*.json (numerator)
                                                                                                                      │
                                              fetch_county_geometry.py ──► public/counties.geojson                    │
                                              fetch_world_geometry.py  ──► public/world.geojson                       │
                                              fetch_acs_medicaid.py    ──► data/ACS medicaid enrollment/*.csv         │
                                                                                            │                         │
                                                                build_medicaid_enrollment.py ▼                         │
                                                                  (county→state, ZCTA→ZIP3)                            │
                                                                            │                                          │
                                                                            ▼                                          │
                                                  public/data/medicaid_enrollment_*.json (denominator)                 │
                                                                                                                      ▼
                                                                                                              ──── consumed by Vite/React ────
```

The HHS × NPPES join is done in Python rather than SQL because the NPPES
archives are deflate64-compressed (needs 7-Zip, not stdlib zipfile) and a
streaming per-month flow is dramatically cheaper than loading 84 × ~9M-row
vintages into a database for a single inner join.

### 3.2 DuckDB aggregator

[`scripts/build_aggregates.py`](../scripts/build_aggregates.py) reads the
merged+geocoded CSV (~23M rows) and emits **six** NDJSON files —
`{annual, monthly} × {state, county, zip3}` — in ~10s on a laptop, with no
database load step.

- HCPCS → category mapping is one DuckDB `CASE` expression, **mirrored in the
  frontend's `CATEGORY_TO_KEY`** in `src/constants/map.ts`. Two copies of the
  same fact, deliberately: the build script is the source of truth for the
  back end; the TS is the source of truth for the UI shell.
- `county` is keyed on the 5-digit geocoded `county_fips`.
- `state` is **built from county sums** — postal is derived from
  `LEFT(county_fips, 2)` via a FIPS→USPS map — so `state == SUM(county)` holds
  exactly (verified at build time).
- `zip3` is `LEFT(practice_zip5, 3)`, which keeps a slightly larger row
  universe than county/state (see L33 — the levels intentionally do not
  reconcile).

Output format: NDJSON, where each line is `{"<region_id>": [<records>…]}` — a
key-partitioned bundle that [`dataService.fetchNDJSON`](../src/lib/dataService.ts)
splits and merges into the in-memory cache. NDJSON gzips better than a wrapping
JSON array and is streamable if a future iteration moves to incremental load.

> **Historical note.** Earlier revisions of this project shipped a Postgres
> view chain (`migrations/aggregate_views/`) plus a `psql`-based
> `scripts/export_views.sh`. Both were removed once DuckDB became the
> authoritative builder — Postgres was never provisioned in CI and the SQL was
> never executed in any environment.

### 3.3 Cell suppression

HHS suppresses any provider-month-code cell with fewer than 12 claims or 12 unique beneficiaries. This is preserved end-to-end: suppressed rows are simply absent from the raw data, and the aggregations pass through only what arrives. The absence is surfaced through the InfoModal on first load, not hidden.

## 4. Frontend architecture

### 4.1 Layering

```
  App.tsx
   ├── Header.tsx ──┐
   │                │
   │                ├── LayerControl.tsx      ── reads store.activeLayer
   │                ├── GeoLevelControl.tsx   ── reads store.geoLevel
   │                ├── MetricControl.tsx     ── reads store.metric
   │                ├── TimeControl.tsx       ── reads store.selectedYear/selectedMonth
   │                ├── Legend.tsx            ── reads store.activeLayer / colorStops
   │                ├── Tooltip.tsx           ── reads store.hovered*
   │                ├── ClickHint.tsx         ── reads store.hintVisible
   │                ├── InfoModal.tsx         ── local state
   │                ├── ExportModal.tsx       ── lazy chunk; reads store snapshot
   │                │                            renders synthesized PNG/JPEG via
   │                │                            lib/export/synthesizeMap.ts and
   │                │                            current-view CSV via lib/export/csv.ts
   │                └── DetailPanel/
   │                    ├── index.tsx         ── reads store.panelOpen/selectedDetail
   │                    └── PanelContent.tsx  ── reads store.selectedYear
   │                        ├── StatCard.tsx
   │                        └── CategoryBreakdown.tsx
   │
   └── MapContainer.tsx      ── owns the maplibregl.Map instance
                             ── reads store.activeLayer / selectedYear
                             ── writes store.selectedRegion / hovered*
```

The shape is intentionally flat:

- **One component owns the Map.** `MapContainer.tsx` is the only place where `maplibregl.Map` is instantiated, mutated, and torn down. Everything else reads from the Zustand store or from callbacks that route through it.
- **No component composition frameworks.** No styled-components, Emotion, Tailwind, Radix, shadcn — just inline style objects on primitives. This project's UI is small enough that a component library would be more infrastructure than payoff, and portfolio-legibility is better served by vanilla React.
- **Constants are siblings, not magic numbers.** Every duration, z-index, color, and layer name lives in `src/constants/`. Component files read those constants; hard-coding is never used.

### 4.2 Types as contracts

```ts
type LayerKey =
  | "all"
  | "diagnostic"
  | "preventive"
  | "restorative"
  | "endodontics"
  | "periodontics"
  | "prosthodontics_removable"
  | "maxillofacial_prosthetics"
  | "implant_services"
  | "prosthodontics_fixed"
  | "oral_max_surgery"
  | "orthodontics"
  | "adjunctive";
```

`LayerKey` is the spine of the app. `LAYER_CONFIGS: Record<LayerKey, LayerConfig>` and `LAYER_ORDER: LayerKey[]` both reference it, so adding a new category is a single-line change that the compiler propagates through: the `LayerControl`, `Legend`, `Tooltip`, color derivation, and map paint expressions all update without search-and-replace.

### 4.3 Export pipeline

The **Export** button in the header opens [`ExportModal`](../src/components/ui/ExportModal.tsx), which produces three deliverables from the same current store snapshot (active layer × year × metric × geo level):

| Format       | Renderer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PNG/JPEG** | [`synthesizeMap.ts`](../src/lib/export/synthesizeMap.ts) draws a Wikipedia-style choropleth to an off-screen Canvas at 1600×1000 via [`d3-geo`](https://github.com/d3/d3-geo). The geometry source switches with the active geo level: us-atlas TopoJSON for state, [`counties.geojson`](../public/counties.geojson) for county, [`zip3codes.geojson`](../public/zip3codes.geojson) for ZIP3. `geoAlbersUsa` handles AK/HI auto-rescale at every level; PR (state, municipios, or 006/007/008/009 ZIP3s) renders through a separate `geoMercator` projection clipped to a lower-right inset. State view also paints labeled color chips for the GU/MP/VI claims-only territories. **Not** a screenshot of the live MapLibre canvas — synthesized purely from current store + data caches, so the output is deterministic and styleable independently of the basemap. |
| **CSV**      | [`csv.ts`](../src/lib/export/csv.ts) walks the active-level claims cache and emits one row per region with the documented column order. Uses Papa Parse for quoting/escape. See [DATA_DICTIONARY § Downstream CSV export](DATA_DICTIONARY.md#downstream-csv-export).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Two design decisions kept this small and stayed out of the critical path:

1. **One color-scale source of truth.** The synthesized PNG uses [`colorScale.ts`](../src/lib/export/colorScale.ts), a plain-JS port of MapLibre's `interpolate(linear, value, …stops)` paint expression. The same `quantileStops` helper from [`mapStyles.ts`](../src/lib/mapStyles.ts) feeds both the live choropleth and the export — so the ramp on screen matches the ramp in the saved file exactly.
2. **Lazy chunk for the deps.** `d3-geo`, `topojson-client`, and `papaparse` together gzip to ~22 KB and are only needed once a user clicks **Export**. `Header.tsx` loads `ExportModal` via `React.lazy`, so those bytes never enter the initial-load bundle. See ADR 0004.

The TopoJSON for the synthesized map ([`public/data/export/states-10m.json`](../public/data/export/states-10m.json), us-atlas v3) is fetched on first Export click and cached for the session. It already contains 56 features — 50 states + DC + PR + the four small territories — so the export doesn't need a second geometry source.

## 5. Map rendering model

This is the part most worth reading.

### 5.1 The three "states" of a feature

Every state polygon and every ZIP3 polygon carries three feature-state fields:

| Field      | Type    | Source       | Meaning                                                                                                                       |
| ---------- | ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `value`    | number  | Data JSON    | Active metric for the (year, category): total claims (volume) or claims-per-Medicaid-enrollee (penetration; ACS C27007 denom) |
| `hover`    | boolean | Mouse events | Cursor is over this polygon                                                                                                   |
| `selected` | boolean | Click events | Detail panel is open on this polygon                                                                                          |

The paint expression (`buildColorExpression` in [`src/lib/mapStyles.ts`](../src/lib/mapStyles.ts)) collapses these into a `fill-color`:

```
case
  feature-state.selected   → HOVER_COLOR
  feature-state.hover      → HOVER_COLOR
  default                  → interpolate(linear, value, CHOROPLETH_STOPS)
```

### 5.2 Why `setFeatureState`, not `setData`

The naïve approach to a choropleth is: store the data in GeoJSON properties, and call `setData` to refresh. With ~930 ZIP3 polygons and no animation that would be fine. But the map re-colors on every year change, every category change, and on hover — and `setData` re-uploads the entire source, which is both expensive and user-visible (sub-second flicker).

Instead:

1. Geometry is loaded once, via PMTiles, at map `load`.
2. `paintAllFeatureStates()` walks the in-memory caches and writes a `value` feature-state for every region.
3. Year/category changes call `paintAllFeatureStates()` again — **no source upload, no tile re-parse**.
4. Hover and selection write _different_ feature-state fields on the _single hovered/selected ID_, not the whole set.

The result: the map updates in a single frame on category/year change, and hover has no measurable overhead.

### 5.3 Refs for hover/selection IDs

```ts
const hoveredStateRef = useRef<string | null>(null);
const selectedStateRef = useRef<string | null>(null);
// ...and the same for zip3
```

These look like an escape hatch, but refs are the right tool here. The alternative is putting the IDs in Zustand and reacting to store changes — which would mean:

- Every mouse-move triggers a Zustand write.
- Every Zustand write would trigger a render of every subscribed component.
- Map event handlers re-create in `useCallback` on every ID change, blowing up the effect dependency graph.

Instead, the refs hold the IDs, the handlers write directly to MapLibre's feature-state (which the GPU picks up on the next frame), and the store is only written when the _user-facing_ state changes (hovered region label, tooltip position, detail panel).

## 6. State management

Zustand was picked over Redux / Context / Jotai because:

- The store has ~10 fields, not 100. A hand-written store with flat setters is legible.
- Selector hooks avoid the Context-re-render tax. Components that read `activeLayer` don't re-render when `hoveredPoint` changes.
- There's no middleware story to learn (thunks, sagas, RTK query). This app doesn't need one.

The store's single interesting piece of logic is in `setSelectedYear`, which clears `selectedMonth` — so switching from "June 2022" to 2023 lands on "Annual 2023" instead of "June 2023", which most users don't expect to exist.

## 7. Performance

### 7.1 Payload budget

| File                              | Size (raw / gzip) | When loaded                                          |
| --------------------------------- | ----------------- | ---------------------------------------------------- |
| Main JS bundle                    | ~285 KB gzip      | On first load                                        |
| CSS bundle                        | ~9.5 KB gzip      | On first load                                        |
| `ExportModal` lazy chunk          | ~22 KB gzip       | On first **Export** button click                     |
| `data/export/states-10m.json`     | 115 KB / 37 KB    | On first **Export** button click (us-atlas TopoJSON) |
| `states.pmtiles`                  | ~105 KB           | On map `load`                                        |
| `zip3.pmtiles`                    | ~1 MB             | On map `load`                                        |
| `counties.geojson`                | 2.7 MB / 0.85 MB  | On map `load` (county source)                        |
| `…_annual_state.json`             | 0.45 MB / 60 KB   | On map `load`                                        |
| `…_annual_county.json`            | 10 MB / 1.2 MB    | On map `load`                                        |
| `…_annual_zip3.json`              | 5.4 MB / 0.66 MB  | On map `load`                                        |
| `medicaid_enrollment_state.json`  | ~10 KB            | On map `load`                                        |
| `medicaid_enrollment_county.json` | ~0.7 MB           | On map `load`                                        |
| `medicaid_enrollment_zip3.json`   | ~0.15 MB          | On map `load`                                        |
| `…_monthly_state.json`            | 5.2 MB / 0.6 MB   | On first monthly slider interaction                  |
| `…_monthly_county.json`           | 99 MB / 10.3 MB   | On first monthly slider interaction                  |
| `…_monthly_zip3.json`             | 58 MB / 6.3 MB    | On first monthly slider interaction                  |

Bundle budgets live in [`package.json`'s `size-limit` block](../package.json) — initial 300 KB, export chunk 40 KB, CSS 30 KB. CI runs `npm run size` so a regression on any of those fails the build before it merges.

Two elephants now: the deferred **monthly ZIP3 (58 MB)** and the new **monthly
county (99 MB / 10.3 MB gzip)**, the largest artifact in the project. Both are
loaded only on the first monthly-slider interaction, and `loadMonthlyData()`
still fetches all three levels in one shot (so opening month view at _any_ level
pulls the county file too — a known cost). A post-MVP iteration (see
[`docs/adr/0002-zip3-monthly-as-pmtiles.md`](adr/0002-zip3-monthly-as-pmtiles.md))
should move the monthly grains to a vector-tile / range-requestable format and/or
lazy-load monthly per active level. County geometry is GeoJSON rather than
PMTiles because the build host lacks tippecanoe/ogr2ogr (see L36).

### 7.2 Runtime

- No re-renders during map interaction. The hover tooltip uses pixel coordinates pushed through Zustand, but the components that re-render on those writes are exactly two: `Tooltip` and `ClickHint`.
- MapLibre runs on WebGL; the main thread is unblocked during pan/zoom.

## 8. Trade-offs and deferred work

Options considered and deliberately deferred:

| Trade-off                     | Decision     | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                         | No tests yet | The app is ~1k LOC and the shape is still moving. Tests would ossify the current design prematurely; Vitest coverage will be added once the API surface freezes.                                                                                                                                                                                                                                                                            |
| CSS framework                 | None         | Inline styles are fine at this size. Moving to CSS-modules would be a chore-PR, not a value-PR.                                                                                                                                                                                                                                                                                                                                             |
| ADA compliance                | Partial      | Keyboard nav works; focus rings on the picker need work; screen-reader annotations are not there yet. Tracked as a roadmap item.                                                                                                                                                                                                                                                                                                            |
| Per-capita normalization      | Implemented  | ACS C27007 Medicaid enrollment is the denominator for the "Per Medicaid enrollee" toggle at state/county/ZIP3. Cross-level shared color scale (winsorized at p95) keeps a value of 1.32 painting the same color at every zoom. The earlier T-MSIS "claims per beneficiary served" ratio was removed: its denominator was per-category and double-counted patients at the "All Categories" view, structurally biasing the default ratio low. |
| Server-side rendering         | No           | Static-only was a constraint. A choropleth is not a document; SSR would add complexity for no user win.                                                                                                                                                                                                                                                                                                                                     |
| Incremental hydration of data | No           | Once the monthly files move to PMTiles format, the bulk-load problem goes away.                                                                                                                                                                                                                                                                                                                                                             |

## 9. Architecture Decision Records

Significant architectural calls are recorded as short ADRs under [`docs/adr/`](adr/):

- [**ADR 0001**](adr/0001-static-site-no-backend.md) — Static site, no backend.
- [**ADR 0002**](adr/0002-zip3-monthly-as-pmtiles.md) — Monthly ZIP3 data should move from NDJSON to PMTiles.
- [**ADR 0003**](adr/0003-feature-state-over-setdata.md) — Use MapLibre feature-state instead of `setData` for dynamic choropleth.
- [**ADR 0004**](adr/0004-synthesized-export-via-d3-geo.md) — Synthesize the PNG/JPEG export off-screen via `d3-geo` instead of screenshotting the live MapLibre canvas.

ADRs follow the [Michael Nygard template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — short, dated, status-tracked, and immutable once accepted. Superseding an ADR creates a new one rather than editing the old.
