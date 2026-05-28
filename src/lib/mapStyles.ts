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
 * screen — geography level × year × category × metric — so volume and ratio
 * each spread across the full palette instead of saturating dark or washing out
 * light. Stops are quantile breaks of the non-zero values (skewed claim/ratio
 * distributions get good contrast from quantiles rather than linear min→max).
 */
export function quantileStops(values: number[], metric: Metric): number[] {
    const v = values.filter((x) => x > 0).sort((a, b) => a - b);
    if (v.length === 0) return [...DEFAULT_STOPS];

    // Quantile positions for the 7 palette steps (slightly clipped at the top so
    // a single extreme outlier doesn't flatten everyone else into one bucket).
    const qs = [0, 0.16, 0.33, 0.5, 0.67, 0.84, 0.97];
    const minGap = metric === "ratio" ? 0.01 : 1;

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
