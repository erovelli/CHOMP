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

// ── DQ Atlas overlay ─────────────────────────────────────────
// CMS DQ Atlas (medicaid.gov/dq-atlas) publishes per-state, per-year data-
// quality ratings across ~50 topics. This app surfaces 10 as an optional
// ring-overlay on top of the claims choropleth. See scripts/build_dq_atlas.py
// for the pipeline and public/data/dq_atlas.json for the emitted blob.

/** The 10 topics we surface (subset of the DQ Atlas's ~50). */
export type DqTopicKey =
    | "link-bene"
    | "link-providers"
    | "claims-volume"
    | "service-users"
    | "cmc-encounters"
    | "missing-pmt-ffs"
    | "missing-pmt-enc"
    | "pmt-consistency"
    | "proc-cd-prof"
    | "proc-cd-inst";

/** CMS's 5-tier categorical rating. */
export type DqAssessment =
    | "Low concern"
    | "Medium concern"
    | "High concern"
    | "Unusable"
    | "Unclassified";

/** Per-(topic, year, state) record. `pct` is the topic's headline metric,
 * omitted when the CSV reports "Not applicable". */
export interface DqStateRecord {
    assessment: DqAssessment;
    pct?: number;
}

export interface DqTopic {
    label: string;
    description: string;
    metric_label: string;
    /** Keyed by 4-digit year, then by USPS state postal. */
    years: Record<string, Record<string, DqStateRecord>>;
}

export interface DqData {
    topics: Record<DqTopicKey, DqTopic>;
    assessments: DqAssessment[];
}
