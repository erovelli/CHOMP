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

export const CHOROPLETH_STOPS = [0, 50_000, 150_000, 400_000, 800_000, 1_200_000, 2_000_000];

export const HOVER_COLOR = "#c8f0ed";

// Derive the interpolation expression from the arrays (DRY)
export const colorExpression = [
    "interpolate",
    ["linear"],
    ["coalesce", ["feature-state", "value"], 0],
    ...CHOROPLETH_STOPS.flatMap((stop, i) => [stop, CHOROPLETH_COLORS[i]]),
];

export function buildColorExpression(
    hoveredId: string | null,
    selectedId: string | null,
    idProperty: string,
) {
    return [
        "case",
        ["==", ["get", idProperty], hoveredId ?? ""],
        HOVER_COLOR,
        ["==", ["get", idProperty], selectedId ?? ""],
        HOVER_COLOR,
        colorExpression,
    ];
}

export async function fetchProtomapsStyle(apiKey: string) {
    const res = await fetch(`${PROTOMAPS_STYLE_URL}?key=${apiKey}`);
    if (!res.ok) throw new Error(`Protomaps style fetch failed: ${res.status}`);
    return res.json();
}
