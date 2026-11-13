import type { LayerKey, LayerConfig, GeoLevel, Metric } from "../lib/types";

// ── Map viewport ──────────────────────────────────────────────
export const MAP_CENTER: [number, number] = [-98.5, 39.8];
export const MAP_ZOOM = 4;
export const MAP_MIN_ZOOM = 2;
export const MAP_MAX_ZOOM = 14;

// Continental-US bounds. Small screens fit the initial view to these instead
// of MAP_CENTER/MAP_ZOOM, which crop both seaboards on a portrait phone.
export const CONUS_BOUNDS: [[number, number], [number, number]] = [
    [-124.9, 24.4],
    [-66.9, 49.4],
];

// ── Geography levels ──────────────────────────────────────────
// One spec per level drives every per-level operation in MapContainer: source
// and layer creation, feature-state writes, and hover/click handling.
export interface GeoLayerSpec {
    source: string;
    fill: string;
    stroke: string;
    /** Feature property promoted to the feature id (and used as the data key). */
    idProp: string;
    /** File under public/: GeoJSON, or a PMTiles archive when `sourceLayer` is set. */
    file: string;
    /** Vector-tile layer name inside the PMTiles archive. */
    sourceLayer?: string;
    strokeColor: string;
    fillOpacity: { selected: number; hover: number; default: number };
    lineWidth: { selected: number; hover: number; default: number };
    lineOpacity: { selected: number; default: number };
}

export const COUNTY_GEOJSON = "counties.geojson";

export const GEO_LAYERS: Record<GeoLevel, GeoLayerSpec> = {
    // Census cb_2023_us_state_5m as GeoJSON, so the coastline reads clean
    // against Protomaps' OSM-derived basemap. See scripts/fetch_state_geometry.py.
    state: {
        source: "states-source",
        fill: "states-fill",
        stroke: "states-stroke",
        idProp: "postal",
        file: "states.geojson",
        strokeColor: "#6b7f7d",
        fillOpacity: { selected: 1.0, hover: 0.95, default: 0.82 },
        lineWidth: { selected: 2, hover: 1.5, default: 0.8 },
        lineOpacity: { selected: 1, default: 0.6 },
    },
    // Keyed by 5-digit FIPS via the `GEOID` property.
    county: {
        source: "county-source",
        fill: "county-fill",
        stroke: "county-stroke",
        idProp: "GEOID",
        file: COUNTY_GEOJSON,
        strokeColor: "#9a948d",
        fillOpacity: { selected: 1.0, hover: 0.9, default: 0.72 },
        lineWidth: { selected: 2, hover: 1.2, default: 0.25 },
        lineOpacity: { selected: 1, default: 0.35 },
    },
    zip3: {
        source: "zip3-source",
        fill: "zip3-fill",
        stroke: "zip3-stroke",
        idProp: "3dig_zip",
        file: "zip3.pmtiles",
        sourceLayer: "zip3codes",
        strokeColor: "#9a948d",
        fillOpacity: { selected: 1.0, hover: 0.9, default: 0.5 },
        lineWidth: { selected: 2, hover: 1.2, default: 0.3 },
        lineOpacity: { selected: 1, default: 0.4 },
    },
};

/** Stroke color for a hovered or selected region, at every level. */
export const STROKE_COLOR_ACTIVE = "#1a1917";

// Non-interactive grey backdrop showing Canada/Mexico/etc. so the US data has
// regional context. Rendered below every other layer; no feature-state.
export const WORLD_SOURCE = "world-source";
export const WORLD_FILL = "world-fill";
export const WORLD_STROKE = "world-stroke";
export const WORLD_GEOJSON = "world.geojson";
export const WORLD_FILL_COLOR = "#d8d4cd";
export const WORLD_STROKE_COLOR = "#b3aea4";
export const WORLD_FILL_OPACITY = 0.85;
export const WORLD_LINE_WIDTH = 0.4;
export const WORLD_LINE_OPACITY = 0.55;

// ── Geography toggle (shared by LeftRail, FilterSheet, and the export panel) ──
export const GEO_LEVELS: { key: GeoLevel; label: string }[] = [
    { key: "state", label: "State" },
    { key: "county", label: "County" },
    { key: "zip3", label: "ZIP3" },
];

