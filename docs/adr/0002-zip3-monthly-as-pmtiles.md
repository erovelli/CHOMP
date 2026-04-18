# ADR 0002 — Monthly ZIP3 data should move from NDJSON to PMTiles

- **Status:** Proposed
- **Date:** 2026-04-17
- **Supersedes:** —

## Context

The current NDJSON export of monthly ZIP3 data is **~61 MB uncompressed** (~15 MB gzipped). It's lazy-loaded behind the month slider, but when a user _does_ touch it, they pay the full download up-front — the file has to arrive before any of the ~930 × 12 × 7 = ~78k monthly-region-year cells are usable.

This is fine on broadband. It is not fine on a phone, and it is not fine if we ever want to reduce latency on first monthly interaction.

The PMTiles archives already in use for geometry (`states.pmtiles`, `zip3.pmtiles`) support HTTP range requests — only the tiles covering the visible viewport are downloaded. The format is not limited to geometries; any keyed data can be packed into a PMTiles archive as long as the key is spatial or derivable.

## Decision

Replace `public/data/provider_procedure_category_aggregate_monthly_zip3.json` with a PMTiles archive where each ZIP3 polygon carries its full monthly time series as a property, and the monthly values are referenced via `feature-state` interpolation keyed on the month slider.

This reduces the byte budget of first-interaction from ~15 MB gzip to a viewport-scoped fraction of that.

## Consequences

**Positive**

- **Range-requested monthly data.** Only the visible ZIPs' time series are downloaded.
- **Unified data path.** Geometry _and_ data flow through the same PMTiles mechanism.
- **Smoother loading UX.** The "Loading monthly data…" spinner disappears.

**Negative**

- **Tile-generation tooling.** Adds `tippecanoe` or equivalent to the build pipeline.
- **Per-feature property size limits.** Seven years × 12 months × 9 categories is 756 numbers per ZIP3; tippecanoe accepts this but it's not free.
- **Harder ad-hoc analysis.** The NDJSON is human-readable and grep-able; a PMTiles archive is not.

## Status reasoning

Proposed, not accepted, because:

1. The NDJSON works today and is observably within tolerance on broadband.
2. The PMTiles migration is ~1–2 days of build-script work, which is worth doing _after_ the accessibility pass and the per-capita feature.

## Related

- [ADR 0001 — Static site, no backend](0001-static-site-no-backend.md)
- [ADR 0003 — Feature-state over setData](0003-feature-state-over-setdata.md)
