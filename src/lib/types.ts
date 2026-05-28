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

/** Geographic aggregation level the map is currently showing. */
export type GeoLevel = "state" | "county" | "zip3";

/**
 * What the choropleth color encodes.
 * - `claims`: raw claim volume (a population/size map).
 * - `ratio`: claims per beneficiary (a utilization-intensity map).
 */
export type Metric = "claims" | "ratio";

export interface LayerConfig {
    key: LayerKey;
    label: string;
    description: string;
    unit: string;
    min: number;
    max: number;
    accent: string;
}

// Claims-per-beneficiary (the "Per patient" metric) is derived at runtime as
// total_claims / total_beneficiaries_served — it is NOT a stored field (see
// docs/DATA_DICTIONARY.md and the note in scripts/build_aggregates.py).
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
    level: GeoLevel;
    records: DataRecord[];
    monthlyRecords?: MonthlyDataRecord[];
}
