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
npm run dev               # http://localhost:5173/medicaid-dent-policy/
```

Useful scripts:

| Command           | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR.                                                  |
| `npm run build`   | Production build (`tsc && vite build`). This is the command CI runs.       |
| `npm run preview` | Serve the production build locally.                                        |
| `npm run deploy`  | Publish `dist/` to the `gh-pages` branch. Requires maintainer permissions. |

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

SQL lives under `migrations/`, ordered numerically.

- **Never edit an existing migration.** Add a new one. To supersede an earlier file, the new migration should explain why in its comment header.
- **Aggregate views** go in `migrations/aggregate_views/`. Each corresponds to exactly one JSON export.
- **The export script** in `scripts/export_views.sh` must stay in sync with the aggregate views. Adding a view requires adding its export.
- **Frontend `DATA_PATHS`** in `src/constants/map.ts` must stay in sync with the export filenames.

A data-pipeline PR should touch all three layers (SQL, export script, frontend constant) when adding a new dataset, and none when refactoring a transform internally.

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
