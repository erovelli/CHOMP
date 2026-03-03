export type LayerKey =
    | "all"
    | "preventive"
    | "restorative"
    | "extractions"
    | "ortho";

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
        label: "All Procedures",
        description: "Claims per 1,000 beneficiaries",
        unit: "Claims per 1,000",
        min: 0,
        max: 200,
        accent: "#1e8a7e",
    },
    preventive: {
        key: "preventive",
        label: "Preventive",
        description: "Exams, cleanings, fluoride",
        unit: "Claims per 1,000",
        min: 0,
        max: 120,
        accent: "#4a7fcb",
    },
    restorative: {
        key: "restorative",
        label: "Restorative",
        description: "Fillings, crowns",
        unit: "Claims per 1,000",
        min: 0,
        max: 80,
        accent: "#c87d2a",
    },
    extractions: {
        key: "extractions",
        label: "Extractions",
        description: "Simple & surgical",
        unit: "Claims per 1,000",
        min: 0,
        max: 50,
        accent: "#b03a3a",
    },
    ortho: {
        key: "ortho",
        label: "Orthodontic",
        description: "Braces, retainers",
        unit: "Claims per 1,000",
        min: 0,
        max: 30,
        accent: "#7a5cb8",
    },
};

export interface ZCTADetail {
    zcta: string;
    state: string;
    stateName: string;
    all: number;
    preventive: number;
    restorative: number;
    extractions: number;
    ortho: number;
    providers: number;
    beneficiaries: number;
    totalPayment: number;
    avgPaymentPerClaim: number;
    nationalPctile: number;
    nationalAvg: Record<LayerKey, number>;
    stateAvg: Record<LayerKey, number>;
}
