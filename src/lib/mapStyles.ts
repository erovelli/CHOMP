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
