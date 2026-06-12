import { describe, it, expect } from "vitest";
import type { DataRecord, MonthlyDataRecord, EnrollmentRecord } from "../types";
import {
    SUBSET_CSV_COLUMNS,
    buildSubsetCsvRows,
    rowsToSubsetCsv,
    availableMonthlyPeriods,
    estimateSubsetRows,
    subsetCsvFilename,
} from "./subsetCsv";

const annual: Record<string, DataRecord[]> = {
    CA: [
        {
            year: "2024",
            category: "Preventive",
            total_claims: 100,
            total_beneficiaries_served: 80,
            total_amount_paid: 5000,
        },
        {
            year: "2024",
            category: "Restorative",
            total_claims: 50,
            total_beneficiaries_served: 40,
            total_amount_paid: 7500,
        },
        {
            year: "2023",
            category: "Preventive",
            total_claims: 200,
            total_beneficiaries_served: 150,
            total_amount_paid: 9000,
        },
    ],
    AL: [
        {
            year: "2024",
            category: "Preventive",
            total_claims: 10,
            total_beneficiaries_served: 9,
            total_amount_paid: 600,
        },
    ],
    DC: [
        {
            year: "2024",
            category: "Restorative",
            total_claims: 0,
            total_beneficiaries_served: 0,
            total_amount_paid: 0,
        },
    ],
};

const enrollment: Record<string, EnrollmentRecord[]> = {
    CA: [
        { year: "2024", medicaid_enrollees: 1000 },
        { year: "2023", medicaid_enrollees: 800 },
    ],
    // AL intentionally has no enrollment record → enrollee/rate columns blank.
};

describe("SUBSET_CSV_COLUMNS", () => {
    it("has the documented columns in the documented order", () => {
        expect([...SUBSET_CSV_COLUMNS]).toEqual([
            "region_id",
            "region_name",
            "level",
            "period",
            "category",
            "total_claims",
            "total_beneficiaries_served",
            "total_amount_paid",
            "medicaid_enrollees",
            "claims_per_enrollee",
        ]);
    });

    it("rowsToSubsetCsv emits the header row in order", () => {
        const csv = rowsToSubsetCsv([]);
        expect(csv.split("\n")[0]).toBe(
            "region_id,region_name,level,period,category,total_claims,total_beneficiaries_served,total_amount_paid,medicaid_enrollees,claims_per_enrollee",
        );
    });
});

