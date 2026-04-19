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

Ship the site as a **static bundle**. All data aggregations happen in Postgres at build time, are exported to NDJSON + PMTiles, and are served as static files from GitHub Pages. No server-side rendering, no API, no auth, no database at runtime.

## Consequences

**Positive**

- **$0 hosting.** GitHub Pages absorbs the traffic.
- **Privacy by construction.** Only the published aggregations are accessible. No query can exceed that surface.
- **Trivial CDN story.** Static files → global edge caches for free.
- **Reproducible.** Every artifact in `public/data/` corresponds to a specific commit of the SQL in `migrations/`. Rebuilding is a single `bash` invocation.
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
