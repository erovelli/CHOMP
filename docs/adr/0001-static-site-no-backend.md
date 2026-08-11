# ADR 0001 — Static site, no backend

- **Status:** Accepted
- **Date:** 2026-02-21
- **Supersedes:** —

## Context

The project visualizes HHS Medicaid dental claim data joined against CMS NPPES and U.S. Census geography. The source data is public but large (tens of millions of rows). A straightforward architecture would be:

```
Postgres ── API (FastAPI / Node) ── React SPA ── user
```

This shape is familiar and flexible. It is also:

- **Non-zero-cost to host.** An always-on API tier, even a small one, has a recurring bill.
- **A privacy surface.** Even though the raw data is already public, an interactive API lets callers _query patterns_ the cell-suppression rules are designed to prevent (e.g. narrowly-scoped filters that effectively identify providers).
- **A reliability burden.** The project has a small volunteer maintainer team. Every backend is eventually a pager.

## Decision

Ship the site as a **static bundle**. All data aggregations happen offline at build time (Python + DuckDB), are exported to NDJSON + PMTiles + GeoJSON, and are served as static files. The Harvard SHARE host serves production at <https://chomp.share.library.harvard.edu/>; GitHub Pages serves staging at <https://erovel.li/CHOMP/>. No server-side rendering, no API, no auth, no database — at build time or runtime.

> Earlier revisions of this ADR described a Postgres view chain as the build-time aggregator. That stack was retired once DuckDB became the authoritative aggregator (zero-setup, ~10s over the 23M-row CSV) and the SQL was never actually executed in any environment. The "no backend" decision below is unchanged; only the offline build tooling differs.

## Consequences

**Positive**

- **No application server.** Harvard SHARE serves the production static bundle, and GitHub Pages hosts an independently deployable staging copy.
- **Privacy by construction.** Only the published aggregations are accessible. No query can exceed that surface.
- **Trivial CDN story.** Static files → global edge caches for free.
- **Reproducible.** Every artifact in `public/data/` corresponds to a specific commit of `scripts/build_aggregates.py` plus the input CSV. Rebuilding is a single `python` invocation.
- **Frontend is decoupled from backend.** The NDJSON contract lets the pipeline evolve (new views, different grain) without breaking the frontend as long as file names and shapes hold.

**Negative**

- **No dynamic slicing.** A query such as _"preventive claims in Worcester County among pediatric beneficiaries"_ cannot be answered without a re-export. The categorical axes (year × category × region) are pre-baked.
- **Payload is larger.** A server could deliver only the rows a caller asked for; a static bundle ships the whole table. Mitigated by (a) lazy-loading monthly data, (b) gzip, (c) a planned migration of the monthly ZIP3 dataset to PMTiles (see [ADR 0002](0002-zip3-monthly-as-pmtiles.md)).
- **Harder real-time feel.** First-load time is bounded by the size of the JSON files, not by a response from a query engine.

## Alternatives considered

| Option                                               | Why not                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Full FastAPI / Express backend                       | Violates the zero-cost and privacy goals.                                                                          |
| Cloudflare Workers + D1 / Turso                      | Cheaper than a VM, still a runtime to own. Would be the natural next step if the use-case demands dynamic queries. |
| Shiny / Observable notebook                          | Excellent for one-shot exploration; less good as a portable, self-contained app.                                   |
| Serverless-only (Netlify + read-only DB at the edge) | Adds complexity without a clear user benefit over pre-baked static files.                                          |

## Related

- [ADR 0002 — Monthly ZIP3 data as PMTiles](0002-zip3-monthly-as-pmtiles.md)
