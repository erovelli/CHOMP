import { describe, it, expect } from "vitest";
import type { DataRecord, MonthlyDataRecord } from "../types";
import { CSV_COLUMNS, buildCsvRows, csvFilename, rowsToCsv } from "./csv";

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

describe("CSV column ordering", () => {
    it("has the documented columns in the documented order", () => {
        expect([...CSV_COLUMNS]).toEqual([
            "region_id",
            "region_name",
            "level",
            "year",
            "category",
            "total_claims",
            "total_beneficiaries_served",
            "total_amount_paid",
        ]);
    });

    it("rowsToCsv emits the header row in the documented order", () => {
        const csv = rowsToCsv([
            {
                region_id: "CA",
                region_name: "California",
                level: "state",
                year: "2024",
                category: "All Categories",
                total_claims: 1,
                total_beneficiaries_served: 1,
                total_amount_paid: 1,
            },
        ]);
        expect(csv.split("\n")[0]).toBe(
            "region_id,region_name,level,year,category,total_claims,total_beneficiaries_served,total_amount_paid",
        );
    });
});

describe("buildCsvRows — annual", () => {
    it("sums every category at activeLayer='all'", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2024",
            activeLayer: "all",
            annualData: annual,
        });
        const ca = rows.find((r) => r.region_id === "CA");
        expect(ca).toBeDefined();
        // CA 2024: 100 + 50 claims, 80 + 40 beneficiaries, 5000 + 7500 paid
        expect(ca?.total_claims).toBe(150);
        expect(ca?.total_beneficiaries_served).toBe(120);
        expect(ca?.total_amount_paid).toBe(12500);
        expect(ca?.category).toBe("All Categories");
    });

    it("filters to a single category when activeLayer is specific", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2024",
            activeLayer: "preventive",
            annualData: annual,
        });
        const ca = rows.find((r) => r.region_id === "CA");
        expect(ca?.total_claims).toBe(100);
        expect(ca?.category).toBe("Preventive");
        // Restorative-only state DC has no preventive 2024 rows and is dropped.
        expect(rows.find((r) => r.region_id === "DC")).toBeUndefined();
    });

    it("drops regions whose totals are all zero", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2024",
            activeLayer: "all",
            annualData: annual,
        });
        // DC has only a zero-row in 2024.
        expect(rows.find((r) => r.region_id === "DC")).toBeUndefined();
    });

    it("filters to the active period", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2023",
            activeLayer: "all",
            annualData: annual,
        });
        const ca = rows.find((r) => r.region_id === "CA");
        expect(ca?.total_claims).toBe(200);
        // AL has nothing in 2023.
        expect(rows.find((r) => r.region_id === "AL")).toBeUndefined();
    });

    it("resolves region_name for states via the postal lookup", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2024",
            activeLayer: "all",
            annualData: annual,
        });
        expect(rows.find((r) => r.region_id === "CA")?.region_name).toBe("California");
        expect(rows.find((r) => r.region_id === "AL")?.region_name).toBe("Alabama");
    });

    it("sorts rows by region_id deterministically", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2024",
            activeLayer: "all",
            annualData: annual,
        });
        const ids = rows.map((r) => r.region_id);
        expect(ids).toEqual([...ids].sort());
    });
});

describe("buildCsvRows — monthly", () => {
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
    it("filters by year_month when monthlyData is supplied", () => {
        const rows = buildCsvRows({
            level: "state",
            period: "2024-06",
            activeLayer: "all",
            monthlyData: monthly,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].total_claims).toBe(12);
        expect(rows[0].year).toBe("2024-06");
    });
});

describe("csvFilename", () => {
    it("uses the documented pattern", () => {
        expect(csvFilename("all", "2024", "state")).toBe("medicaid-dental_all_2024_state.csv");
        expect(csvFilename("preventive", "2024-06", "zip3")).toBe(
            "medicaid-dental_preventive_2024-06_zip3.csv",
        );
    });
});
