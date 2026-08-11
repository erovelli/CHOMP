# Contributing

Thanks for considering a contribution. This project is small and deliberately opinionated; the guidance below is intended to save a round of review by setting expectations up front.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Before opening a PR](#before-opening-a-pr)
- [Development environment](#development-environment)
- [Branching & commit conventions](#branching--commit-conventions)
- [Pull request checklist](#pull-request-checklist)
- [Coding standards](#coding-standards)
- [Data pipeline changes](#data-pipeline-changes)
- [Accessibility & performance expectations](#accessibility--performance-expectations)
- [Reporting bugs & proposing features](#reporting-bugs--proposing-features)
- [Security](#security)
- [License](#license)

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Participation implies agreement to uphold it. Report unacceptable behavior to **ecrovelli@gmail.com**.

## Ways to contribute

| Type                                            | Open an issue?                                                 | Open a PR?             |
| ----------------------------------------------- | -------------------------------------------------------------- | ---------------------- |
| Bug fix with a clear reproduction               | Optional                                                       | Yes                    |
| Typo / wording / docs tweak                     | No                                                             | Yes                    |
| Dependency bump beyond Dependabot's scope       | Yes (discuss first)                                            | Yes                    |
| New feature (category, layer, viz)              | **Yes** — discuss before coding                                | After alignment        |
| Data-pipeline change (new SQL view, new export) | **Yes** — discuss first                                        | After alignment        |
| Architectural change / major refactor           | **Yes** — discuss first; include an [ADR](docs/adr/) in the PR | After alignment        |
| Data quality question (a number looks wrong)    | Use the **Data Quality** issue template                        | Usually no code change |

Small PRs are welcomed without a tracking issue. Anything that changes behavior, adds dependencies, or touches the data shape should start with an issue.

## Before opening a PR

1. **Search existing issues and PRs** to avoid duplicate work.
2. **Discuss non-trivial changes** on an issue first. A two-line "here's the proposed approach" note on the issue saves a 200-line revert.
3. **Keep PRs focused.** One logical change per PR. Drive-by refactors go in a separate PR.
4. **Include context** in the PR description: what, why, and what alternatives were considered but not picked.

## Development environment

```bash
nvm use                   # Node 20.x (see .nvmrc)
npm install
cp .env.example .env.local # add VITE_PROTOMAPS_API_KEY if available
npm run dev               # http://localhost:5173/CHOMP/
```

Useful scripts:

| Command           | Purpose                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR.                                                          |
| `npm run build`   | Production build (`tsc && vite build`). This is the command CI runs.               |
| `npm run preview` | Serve the production build locally.                                                |
| `npm run deploy`  | Publish `dist/` to the GitHub Pages staging site. Requires maintainer permissions. |

**Editor setup:** the repo ships with an [`.editorconfig`](.editorconfig) that pins indentation and line endings. Recommended VS Code extensions: TypeScript, EditorConfig for VS Code, ESLint (once added).

## Branching & commit conventions

- **Branch off `main`.** Use a descriptive prefix: `feature/…`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`, `data/…`.
- **Commit messages** follow a relaxed version of [Conventional Commits](https://www.conventionalcommits.org/):

  ```
  <type>: <short summary, imperative>

  <optional body explaining the why>
  ```

  Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `data`, `ci`, `test`, `perf`.

  Good:

  ```
  feat: lazy-load monthly ZIP3 data behind month slider
  ```

  Bad:

  ```
  updates
  ```

- **One concern per commit** is nice, not required. Squash on merge is fine — the PR description is the canonical record.

## Pull request checklist

Before requesting review:

- [ ] `npm run build` passes locally.
- [ ] `npm run typecheck` reports no errors.
- [ ] `npm run lint` is clean.
- [ ] `npm test` is green.
- [ ] `npm run format:check` is clean (or run `npm run format` and re-stage).
- [ ] The site has been opened in a browser and clicked through the happy path (state → ZIP3 → year switch → month slider → category switch → close panel).
- [ ] No `console.log` debug statements in shipped code.
- [ ] No unused imports or dead code.
- [ ] New or changed behavior is reflected in the README, ARCHITECTURE, or an ADR if load-bearing.
- [ ] Screenshots/GIFs for UI changes are attached to the PR description.
- [ ] The PR template is filled out (don't delete sections — mark "N/A" where not applicable).

## Coding standards

### TypeScript

- **Strict mode is on.** Keep it that way. No `any` unless a one-liner comment explains the reason.
- **Prefer named exports.** Default exports are reserved for components consumed via lazy routing (not currently in use).
- **Types are contracts, not annotations.** When touching a core type like `LayerKey` or `DataRecord`, grep the codebase first — the compiler will surface what else needs updating.

### React

- **One responsibility per component.** A component's file over ~200 lines probably has two responsibilities.
- **No `useEffect` for derived state.** Compute it during render. `useMemo` when the computation is expensive.
- **Events that mutate MapLibre state stay inside `MapContainer.tsx`.** Don't push map mutation into leaf components.

### Styling

- Inline style objects are the convention here. Co-located with the component, every value is searchable.
- Colors, z-indices, transitions, and spacing come from `src/constants/` or the CSS custom properties in `src/index.css`. No magic numbers.
- Typography: `--ff-sans` for UI, `--ff-serif` for narrative copy, `--ff-mono` for data readouts.

### File organization

```
src/
├── components/
│   ├── map/          ← owns maplibregl.Map lifecycle
│   └── ui/           ← renders from the store; never mutates the map directly
├── constants/        ← no logic, only exported constants
└── lib/              ← pure functions + the Zustand store
```

Keep the boundary sharp. A constants file should never import from a component; a `lib/` module should never import from a component.

## Data pipeline changes

The build-time pipeline is all Python under `scripts/` — there is no database
to provision and no SQL to run. Aggregation lives in
[`scripts/build_aggregates.py`](scripts/build_aggregates.py), a DuckDB script
that reads the merged+geocoded CSV and writes six NDJSON files.

- **HCPCS → category mapping** is `CATEGORY_CASE` in
  [`scripts/build_aggregates.py`](scripts/build_aggregates.py). Adding or
  renaming a category is a two-place change: update `CATEGORY_CASE` here, and
  update `CATEGORY_TO_KEY` + `LAYER_CONFIGS` + `LAYER_ORDER` in
  [`src/constants/map.ts`](src/constants/map.ts).
- **Frontend `DATA_PATHS`** in `src/constants/map.ts` must stay in sync with
  the output filenames.
- Each ingest / merge / geocode-join / fetch step is one script. Add a new
  script for a new step rather than overloading an existing one.

### Python ingest / enrichment scripts

- [`merge_hhs_nppes.py`](scripts/merge_hhs_nppes.py) — joins HHS dental claims to monthly NPPES snapshots.
- [`extract_geocoding_input.py`](scripts/extract_geocoding_input.py), [`join_geocoded.py`](scripts/join_geocoded.py) — handoff to and from the geocoding collaborator.
- [`build_aggregates.py`](scripts/build_aggregates.py) — DuckDB aggregator, produces the six NDJSON files.
- [`fetch_county_geometry.py`](scripts/fetch_county_geometry.py), [`fetch_world_geometry.py`](scripts/fetch_world_geometry.py) — produce the GeoJSON layers under `public/`.
- [`fetch_acs_medicaid.py`](scripts/fetch_acs_medicaid.py) — pulls ACS C27007 (Medicaid enrollment) for use as a per-enrollee denominator (not yet wired into the aggregations).
- [`analyze_coverage.py`](scripts/analyze_coverage.py), [`diagnose_drops.py`](scripts/diagnose_drops.py), [`categorize_servicing_ids.py`](scripts/categorize_servicing_ids.py) — post-merge quality reporting.

Conventions for these scripts:

- **Dependencies:** add to [`requirements.txt`](requirements.txt). Prefer pure-Python wheels; if a C extension is required, surface a fallback (e.g., the merge script shells out to 7-Zip rather than depending on `zipfile-deflate64`).
- **API keys:** read from the environment (`CENSUS_API_KEY`, etc.). Document the variable in [`.env.example`](.env.example) and the script's docstring; never commit a key.
- **Cache external API responses** to disk under `data/<source>/raw/` so re-runs are free. Include a `--force` flag to invalidate the cache.
- **Be polite to upstream APIs** — add a small delay between calls (the ACS fetch uses 0.5 s) and handle 404 / 5xx gracefully.
- **Document jam values / sentinel handling** explicitly in the script and in [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). Never silently coerce to zero.

### Documenting data limitations

[`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) is the project's running ledger of data-quality issues, structural exclusions, and methodological caveats. Treat it as a load-bearing artifact, not commentary.

**Add an entry there before merging code that:**

- Discovers a new edge case in source data (HHS suppression, NPPES coverage gap, ACS undercount, geocoder failure mode, etc.).
- Introduces a deliberate exclusion in a transform (a `WHERE` filter that drops rows, an inner join that silently loses NPIs, a `dropna()` that hides cells).
- Adds a new external data source or API dependency (the Census API, a new geocoder, a state directory, etc.) — every source has its own quirks that need surfacing.
- Surfaces a caveat that would change how a number should be interpreted in a publication (e.g., interstate Medicaid benefit variation, claims-processing lag in trailing months, ACS 5-year temporal smoothing).

**Format the entry** to match the existing style: continue the `L##` ID sequence; pick the right category section (Source / Merge / Geocoding / ACS / Attribution — add a new section if none fits); use one of the severity emojis (🟥 🟨 ⬜) from the legend at the top of the file; include the **Issue**, **Impact**, and **Mitigation/Status** subsections.

**If your PR fixes an existing limitation,** don't delete the entry — change its `Status` line to `Mitigated (PR #N)`. The historical record matters for a methods footnote later.

**If your PR touches a number that's referenced in a limitation,** double-check the entry is still accurate and update if not.

Reviewers will block a data-pipeline PR that adds a new exclusion or new data source without an accompanying `LIMITATIONS.md` entry.

### Documenting data limitations

[`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) is the project's running ledger of data-quality issues, structural exclusions, and methodological caveats. Treat it as a load-bearing artifact, not commentary.

**Add an entry there before merging code that:**

- Discovers a new edge case in source data (HHS suppression, NPPES coverage gap, geocoder failure mode, etc.).
- Introduces a deliberate exclusion in a transform (a `WHERE` filter that drops rows, an inner join that silently loses NPIs, a `dropna()` that hides cells).
- Surfaces a caveat that would change how a number should be interpreted in a publication (e.g., interstate Medicaid benefit variation, claims-processing lag in trailing months).

**Format the entry** to match the existing style: continue the `L##` ID sequence; pick the right category section (Source / Merge / Geocoding / Attribution); use one of the severity emojis (🟥 🟨 ⬜) from the legend at the top of the file; include the **Issue**, **Impact**, and **Mitigation/Status** subsections.

**If your PR fixes an existing limitation,** don't delete the entry — change its `Status` line to `Mitigated (PR #N)`. The historical record matters for a methods footnote later.

**If your PR touches a number that's referenced in a limitation,** double-check the entry is still accurate and update if not.

Reviewers will block a data-pipeline PR that adds a new exclusion without an accompanying `LIMITATIONS.md` entry.

## Accessibility & performance expectations

- **Keyboard:** all interactive controls (layer picker, year chips, month slider, modal close) must be reachable by Tab and operable by Enter/Space/Arrows.
- **Contrast:** design tokens are tuned for WCAG AA. Any new colors must pass a contrast checker.
- **No layout thrash on hover.** The tooltip uses absolute positioning; dimensions of parents must not change based on hover state.
- **Bundle budget:** `dist/assets/*.js` should stay under 300 KB gzipped. Treeshake before adding.

## Reporting bugs & proposing features

Use the [issue templates](.github/ISSUE_TEMPLATE/). The templates gather the context the maintainer would otherwise have to ask for:

- **Bug report** — browser, URL, repro steps, expected vs actual.
- **Feature request** — problem statement, proposed solution, alternatives.
- **Data quality** — the specific region/year/category that looks wrong, what was expected, and (ideally) a cross-reference.
- **Question** — for anything that doesn't fit the other three.

## Security

**Do not open public issues for security vulnerabilities.** See [SECURITY.md](SECURITY.md) for the responsible-disclosure process.

## License

Contributions to this repository are licensed under the [MIT License](LICENSE).

---

Thanks again. Contributions, small and large, are what make this project worth maintaining.
