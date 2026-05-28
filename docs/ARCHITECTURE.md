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
   ║  (external, raw)  ║      ║   (Postgres + sh) ║      ║    (browser)      ║
   ╚═══════════════════╝      ╚═══════════════════╝      ╚═══════════════════╝
          HHS + NPPES              SQL transforms            React + MapLibre
            +Census                 NDJSON export             Static hosting
```

There are exactly two runtimes in this project, intentionally decoupled:

- **The build runtime** — a local Postgres database, the SQL under `migrations/`, and `scripts/export_views.sh`. Produces a handful of NDJSON files and PMTiles archives. Runs _on the maintainer's laptop, manually, when source data updates._
- **The serving runtime** — React + Vite + MapLibre. Reads only the static artifacts. Runs _in every visitor's browser._

The NDJSON files and `.pmtiles` archives are the **interface contract** between the two. Everything upstream of those artifacts can change without breaking the frontend, and vice versa, as long as the file names and schemas hold.

This is the single most consequential architectural decision in the project, and it flows from two constraints:

1. **Cost.** Zero-dollar hosting was a hard requirement.
2. **Privacy.** The source data is public but a live backend would expose query patterns that the suppression rules (<12 claims / <12 beneficiaries per cell) are designed to prevent. Pre-aggregating at build time means only the published aggregations are accessible.

## 3. Data pipeline

### 3.1 Schema layering

The HHS × NPPES join was originally drafted in SQL (load both sides into
staging tables, `INSERT ... JOIN ...`). It moved to Python
([`scripts/merge_hhs_nppes.py`](../scripts/merge_hhs_nppes.py)) because
the NPPES archives are deflate64-compressed (needs 7-Zip, not stdlib
zipfile) and a streaming per-month flow is dramatically cheaper than
loading 84 × ~9M-row vintages into Postgres for a single inner join.
The merged CSV is loaded directly into
`medicaid.provider_procedure_monthly_geo`; SQL takes over from there:

```text
003_create_provider_procedure_monthly_geo.sql
                                        ◄─ target table (enriched + geo'd)
                                          (populated by COPY from the
                                           Python merge output)
aggregate_views/
    006_…_category_aggregate.sql        ◄─ zip5 × year_month × category grain
    007_…_monthly_state.sql             ◄─ rolled to state × month
    008_…_annual_state.sql              ◄─ rolled to state × year
    009_…_monthly_zip3.sql              ◄─ rolled to zip3 × month
    010_…_annual_zip3.sql               ◄─ rolled to zip3 × year
```

A few deliberate choices:

- **Views, not materialized views, for aggregates.** These are computed once at export time and never queried by the runtime. Views keep the schema declarative and make the SQL diffable.
- **HCPCS categorization happens exactly once**, in `006`. Every downstream view reads the `category` column. The HCPCS → category mapping is one CASE expression, mirrored in the frontend's `CATEGORY_TO_KEY` — two copies of the same fact, and that is intentional: the SQL is the source of truth for the backend; the TS is the source of truth for the UI shell.

### 3.1a DuckDB builder (authoritative) + county grain

The Postgres view chain above remains as the documented SQL reference, but the
**authoritative builder is now [`scripts/build_aggregates.py`](../scripts/build_aggregates.py)** — a DuckDB script that reads `merged_hhs_nppes_geo.csv`
directly and emits all **six** NDJSON files (`{annual,monthly}` × `{state,county,zip3}`). It was added because (a) the build host has no Postgres provisioned,
(b) DuckDB aggregates the 23M-row CSV in ~10s with no load step, and (c) the
geocoded `county_fips` enables a `county` grain the original views never had.

It mirrors the `006` HCPCS→category CASE exactly, then differs in geography:

- `county` is keyed on the 5-digit geocoded `county_fips`.
- `state` is **built from county sums** — postal is derived from `LEFT(county_fips, 2)` via a FIPS→USPS map — so `state == SUM(county)` holds exactly
  (verified at build time). This replaces the old NPPES-`practice_state` rollup.
- `zip3` is still `LEFT(practice_zip5, 3)`, which keeps a slightly larger row
  universe than county/state (see L33 — the levels intentionally do not reconcile).

### 3.2 Export

The legacy SQL path: [`scripts/export_views.sh`](../scripts/export_views.sh) runs `psql -f` invocations, each executing a `SELECT json_build_object(key, rows)` that serializes a view into NDJSON. The DuckDB builder produces the same line shape (`{"<region_id>": [<records>...]}`) using `string_agg` over `json_object`. Either way each line is a key-partitioned bundle — the shape [`dataService.fetchNDJSON`](../src/lib/dataService.ts) consumes.

The NDJSON format was picked because:

- It **gzip-compresses** far better than repeated JSON array boilerplate.
- It's **streamable** if a future iteration moves to incremental load.
- `psql -t -A` emits it natively with no post-processing.

### 3.3 Cell suppression

HHS suppresses any provider-month-code cell with fewer than 12 claims or 12 unique beneficiaries. This is preserved end-to-end: suppressed rows are simply absent from the raw data, and the aggregations pass through only what arrives. The absence is surfaced through the InfoModal on first load, not hidden.

## 4. Frontend architecture

### 4.1 Layering

```
  App.tsx
   ├── Header.tsx ──┐
   │                │
   │                ├── LayerControl.tsx      ── reads store.activeLayer
   │                ├── Legend.tsx            ── reads store.activeLayer
   │                ├── Tooltip.tsx           ── reads store.hovered*
   │                ├── ClickHint.tsx         ── reads store.hintVisible
   │                ├── InfoModal.tsx         ── local state
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
  | "oral_surgery"
  | "orthodontics"
  | "endodontics"
  | "periodontics"
  | "adjunctive"
  | "prosthodontics";
```

`LayerKey` is the spine of the app. `LAYER_CONFIGS: Record<LayerKey, LayerConfig>` and `LAYER_ORDER: LayerKey[]` both reference it, so adding a new category is a single-line change that the compiler propagates through: the `LayerControl`, `Legend`, `Tooltip`, color derivation, and map paint expressions all update without search-and-replace.

## 5. Map rendering model

This is the part most worth reading.

### 5.1 The three "states" of a feature

Every state polygon and every ZIP3 polygon carries three feature-state fields:

| Field      | Type    | Source       | Meaning                                      |
| ---------- | ------- | ------------ | -------------------------------------------- |
| `value`    | number  | Data JSON    | Active metric for the (year, category): total claims (volume) or claims-per-beneficiary (intensity) |
| `hover`    | boolean | Mouse events | Cursor is over this polygon                  |
| `selected` | boolean | Click events | Detail panel is open on this polygon         |

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

| File                    | Size (raw / gzip) | When loaded                         |
| ----------------------- | ----------------- | ----------------------------------- |
| JS bundle               | ~200 KB gzip      | On first load                       |
| `states.pmtiles`        | ~105 KB           | On map `load`                       |
| `zip3.pmtiles`          | ~1 MB             | On map `load`                       |
| `counties.geojson`      | 2.7 MB / 0.85 MB  | On map `load` (county source)       |
| `…_annual_state.json`   | 0.45 MB / 60 KB   | On map `load`                       |
| `…_annual_county.json`  | 10 MB / 1.2 MB    | On map `load`                       |
| `…_annual_zip3.json`    | 5.4 MB / 0.66 MB  | On map `load`                       |
| `…_monthly_state.json`  | 5.2 MB / 0.6 MB   | On first monthly slider interaction |
| `…_monthly_county.json` | 99 MB / 10.3 MB   | On first monthly slider interaction |
| `…_monthly_zip3.json`   | 58 MB / 6.3 MB    | On first monthly slider interaction |

Two elephants now: the deferred **monthly ZIP3 (58 MB)** and the new **monthly
county (99 MB / 10.3 MB gzip)**, the largest artifact in the project. Both are
loaded only on the first monthly-slider interaction, and `loadMonthlyData()`
still fetches all three levels in one shot (so opening month view at *any* level
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

| Trade-off                     | Decision     | Reasoning                                                                                                                                                                    |
| ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                         | No tests yet | The app is ~1k LOC and the shape is still moving. Tests would ossify the current design prematurely; Vitest coverage will be added once the API surface freezes.             |
| CSS framework                 | None         | Inline styles are fine at this size. Moving to CSS-modules would be a chore-PR, not a value-PR.                                                                              |
| ADA compliance                | Partial      | Keyboard nav works; focus rings on the picker need work; screen-reader annotations are not there yet. Tracked as a roadmap item.                                             |
| Per-capita normalization      | Not yet      | Claim counts are directly comparable across ZIP3s of similar population. Adding enrollment as a denominator is a real feature; it needs its own data join and sanity checks. |
| Server-side rendering         | No           | Static-only was a constraint. A choropleth is not a document; SSR would add complexity for no user win.                                                                      |
| Incremental hydration of data | No           | Once the monthly files move to PMTiles format, the bulk-load problem goes away.                                                                                              |

## 9. Architecture Decision Records

Significant architectural calls are recorded as short ADRs under [`docs/adr/`](adr/):

- [**ADR 0001**](adr/0001-static-site-no-backend.md) — Static site, no backend.
- [**ADR 0002**](adr/0002-zip3-monthly-as-pmtiles.md) — Monthly ZIP3 data should move from NDJSON to PMTiles.
- [**ADR 0003**](adr/0003-feature-state-over-setdata.md) — Use MapLibre feature-state instead of `setData` for dynamic choropleth.

ADRs follow the [Michael Nygard template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — short, dated, status-tracked, and immutable once accepted. Superseding an ADR creates a new one rather than editing the old.
