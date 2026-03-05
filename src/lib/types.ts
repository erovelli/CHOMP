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

export interface LayerConfig {
    key: LayerKey;
    label: string;
    description: string;
    unit: string;
    min: number;
    max: number;
    accent: string;
}

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
