import type { LayerKey, LayerConfig, GeoLevel } from "../lib/types";

// ── Map viewport ──────────────────────────────────────────────
export const MAP_CENTER: [number, number] = [-98.5, 39.8];
export const MAP_ZOOM = 4;
export const MAP_MIN_ZOOM = 2;
export const MAP_MAX_ZOOM = 14;

// ── Tile sources & layers ─────────────────────────────────────
export const STATES_SOURCE = "states-source";
export const STATES_FILL = "states-fill";
export const STATES_STROKE = "states-stroke";
export const STATES_LAYER = "states";
export const STATES_ID_PROP = "postal";

export const ZIP3_SOURCE = "zip3-source";
export const ZIP3_FILL = "zip3-fill";
export const ZIP3_STROKE = "zip3-stroke";
export const ZIP3_LAYER = "zip3codes";
export const ZIP3_ID_PROP = "3dig_zip";

// Counties are a GeoJSON source (no PMTiles build tooling available); features
// are keyed by 5-digit FIPS via the `GEOID` property promoted to the feature id.
export const COUNTY_SOURCE = "county-source";
export const COUNTY_FILL = "county-fill";
export const COUNTY_STROKE = "county-stroke";
export const COUNTY_ID_PROP = "GEOID";
export const COUNTY_GEOJSON = "counties.geojson";

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

// ── Geography levels (map drill-down) ─────────────────────────
export const GEO_LEVELS: { key: GeoLevel; label: string }[] = [
    { key: "state", label: "State" },
    { key: "county", label: "County" },
    { key: "zip3", label: "ZIP3" },
];

// ── Data file paths (relative to BASE_URL) ────────────────────
export const DATA_PATHS = {
    annualState: "data/provider_procedure_category_aggregate_annual_state.json",
    annualCounty: "data/provider_procedure_category_aggregate_annual_county.json",
    annualZip3: "data/provider_procedure_category_aggregate_annual_zip3.json",
    monthlyState: "data/provider_procedure_category_aggregate_monthly_state.json",
    monthlyCounty: "data/provider_procedure_category_aggregate_monthly_county.json",
    monthlyZip3: "data/provider_procedure_category_aggregate_monthly_zip3.json",
    enrollmentState: "data/medicaid_enrollment_state.json",
    enrollmentCounty: "data/medicaid_enrollment_county.json",
    enrollmentZip3: "data/medicaid_enrollment_zip3.json",
} as const;

// ── Protomaps ─────────────────────────────────────────────────
export const PROTOMAPS_STYLE_URL = "https://api.protomaps.com/styles/v2/white.json";
export const FALLBACK_BG_COLOR = "#f0ede8";

// ── Stroke colors ─────────────────────────────────────────────
export const STROKE_COLOR_ACTIVE = "#1a1917";
export const STROKE_COLOR_DEFAULT_STATES = "#6b7f7d";
export const STROKE_COLOR_DEFAULT_ZIP3 = "#9a948d";
export const STROKE_COLOR_DEFAULT_COUNTY = "#9a948d";

// ── Fill opacity (selected / hover / default) ─────────────────
export const STATES_FILL_OPACITY = { selected: 1.0, hover: 0.95, default: 0.82 } as const;
export const ZIP3_FILL_OPACITY = { selected: 1.0, hover: 0.9, default: 0.5 } as const;
export const COUNTY_FILL_OPACITY = { selected: 1.0, hover: 0.9, default: 0.72 } as const;

// ── Line widths (selected / hover / default) ──────────────────
export const STATES_LINE_WIDTH = { selected: 2, hover: 1.5, default: 0.8 } as const;
export const ZIP3_LINE_WIDTH = { selected: 2, hover: 1.2, default: 0.3 } as const;
export const COUNTY_LINE_WIDTH = { selected: 2, hover: 1.2, default: 0.25 } as const;