/** Coarse → fine. Also the order the map layers are added in. */
export const GEO_LEVEL_KEYS: GeoLevel[] = GEO_LEVELS.map((l) => l.key);

// ── Metric toggle (shared by LeftRail and the mobile FilterSheet) ──
export const METRIC_OPTIONS: { key: Metric; label: string }[] = [
    { key: "claims", label: "Volume" },
    { key: "enrollees", label: "Per enrollee" },
];

// ── Data file paths (relative to BASE_URL) ────────────────────
export const DATA_PATHS: Record<"annual" | "monthly" | "enrollment", Record<GeoLevel, string>> = {
    annual: {
        state: "data/provider_procedure_category_aggregate_annual_state.json",
        county: "data/provider_procedure_category_aggregate_annual_county.json",
        zip3: "data/provider_procedure_category_aggregate_annual_zip3.json",
    },
    monthly: {
        state: "data/provider_procedure_category_aggregate_monthly_state.json",
        county: "data/provider_procedure_category_aggregate_monthly_county.json",
        zip3: "data/provider_procedure_category_aggregate_monthly_zip3.json",
    },
    enrollment: {
        state: "data/medicaid_enrollment_state.json",
        county: "data/medicaid_enrollment_county.json",
        zip3: "data/medicaid_enrollment_zip3.json",
    },
};

// ── Protomaps ─────────────────────────────────────────────────
export const PROTOMAPS_STYLE_URL = "https://api.protomaps.com/styles/v2/white.json";
export const FALLBACK_BG_COLOR = "#f0ede8";

// ── Map attribution ──────────────────────────────────────────
// Required by Protomaps' license (ODbL). TIGER/LSIB are cited on the
// Credits page instead; neither requires on-map attribution.
export const OSM_ATTRIBUTION =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> contributors, <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

// ── Category mapping ──────────────────────────────────────────
// Bridges the category strings emitted by scripts/build_aggregates.py to the
// UI LayerKey. Every CDT/ADA category present in the data
// has its own selectable layer.
export const CATEGORY_TO_KEY: Record<string, LayerKey> = {
    Diagnostic: "diagnostic",
    Preventive: "preventive",
    Restorative: "restorative",
    Endodontics: "endodontics",
    Periodontics: "periodontics",
    "Prosthodontics (removable)": "prosthodontics_removable",
    "Maxillofacial Prosthetics": "maxillofacial_prosthetics",
    "Implant Services": "implant_services",
    "Prosthodontics (fixed)": "prosthodontics_fixed",
    "Oral and Maxillofacial Surgery": "oral_max_surgery",
    Orthodontics: "orthodontics",
    "Adjunctive General Services": "adjunctive",
};

// ── Layer configs ─────────────────────────────────────────────
export const LAYER_CONFIGS: Record<LayerKey, LayerConfig> = {
    all: {
        label: "All categories",
        unit: "total claims",
    },
    diagnostic: {
        label: "Diagnostic",
        unit: "claims",
    },
    preventive: {
        label: "Preventive",
        unit: "claims",
    },
    restorative: {
        label: "Restorative",
        unit: "claims",
    },
    endodontics: {
        label: "Endodontics",
        unit: "claims",
    },
    periodontics: {
        label: "Periodontics",
        unit: "claims",
    },
    prosthodontics_removable: {
        label: "Removable Prosthodontics",
        unit: "claims",
    },
    maxillofacial_prosthetics: {
        label: "Maxillofacial Prosthetics",
        unit: "claims",
    },
    implant_services: {
        label: "Implant Services",
        unit: "claims",
    },
    prosthodontics_fixed: {
        label: "Fixed Prosthodontics",
        unit: "claims",
    },
    oral_max_surgery: {
        label: "Oral & Maxillofacial Surgery",
        unit: "claims",
    },
    orthodontics: {
        label: "Orthodontics",
        unit: "claims",
    },
    adjunctive: {
        label: "Adjunctive General Services",
        unit: "claims",
    },
};

// CDT-canonical ordering (I–XII), with "All" pinned to the top.
export const LAYER_ORDER: LayerKey[] = [
    "all",
    "diagnostic",
    "preventive",
    "restorative",
    "endodontics",
    "periodontics",
    "prosthodontics_removable",
    "maxillofacial_prosthetics",
    "implant_services",
    "prosthodontics_fixed",
    "oral_max_surgery",
    "orthodontics",
    "adjunctive",
];
