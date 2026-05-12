<div align="center">

# Medicaid Dental Utilization Atlas

**An interactive choropleth of U.S. Medicaid dental claims, 2018–2024.**

A full-stack data visualization project that transforms ~60 GB of raw HHS Open Data and NPPES records into a 5 MB interactive map — state- and ZIP3-level utilization across nine dental procedure categories, six years of history, and monthly drill-down.

[**→ Open the live site**](https://erovelli.github.io/medicaid-dent-policy/)

[![CI](https://github.com/erovelli/medicaid-dent-policy/actions/workflows/ci.yml/badge.svg)](https://github.com/erovelli/medicaid-dent-policy/actions/workflows/ci.yml)
[![Deploy](https://github.com/erovelli/medicaid-dent-policy/actions/workflows/deploy.yml/badge.svg)](https://github.com/erovelli/medicaid-dent-policy/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev)
[![MapLibre GL](https://img.shields.io/badge/MapLibre%20GL-4-396cb2.svg)](https://maplibre.org)
[![PMTiles](https://img.shields.io/badge/PMTiles-v3-1e8a7e.svg)](https://protomaps.com/docs/pmtiles)

</div>

---

## Why this exists

On **February 8, 2026**, the U.S. Department of Health and Human Services released the first public, provider-level dataset of Medicaid dental claims spanning 2018–2024. The release is technically remarkable and practically unusable: tens of millions of rows keyed by NPI and HCPCS code, with no geography attached. Policymakers, oral-health researchers, and state Medicaid offices can pose the question _"how much is being spent on preventive dental care in a given state?"_ — but answering that question requires joining the release against the **NPPES provider registry**, categorizing ~1,000 HCPCS codes, aggregating across time, and rendering at an appropriate geographic grain.

This project does all of that end-to-end, and makes the result explorable in a browser tab.

The design is deliberately constrained:

- **ZIP3, not ZIP5.** Coarse enough to protect individual-provider identification, fine enough to see intra-state variation.
- **Categories, not codes.** Nine clinically meaningful groupings (Diagnostic, Preventive, Restorative, …) instead of the raw HCPCS namespace.
- **Static hosting, no backend.** The entire interactive experience is a static site — no API, no auth, no server cost. The database is the _build tool_, not a runtime dependency.

## What it does

|                  |                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map**          | Full-nation choropleth at two zoom levels: states (PMTiles vector), ZIP3 areas (PMTiles vector). Feature-state driven recoloring — no GeoJSON re-parse on year/category change.          |
| **Controls**     | Nine procedure-category layers (plus "All"), 2018–2024 year selector, month slider that lazy-loads a 61 MB monthly dataset only on first use.                                            |
| **Detail panel** | Per-region stats — total claims, beneficiaries served, dollars paid, avg $/claim — and a ranked category breakdown for the selected period.                                              |
| **Tooltip**      | Pixel-anchored hover readout; respects feature-state hover/selected to drive stroke weights and fills without reconfiguring paint properties.                                            |
| **Info modal**   | Surfaces the caveats that matter: HHS cell-suppression (<12 claims or <12 beneficiaries/month), interstate variation in Medicaid dental coverage, and NPI/practice-location limitations. |

## Architecture at a glance

```
          ┌──────────────────────── BUILD-TIME (offline) ────────────────────────┐
          │                                                                      │
          │   HHS Open Data             NPPES                                    │
          │   Medicaid dental           National Provider Identifier             │
          │   claims 2018–2024          registry (~9M providers)                 │
          │        │                        │                                    │
          │        ▼                        ▼                                    │
          │   provider_spending_raw    npi_raw                                   │
          │         │  (staging)            │  (staging)                         │
          │         └────────┬───────────────┘                                   │
          │                  │                                                   │
          │                  ▼                                                   │
          │      provider_procedure_monthly_geo   ← joined on NPI, filtered      │
          │                  │                      to HCPCS D-codes             │
          │                  ▼                                                   │
          │      provider_procedure_category_aggregate  ← categorization         │
          │                  │                            via code-range CASE    │
          │                  ├──────────┬──────────┬──────────┐                  │
          │                  ▼          ▼          ▼          ▼                  │
          │         monthly_state  annual_state  monthly_zip3  annual_zip3       │
          │                  │          │          │          │                  │
          │                  └──────────┴────┬─────┴──────────┘                  │
          │                                  ▼                                   │
          │                     scripts/export_views.sh                          │
          │                        (psql → NDJSON)                               │
          │                                                                      │
          └──────────────────────────────────┬───────────────────────────────────┘
                                             │  4 JSON files, 500 KB – 61 MB
                                             ▼
          ┌──────────────────────── RUNTIME (in browser) ────────────────────────┐
          │                                                                      │
          │   React 18 + TS-strict + Vite                                        │
          │   ┌────────────┐   ┌─────────────────────────┐   ┌────────────────┐  │
          │   │  Zustand   │   │      MapLibre GL JS     │   │    PMTiles     │  │
          │   │   store    │◄──┤   (feature-state API)   ├──►│  states.pmtiles│  │
          │   │            │   │                         │   │  zip3.pmtiles  │  │
          │   └─────┬──────┘   └─────────────────────────┘   └────────────────┘  │
          │         │                                                            │
          │         ▼                                                            │
          │   DetailPanel · LayerControl · Legend · Tooltip · InfoModal          │
          │                                                                      │
          └──────────────────────────────────────────────────────────────────────┘
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the long-form write-up, including the specific trade-offs chosen and the ones deliberately deferred.

## Stack & rationale

| Layer           | Choice                                           | Why                                                                                                                                                                |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Renderer**    | MapLibre GL JS                                   | GPU-accelerated, hardware-composited vector tiles; supports `setFeatureState` for per-feature updates without rebuilding sources.                                  |
| **Tile format** | [PMTiles](https://protomaps.com/docs/pmtiles) v3 | Single-file vector tiles served over static HTTPS with range requests — no tile server to run.                                                                     |
| **Basemap**     | Protomaps                                        | Paid-tier vector basemap (key in `.env.local`); gracefully degrades to a blank background when no key is present.                                                  |
| **Framework**   | React 18 + Vite 5                                | Fast HMR; `React.StrictMode` in dev catches double-mount regressions in the map lifecycle.                                                                         |
| **Language**    | TypeScript `strict`                              | Every layer is typed end-to-end: `LayerKey` union ↔ `LAYER_CONFIGS` record enforces exhaustiveness at compile time.                                                |
| **State**       | [Zustand](https://zustand-demo.pmnd.rs/)         | Single small store with selector-hooks; avoids the provider-tree churn a Context-based solution would introduce in a map app that re-renders on every hover event. |
| **Data shape**  | NDJSON of `{ key: records[] }` objects           | Streamable, append-only, gzips well. The browser consumes all four files through a single `fetchNDJSON` helper.                                                    |
| **Pipeline**    | PostgreSQL + psql                                | SQL is the right language for this transformation. Views are version-controlled in `migrations/`; export orchestrated by a single `bash` script.                   |
| **Hosting**     | GitHub Pages (static)                            | Zero-infra. The site is ~6 MB gzipped including both PMTiles archives.                                                                                             |

## Engineering highlights

A few decisions worth calling out in a code review:

- **Feature-state paint expressions instead of data-driven filters.** Hover/selection/value are all feature-state fields; the paint expression (`src/lib/mapStyles.ts`) interpolates over those fields. Switching year or category dispatches a single `setFeatureState` loop — no source rebuild, no GL re-upload.
- **Two-tier loading.** Annual data (~5 MB) is fetched on map `load` so the full-nation view is immediate. Monthly data (~61 MB) is lazy-loaded on first interaction with the month slider, guarded by a `monthlyDataLoaded` flag in the store.
- **Single source of truth for procedure categories.** `CATEGORY_TO_KEY` in [`src/constants/map.ts`](src/constants/map.ts) maps HHS category strings to the app's `LayerKey` union. `CATEGORY_COLORS` and `LAYER_ORDER` are _derived_ from it — adding a new category is a one-line change.
- **Refs, not state, for hover and selection IDs.** The map's event handlers run on every mouse move at 60 Hz; routing those through React state would trigger cascading re-renders of the entire tree. Hover/selection are held in `useRef` and written back to MapLibre's feature-state directly.
- **Constants are colocated.** `src/constants/{map,time,layout,infoModal}.ts` means no magic numbers appear in component files. Every z-index, transition, and API path is nameable and greppable.
- **Data pipeline mirrors the frontend.** The `provider_procedure_category_aggregate_{annual,monthly}_{state,zip3}` view names map 1:1 to the NDJSON files and to the `DATA_PATHS` constants — the naming discipline is deliberate.

## Getting started

### Prerequisites

- Node 20.x (see [`.nvmrc`](.nvmrc))
- `npm` 10+
- A [Protomaps API key](https://protomaps.com/) _(optional — the map falls back to a blank basemap without one)_

### Run locally

```bash
git clone https://github.com/erovelli/medicaid-dent-policy.git
cd medicaid-dent-policy
nvm use           # or ensure Node 20
npm install
echo "VITE_PROTOMAPS_API_KEY=your_key_here" > .env.local
npm run dev
```

Open http://localhost:5173/medicaid-dent-policy/ (note the base path — configured for GitHub Pages).

### Scripts

| Command                                   | What it does                                                         |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                             | Vite dev server with HMR.                                            |
| `npm run build`                           | Production build: `tsc` then `vite build`. The same command CI runs. |
| `npm run preview`                         | Serve the production build locally.                                  |
| `npm run typecheck`                       | `tsc --noEmit` — strict TS, surfaces type errors without a rebuild.  |
| `npm run lint` / `npm run lint:fix`       | ESLint on `src/`.                                                    |
| `npm run format` / `npm run format:check` | Prettier across the repo.                                            |
| `npm test` / `npm run test:watch`         | Vitest unit suite.                                                   |
| `npm run test:coverage`                   | Vitest + V8 coverage report.                                         |
| `npm run size`                            | `size-limit` check against the gzipped bundle budget.                |
| `npm run deploy`                          | Publish `dist/` to the `gh-pages` branch.                            |

A Husky pre-commit hook runs `lint-staged` (ESLint + Prettier on staged files). Install it the first time with `npm install` — `husky` auto-registers the hook via the `prepare` script.

### Rebuild the dataset

The web app ships with pre-exported JSON under `public/data/`. To rebuild from source:

```bash
# 1. Load HHS + NPPES source data into Postgres
psql "$DATABASE_URL" -f migrations/001_create_medicaid_schema.sql
psql "$DATABASE_URL" -f migrations/002_create_nppes_schema.sql
#    … ingest via any preferred tool (COPY, dbt, etc.)

# 2. Build the transformed tables & views
for f in migrations/003_*.sql migrations/004_*.sql migrations/005_*.sql \
         migrations/aggregate_views/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done

# 3. Export to NDJSON for the frontend
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
bash scripts/export_views.sh public/data
```

### Deploy

CI publishes to GitHub Pages on every push to `main` (see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). For a manual push:

```bash
npm run build
npm run deploy    # gh-pages branch
```

## Project layout

```
medicaid-dent-policy/
├── src/
│   ├── App.tsx                    # Shell: header + map + floating UI
│   ├── main.tsx                   # React entry
│   ├── index.css                  # Design tokens & MapLibre overrides
│   ├── components/
│   │   ├── map/MapContainer.tsx   # Map lifecycle, event handlers, feature-state paint
│   │   └── ui/
│   │       ├── Header.tsx
│   │       ├── LayerControl.tsx   # Procedure-category picker
│   │       ├── Legend.tsx         # Choropleth scale
│   │       ├── Tooltip.tsx        # Pixel-anchored hover readout
│   │       ├── ClickHint.tsx      # Dismissable onboarding nudge
│   │       ├── InfoModal.tsx      # First-load about/caveats dialog
│   │       └── DetailPanel/
│   │           ├── index.tsx              # Slide-in right-rail
│   │           ├── PanelContent.tsx       # Year/month controls, stats
│   │           ├── StatCard.tsx           # Single big-number tile
│   │           └── CategoryBreakdown.tsx  # Horizontal-bar breakdown
│   ├── lib/
│   │   ├── store.ts               # Zustand store
│   │   ├── dataService.ts         # NDJSON fetch + in-memory caches
│   │   ├── mapStyles.ts           # Choropleth color expressions
│   │   ├── formatters.ts          # $1.2M / 450k helpers
│   │   └── types.ts               # Shared domain types
│   └── constants/                 # Map, layout, time, modal constants
├── public/
│   ├── states.pmtiles             # U.S. state polygons (vector tiles)
│   ├── zip3.pmtiles               # ZIP3 polygons (vector tiles)
│   ├── *.geojson                  # Source geometries (pre-PMTiles)
│   └── data/*.json                # NDJSON exports consumed at runtime
├── migrations/                    # Ordered SQL: schema → staging → transforms → views
│   └── aggregate_views/           # The four export-ready views
├── scripts/
│   ├── export_views.sh            # psql orchestrator
│   └── sql/*.sql                  # One SELECT per exported JSON file
├── docs/                          # ARCHITECTURE, ADRs
└── .github/                       # Workflows, templates, policies
```

## Roadmap

- [ ] **Accessibility pass.** Tab-trap the modal, focus-visible styles for the category picker, and aria-live announcements on region selection.
- [x] **Unit tests.** `vitest` harness with coverage for `formatters`, `dataService.getValueForRegion`, and URL-state round-trips. More coverage to come for store slicing and the detail panel.
- [ ] **Component tests.** `@testing-library/react` coverage for `DetailPanel`, `LayerControl`, `InfoModal`.
- [ ] **Visual regression.** Playwright screenshot diffs of the three primary layouts (empty, state-selected, zip3-selected).
- [ ] **Per-capita normalization.** Join against Census population to render rate-per-10k-enrollees, not raw claim counts.
- [ ] **Time-series chart.** Spark-line of the selected region + category in the detail panel.
- [x] **URL-addressable state (partial).** `?layer=preventive&year=2024&month=2024-06` shareable deep links for layer/year/month. Region rehydration is a follow-up — it needs to wait for annual data to load and synthesize a `RegionDetail`.
- [ ] **Data Version Control.** Pin each `public/data/*.json` export to a dated commit of the source data.

## Documentation

- [**ARCHITECTURE**](docs/ARCHITECTURE.md) — System design, data flow, and the trade-offs behind each decision.
- [**DATA DICTIONARY**](docs/DATA_DICTIONARY.md) — NDJSON schema, field semantics, units, and suppression rules.
- [**LIMITATIONS**](docs/LIMITATIONS.md) — Running ledger of data-quality issues, structural exclusions, and methodological caveats. Read before publishing any number derived from this pipeline.
- [**ADRs**](docs/adr/) — Architecture Decision Records for the load-bearing calls.
- [**CONTRIBUTING**](CONTRIBUTING.md) — Workflow, coding standards, commit conventions.
- [**SECURITY**](SECURITY.md) — Responsible disclosure policy.
- [**CODE OF CONDUCT**](CODE_OF_CONDUCT.md) — Community standards.
- [**CHANGELOG**](CHANGELOG.md) — Release notes.

## Data sources

- **HHS Open Data** — _Medicaid Dental Claims, 2018–2024_ (released 2026-02-08). [data.cms.gov](https://data.cms.gov/)
- **CMS NPPES** — National Plan and Provider Enumeration System monthly download. [download.cms.gov/nppes](https://download.cms.gov/nppes/NPI_Files.html)
- **U.S. Census TIGER/Line** — State and ZIP Code Tabulation Area polygons.
- **HCPCS D-code categories** — CDT category conventions from the American Dental Association.

> Every source has known caveats — small-cell suppression in HHS, snapshot-cadence gaps in NPPES, territory and address-quality edge cases in geocoding. The full ledger lives in [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). **Read it before quoting any number from this dataset in a publication or external report.**

## License

Released under the [MIT License](LICENSE). The underlying HHS, CMS, and Census datasets are public-domain U.S. Government works; please honor the individual terms of use for each source when redistributing.

---

<div align="center">

Built by [@erovelli](https://github.com/erovelli), [@kennethliu64](https://github.com/kennethliu64), [@jakerobg](https://github.com/jakerobg), [@mattngaw](https://github.com/mattngaw), and [@clarkmorgan](https://github.com/clarkmorgan).

_Feedback from anyone finding this useful — for policy analysis, for a class, or as a reference — is always welcome._

</div>