// ── Line opacity (selected / default) ─────────────────────────
export const STATES_LINE_OPACITY = { selected: 1, default: 0.6 } as const;
export const ZIP3_LINE_OPACITY = { selected: 1, default: 0.4 } as const;
export const COUNTY_LINE_OPACITY = { selected: 1, default: 0.35 } as const;

// ── Category mapping ──────────────────────────────────────────
// Bridges the SQL category strings (built by scripts/build_aggregates.py and
// migration 006) to the UI LayerKey. Every CDT/ADA category present in the data
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
// `min`/`max` are kept for back-compat but no longer drive the choropleth
// scale — color stops are recomputed dynamically per view (see mapStyles).
export const LAYER_CONFIGS: Record<LayerKey, LayerConfig> = {
    all: {
        key: "all",
        label: "All Categories",
        description: "Total across all procedure types",
        unit: "Total Claims",
        min: 0,
        max: 2_000_000,
        accent: "#1e8a7e",
    },
    diagnostic: {
        key: "diagnostic",
        label: "Diagnostic",
        description: "Exams, x-rays, evaluations",
        unit: "Claims",
        min: 0,
        max: 800_000,
        accent: "#4a7fcb",
    },
    preventive: {
        key: "preventive",
        label: "Preventive",
        description: "Cleanings, fluoride, sealants",
        unit: "Claims",
        min: 0,
        max: 600_000,
        accent: "#2ca58d",
    },
    restorative: {
        key: "restorative",
        label: "Restorative",
        description: "Fillings, crowns, inlays",
        unit: "Claims",
        min: 0,
        max: 200_000,
        accent: "#c87d2a",
    },
    endodontics: {
        key: "endodontics",
        label: "Endodontics",
        description: "Root canals, pulp therapy",
        unit: "Claims",
        min: 0,
        max: 20_000,
        accent: "#d4694a",
    },
    periodontics: {
        key: "periodontics",
        label: "Periodontics",
        description: "Gum disease treatment",
        unit: "Claims",
        min: 0,
        max: 10_000,
        accent: "#5c9e7a",
    },
    prosthodontics_removable: {
        key: "prosthodontics_removable",
        label: "Prosthodontics (removable)",
        description: "Dentures, partials",
        unit: "Claims",
        min: 0,
        max: 5_000,
        accent: "#6b8cae",
    },
    maxillofacial_prosthetics: {
        key: "maxillofacial_prosthetics",
        label: "Maxillofacial Prosthetics",
        description: "Surgical obturators, facial-defect prostheses",
        unit: "Claims",
        min: 0,
        max: 2_000,
        accent: "#a07ba8",
    },
    implant_services: {
        key: "implant_services",
        label: "Implant Services",
        description: "Surgical implants",
        unit: "Claims",
        min: 0,
        max: 5_000,
        accent: "#4d7a91",
    },
    prosthodontics_fixed: {
        key: "prosthodontics_fixed",
        label: "Prosthodontics (fixed)",
        description: "Fixed bridges, retainers",
        unit: "Claims",
        min: 0,
        max: 5_000,
        accent: "#5e7799",
    },
    oral_max_surgery: {
        key: "oral_max_surgery",
        label: "Oral & Maxillofacial Surgery",
        description: "Extractions, surgical procedures",
        unit: "Claims",
        min: 0,
        max: 100_000,
        accent: "#b03a3a",
    },
    orthodontics: {
        key: "orthodontics",
        label: "Orthodontics",
        description: "Braces, retainers",
        unit: "Claims",
        min: 0,
        max: 50_000,
        accent: "#7a5cb8",
    },
    adjunctive: {
        key: "adjunctive",
        label: "Adjunctive General Services",
        description: "Anesthesia, drugs, palliative care",
        unit: "Claims",
        min: 0,
        max: 80_000,
        accent: "#8c7853",
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

/** Derive category→color map from LAYER_CONFIGS via CATEGORY_TO_KEY */
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
    Object.entries(CATEGORY_TO_KEY).map(([cat, key]) => [cat, LAYER_CONFIGS[key].accent]),
);
