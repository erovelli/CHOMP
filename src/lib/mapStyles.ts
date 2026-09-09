import type { Metric } from "./types";
import { PROTOMAPS_STYLE_URL } from "../constants/map";

export const CHOROPLETH_COLORS = [
    "#f7f4ee",
    "#d4e8e4",
    "#93cec6",
    "#4aaca0",
    "#1e8a7e",
    "#0d6b60",
    "#084d44",
];

export const N_STOPS = CHOROPLETH_COLORS.length; // 7

// Placeholder stops used only for the brief moment a layer exists before data
// loads; immediately replaced by data-driven stops (see quantileStops).
export const DEFAULT_STOPS = Array.from({ length: N_STOPS }, (_, i) => i);

export const HOVER_COLOR = "#c8f0ed";

/**
 * Data-driven color stops. The choropleth re-scales to whatever slice is on
 * screen — geography level × year × category × metric — so volume and the
 * per-enrollee rate each spread across the full palette instead of saturating
 * dark or washing out light. Stops are quantile breaks of the non-zero values
 * (skewed distributions get good contrast from quantiles rather than linear
 * min→max).
 */
export function quantileStops(values: number[], metric: Metric): number[] {
    const v = values.filter((x) => x > 0).sort((a, b) => a - b);
    if (v.length === 0) return [...DEFAULT_STOPS];

    // Quantile positions for the 7 palette steps. The top clip stops a single
    // extreme outlier from flattening everyone else into one bucket.
    //
    // For the per-enrollee rate, we cap at the 95th percentile (winsorization)
    // — standard practice in published rate choropleths. Provider-attribution
    // mismatch creates long-tail ZIP3 outliers (regional dental hubs credited
    // with claims from a wide catchment but with a small resident-enrollee
    // denominator); without the cap these outliers stretch the legend and
    // wash out the rest of the country. Geos above the cap saturate to the
    // darkest color (legend annotates this).
    //
    // Volume keeps a looser 0.97 clip because each level has its own scale and
    // outliers don't bleed across levels.
    const topClip = metric === "enrollees" ? 0.95 : 0.97;
    const qs = [0, 0.16, 0.33, 0.5, 0.67, 0.84, topClip];
    const minGap = metric === "enrollees" ? 0.01 : 1;

    const stops: number[] = [];
    for (let i = 0; i < N_STOPS; i++) {
        const idx = Math.min(v.length - 1, Math.floor(qs[i] * v.length));
        let s = v[idx];
        // interpolate() requires strictly ascending inputs; nudge ties up.
        if (i > 0 && s <= stops[i - 1]) s = stops[i - 1] + minGap;
        stops.push(s);
    }
    return stops;
}

/** Linear interpolation `fill-color` expression for an explicit stop array. */
export function colorExpressionForStops(stops: number[]) {
    return [
        "interpolate",
        ["linear"],
        ["coalesce", ["feature-state", "value"], 0],
        ...stops.flatMap((stop, i) => [stop, CHOROPLETH_COLORS[i]]),
    ];
}

// Default expression for initial layer creation, before the first data-driven
// repaint replaces it.
export const colorExpression = colorExpressionForStops(DEFAULT_STOPS);

export function buildColorExpression(
    hoveredId: string | null,
    selectedId: string | null,
    idProperty: string,
    stops: number[],
) {
    return [
        "case",
        ["==", ["get", idProperty], hoveredId ?? ""],
        HOVER_COLOR,
        ["==", ["get", idProperty], selectedId ?? ""],
        HOVER_COLOR,
        colorExpressionForStops(stops),
    ];
}

export async function fetchProtomapsStyle(apiKey: string) {
    const res = await fetch(`${PROTOMAPS_STYLE_URL}?key=${apiKey}`);
    if (!res.ok) throw new Error(`Protomaps style fetch failed: ${res.status}`);
    return res.json();
}

/**
 * Protomaps' `white.json` v2 ships ~78 layers for a general-purpose basemap:
 * 36 road classes, buildings, POIs, landuse (parks/hospitals/schools/military
 * /etc.), full label hierarchy. None of that belongs on a state-level Medicaid
 * choropleth — the map serves the data, not navigation. Prune to a whitelist
 * of layers useful as a backdrop: land, water, a country-boundary hairline,
 * and orientation labels for water bodies and (only at deep zoom) cities.
 *
 * Whitelist rather than blacklist so a Protomaps style update doesn't quietly
 * reintroduce roads/POIs/landuse the moment they revise the style.
 *
 * Editorial-cartography playbook (NYT / FT / Reuters / OWID choropleths):
 *   - Never label the thing you're choropleth-ing (state abbrevs on a state
 *     choropleth are visually redundant and muddy). `places_region` is out.
 *   - `places_country` in giant tracked type ("UNITED STATES OF AMERICA")
 *     competes with the data. Out.
 *   - Reveal city labels only on zoom-in — Chicago belongs when the user is
 *     looking at Cook County, not the whole US.
 */
const KEEP_PROTOMAPS_LAYERS = new Set([
    "background",
    "earth",
    "water",
    "physical_line_river",
    "boundaries_country",
    "physical_point_ocean",
    "physical_point_lakes",
    "places_locality_circle",
    "places_locality",
]);

/** Push city labels/dots past the state-view zoom band so state view stays clean. */
const CITY_LABEL_MIN_ZOOM = 7;

/** Anchor layer for data-fill insertion — the first pruned symbol layer id. */
export const PROTOMAPS_FIRST_LABEL_LAYER = "physical_point_ocean";

// The style spec has hundreds of variants; type only the fields we touch
// and pass through the rest with `T`. Callers cast the result back to
// maplibregl.StyleSpecification.
type StyleWithLayers<T> = T & {
    layers: Array<{ id: string; type: string; minzoom?: number } & Record<string, unknown>>;
    sources?: Record<string, { attribution?: string } & Record<string, unknown>>;
};

export function minimizeProtomapsStyle<T>(style: StyleWithLayers<T>): StyleWithLayers<T> {
    const layers = style.layers
        .filter((l) => KEEP_PROTOMAPS_LAYERS.has(l.id))
        .map((l) => {
            if (l.id === "places_locality" || l.id === "places_locality_circle") {
                return { ...l, minzoom: Math.max(l.minzoom ?? 0, CITY_LABEL_MIN_ZOOM) };
            }
            return l;
        });
    // Protomaps' style declares its own "Protomaps © OpenStreetMap" on the
    // tile source; MapLibre appends that to our customAttribution and the two
    // read as duplicates in the corner ("Protomaps © OpenStreetMap | © OSM
    // contributors, Protomaps"). Strip the source-side attribution and let
    // customAttribution be the single truthful line — it has proper links
    // and the ODbL-standard "contributors" phrasing.
    const sources = style.sources
        ? Object.fromEntries(
              Object.entries(style.sources).map(([k, v]) => {
                  const { attribution: _dropped, ...rest } = v;
                  return [k, rest];
              }),
          )
        : style.sources;
    return { ...style, layers, sources };
}
