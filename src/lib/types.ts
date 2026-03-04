export type LayerKey =
    | "all"
    | "diagnostic"
    | "preventive"
    | "restorative"
    | "oral_surgery"
    | "orthodontics"
    | "endodontics"
    | "periodontics"
    | "adjunctive"
    | "prosthodontics";

/** Maps raw category strings from the JSON data to LayerKey */
export const CATEGORY_TO_KEY: Record<string, LayerKey> = {
    "Diagnostic": "diagnostic",
    "Preventive": "preventive",
    "Restorative": "restorative",
    "Oral Surgery": "oral_surgery",
    "Orthodontics": "orthodontics",
    "Endodontics": "endodontics",
    "Periodontics": "periodontics",
    "Adjunctive General Services": "adjunctive",
    "Prosthodontics (removable)": "prosthodontics",
    "Prosthodontics (fixed)": "prosthodontics",
};

export interface LayerConfig {
    key: LayerKey;
    label: string;
    description: string;
    unit: string;
    min: number;
    max: number;
    accent: string;
}

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
        description: "Fillings, crowns",
        unit: "Claims",
        min: 0,
        max: 200_000,
        accent: "#c87d2a",
    },
    oral_surgery: {
        key: "oral_surgery",
        label: "Oral Surgery",
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
    adjunctive: {
        key: "adjunctive",
        label: "Adjunctive General",
        description: "Anesthesia, drugs, misc",
        unit: "Claims",
        min: 0,
        max: 80_000,
        accent: "#8c7853",
    },
    prosthodontics: {
        key: "prosthodontics",
        label: "Prosthodontics",
        description: "Dentures, bridges",
        unit: "Claims",
        min: 0,
        max: 5_000,
        accent: "#6b8cae",
    },
};

export interface DataRecord {
    year: string;
    category: string;
    total_beneficiaries_served: number;
    total_claims: number;
    total_amount_paid: number;
}

export interface MonthlyDataRecord {
    year_month: string;
    category: string;
    total_beneficiaries_served: number;
    total_claims: number;
    total_amount_paid: number;
}

export interface RegionDetail {
    id: string;
    name: string;
    level: "state" | "zip3";
    records: DataRecord[];
    monthlyRecords?: MonthlyDataRecord[];
}
