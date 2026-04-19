# ADR 0003 — Feature-state over `setData` for dynamic choropleth

- **Status:** Accepted
- **Date:** 2026-02-25
- **Supersedes:** —

## Context

The map re-colors on three events:

1. A year switch (seven options).
2. A procedure category switch (ten options).
3. A hover or click on a region.

Events 1 and 2 require repainting _every_ polygon. Event 3 touches exactly one.

The idiomatic MapLibre approach for #1 and #2 is to mutate the GeoJSON source:

```ts
source.setData(updatedGeojsonWithNewValues);
```

This works. It also:

- Re-uploads the entire source to the GPU on every click.
- Triggers a visible sub-second flash on large sources.
- Makes hover-repaint a separate code path from year/category-repaint.

## Decision

Use [MapLibre feature-state](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setfeaturestate) for _all three_ events. The paint expression references `["feature-state", "value"]`, `["feature-state", "hover"]`, and `["feature-state", "selected"]` directly.

Year/category changes run:

```ts
for (const [id, records] of Object.entries(stateCache)) {
  map.setFeatureState(
    { source, sourceLayer, id },
    { value: getValueForRegion(records, year, activeLayer) },
  );
}
```

Hover/selection changes run:

```ts
map.setFeatureState({ source, sourceLayer, id }, { hover: true });
```

## Consequences

**Positive**

- **Single render path.** Hover, click, year, and category updates all go through `setFeatureState`; the paint expression collapses those fields into a color.
- **No source re-upload.** Year/category changes update the GPU's feature-state texture; the vector tiles don't move.
- **Observably fast.** Switching year on a 930-polygon ZIP3 layer repaints in a single frame, with no visible flash.
- **Cleaner code.** `MapContainer.tsx` has one `paintAllFeatureStates` function and two event handlers; there's no conditional `setData` logic.

**Negative**

- **Requires `promoteId`.** The vector tile source must promote a property to the feature ID so `setFeatureState` has a stable handle. Handled via `promoteId: { [LAYER]: ID_PROP }` on each source.
- **Feature-state is lost on source remove.** A runtime swap of the `states.pmtiles` archive would require re-painting; currently no user-facing action triggers that.

## Alternatives considered

| Option                                                                               | Why not                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `setData` on every event                                                             | Re-uploads entire source per change; visible lag.                                       |
| Data-driven expressions with a property lookup (`["get", "claims_2024_preventive"]`) | Requires baking every (year, category) combo into the tile — explodes the PMTiles size. |
| Client-side per-feature overlay (extra vector layer for highlights)                  | Fine for hover; doesn't solve the year/category repaint.                                |

## Related

- [ADR 0001 — Static site, no backend](0001-static-site-no-backend.md)