describe("buildSubsetCsvRows — annual", () => {
    it("expands across multiple periods × categories", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2023", "2024"],
            categories: ["preventive", "restorative"],
            regionIds: ["CA", "AL"],
            annualData: annual,
            enrollment,
        });
        // CA: 2023 Preventive (Restorative absent), 2024 Preventive, 2024 Restorative = 3
        // AL: 2024 Preventive = 1
        expect(rows).toHaveLength(4);
        const caRows = rows.filter((r) => r.region_id === "CA");
        expect(caRows.map((r) => `${r.period}/${r.category}`)).toEqual([
            "2023/Preventive",
            "2024/Preventive",
            "2024/Restorative",
        ]);
    });

    it("joins enrollees and computes claims_per_enrollee", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024"],
            categories: ["preventive"],
            regionIds: ["CA"],
            annualData: annual,
            enrollment,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].medicaid_enrollees).toBe(1000);
        // 100 claims / 1000 enrollees
        expect(rows[0].claims_per_enrollee).toBe(0.1);
    });

    it("blanks enrollee + rate columns when no denominator exists", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024"],
            categories: ["preventive"],
            regionIds: ["AL"],
            annualData: annual,
            enrollment,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].medicaid_enrollees).toBe("");
        expect(rows[0].claims_per_enrollee).toBe("");
    });

    it("drops category rows whose totals are all zero", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024"],
            categories: ["restorative"],
            regionIds: ["DC"],
            annualData: annual,
            enrollment,
        });
        expect(rows).toHaveLength(0);
    });

    it("filters to the explicitly requested regions", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024"],
            categories: ["preventive"],
            regionIds: ["CA"],
            annualData: annual,
            enrollment,
        });
        expect(rows.every((r) => r.region_id === "CA")).toBe(true);
    });

    it("adds a summed All Categories row when requested", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024"],
            categories: ["preventive"],
            includeAllCategoriesTotal: true,
            regionIds: ["CA"],
            annualData: annual,
            enrollment,
        });
        const all = rows.find((r) => r.category === "All Categories");
        expect(all).toBeDefined();
        // 100 (Preventive) + 50 (Restorative) summed across every category present
        expect(all?.total_claims).toBe(150);
        expect(all?.total_amount_paid).toBe(12500);
        // rate uses the summed claims over the same denominator
        expect(all?.claims_per_enrollee).toBe(0.15);
    });

    it("resolves state region_name via the postal lookup", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024"],
            categories: ["preventive"],
            regionIds: ["CA", "AL"],
            annualData: annual,
            enrollment,
        });
        expect(rows.find((r) => r.region_id === "CA")?.region_name).toBe("California");
        expect(rows.find((r) => r.region_id === "AL")?.region_name).toBe("Alabama");
    });

    it("uses countyNames for county-level region_name", () => {
        const countyData: Record<string, DataRecord[]> = {
            "01001": [
                {
                    year: "2024",
                    category: "Preventive",
                    total_claims: 5,
                    total_beneficiaries_served: 4,
                    total_amount_paid: 300,
                },
            ],
        };
        const rows = buildSubsetCsvRows({
            level: "county",
            grain: "annual",
            periods: ["2024"],
            categories: ["preventive"],
            regionIds: ["01001"],
            annualData: countyData,
            countyNames: { "01001": "Autauga County, AL" },
        });
        expect(rows[0].region_name).toBe("Autauga County, AL");
        // and the comma'd name survives CSV round-trip (auto-quoted by Papa)
        const csv = rowsToSubsetCsv(rows);
        expect(csv).toContain('"Autauga County, AL"');
    });

    it("sorts by region_id, then period, then category", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "annual",
            periods: ["2024", "2023"],
            categories: ["restorative", "preventive"],
            regionIds: ["CA", "AL"],
            annualData: annual,
            enrollment,
        });
        const keys = rows.map((r) => `${r.region_id}|${r.period}|${r.category}`);
        expect(keys).toEqual([...keys].sort());
    });
});

describe("buildSubsetCsvRows — monthly", () => {
    const monthly: Record<string, MonthlyDataRecord[]> = {
        CA: [
            {
                year_month: "2024-06",
                category: "Preventive",
                total_claims: 12,
                total_beneficiaries_served: 10,
                total_amount_paid: 500,
            },
            {
                year_month: "2024-07",
                category: "Preventive",
                total_claims: 15,
                total_beneficiaries_served: 12,
                total_amount_paid: 600,
            },
        ],
    };

    it("filters by year_month and uses the endpoint-year enrollment", () => {
        const rows = buildSubsetCsvRows({
            level: "state",
            grain: "monthly",
            periods: ["2024-06"],
            categories: ["preventive"],
            regionIds: ["CA"],
            monthlyData: monthly,
            enrollment,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].period).toBe("2024-06");
        expect(rows[0].total_claims).toBe(12);
        // 2024 endpoint-year enrollment reused for the month
        expect(rows[0].medicaid_enrollees).toBe(1000);
        expect(rows[0].claims_per_enrollee).toBe(0.012);
    });

    it("availableMonthlyPeriods returns sorted distinct year-months", () => {
        expect(availableMonthlyPeriods(monthly)).toEqual(["2024-06", "2024-07"]);
    });
});

describe("estimateSubsetRows", () => {
    it("multiplies dimensions and counts the all-categories row", () => {
        expect(estimateSubsetRows(3, 5, 2, false)).toBe(30);
        expect(estimateSubsetRows(3, 5, 2, true)).toBe(45);
    });
});

describe("subsetCsvFilename", () => {
    it("encodes level, grain, and the period span", () => {
        expect(subsetCsvFilename("state", "annual", ["2020", "2024", "2022"])).toBe(
            "medicaid-dental_subset_state_annual_2020_2024.csv",
        );
        expect(subsetCsvFilename("zip3", "monthly", ["2024-06"])).toBe(
            "medicaid-dental_subset_zip3_monthly_2024-06.csv",
        );
    });
});
