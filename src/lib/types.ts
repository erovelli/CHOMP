// Mirrors the 12 CDT/ADA procedure-category divisions (plus "all"). Splits the
// previously-collapsed Prosthodontics and surfaces Maxillofacial Prosthetics and
// Implant Services as their own selectable layers.
export type LayerKey =
    | "all"
    | "diagnostic"
    | "preventive"
    | "restorative"
    | "endodontics"
    | "periodontics"
    | "prosthodontics_removable"
    | "maxillofacial_prosthetics"
    | "implant_services"
    | "prosthodontics_fixed"
    | "oral_max_surgery"
    | "orthodontics"
    | "adjunctive";

/** Geographic aggregation level the map is currently showing. */
export type GeoLevel = "state" | "county" | "zip3";

/**
 * What the choropleth color encodes.
 * - `claims`: raw claim volume (a population/size map).
 * - `enrollees`: claims per Medicaid enrollee from ACS C27007 (a penetration map).
 *
 * A claims-per-dental-patient-served ratio was previously offered but removed:
 * the HHS-served denominator is per-category, so the "All Categories" view
 * double-counted enrollees who used multiple categories and the default number
 * was structurally biased. ACS C27007 gives a clean, category-independent
 * denominator at every geo. See git history for the prior implementation.
 */
export type Metric = "claims" | "enrollees";

/** ACS C27007 endpoint-year Medicaid enrollment for one geography. */
export interface EnrollmentRecord {
    year: string;
    medicaid_enrollees: number;
}

export interface LayerConfig {
    key: LayerKey;
    label: string;
    description: string;
    unit: string;
    min: number;
    max: number;
    accent: string;
}

// total_beneficiaries_served is shipped in the NDJSON for use in side-panel
// summaries; it is NOT used as a map metric denominator. See the Metric
// docstring above for why.
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
