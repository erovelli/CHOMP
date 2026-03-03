export const CHOROPLETH_COLORS = [
    "#f7f4ee",
    "#d4e8e4",
    "#93cec6",
    "#4aaca0",
    "#1e8a7e",
    "#0d6b60",
    "#084d44",
];

export const CHOROPLETH_STOPS = [0, 30, 60, 90, 120, 150, 200];

export const HOVER_COLOR = "#c8f0ed";

// The base color interpolation expression — reused in multiple places
export const colorExpression = [
    "interpolate",
    ["linear"],
    ["coalesce", ["feature-state", "value"], 0],
    0,   "#f7f4ee",
    30,  "#d4e8e4",
    60,  "#93cec6",
    90,  "#4aaca0",
    120, "#1e8a7e",
    150, "#0d6b60",
    200, "#084d44",
];

// Build paint expression with hover + selected highlights
export function buildColorExpression(
    hoveredZip: string | null,
    selectedZip: string | null,
) {
    return [
        "case",
        ["==", ["get", "ZCTA5"], hoveredZip ?? ""],
        HOVER_COLOR,
        ["==", ["get", "ZCTA5"], selectedZip ?? ""],
        HOVER_COLOR,
        colorExpression,
    ];
}

export async function fetchProtomapsStyle(apiKey: string) {
    const res = await fetch(
        `https://api.protomaps.com/styles/v2/white.json?key=${apiKey}`,
    );
    if (!res.ok) throw new Error(`Protomaps style fetch failed: ${res.status}`);
    return res.json();
}
