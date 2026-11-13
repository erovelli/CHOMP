import { describe, it, expect } from "vitest";
import { getValueForRegion, isMonthlyPeriod } from "./dataService";
import type { DataRecord, MonthlyDataRecord } from "./types";

const fixtures: DataRecord[] = [
    {
        year: "2023",
        category: "Preventive",
        total_beneficiaries_served: 100,
        total_claims: 500,
        total_amount_paid: 12_500,
    },
    {
        year: "2023",
        category: "Diagnostic",
        total_beneficiaries_served: 80,
        total_claims: 300,
        total_amount_paid: 7_500,
    },
    {
        year: "2022",
        category: "Preventive",
        total_beneficiaries_served: 90,
        total_claims: 400,
        total_amount_paid: 10_000,
    },
];

describe("getValueForRegion", () => {
    it("returns 0 when records is undefined", () => {
        expect(getValueForRegion(undefined, "2023", "all")).toBe(0);
    });

    it("sums total_claims across categories for 'all'", () => {
        expect(getValueForRegion(fixtures, "2023", "all")).toBe(800);
    });

    it("filters by year before summing", () => {
        expect(getValueForRegion(fixtures, "2022", "all")).toBe(400);
    });

    it("filters by category key for a specific layer", () => {
        expect(getValueForRegion(fixtures, "2023", "preventive")).toBe(500);
        expect(getValueForRegion(fixtures, "2023", "diagnostic")).toBe(300);
    });

    it("returns 0 when no records match the year", () => {
        expect(getValueForRegion(fixtures, "2099", "all")).toBe(0);
    });

    it("returns 0 when the category has no records in that year", () => {
        expect(getValueForRegion(fixtures, "2022", "diagnostic")).toBe(0);
    });
});

const monthlyFixtures: MonthlyDataRecord[] = [
    {
        year_month: "2023-06",
        category: "Preventive",
        total_beneficiaries_served: 10,
        total_claims: 40,
        total_amount_paid: 1_000,
    },
    {
        year_month: "2023-06",
        category: "Diagnostic",
        total_beneficiaries_served: 8,
        total_claims: 30,
        total_amount_paid: 750,
    },
    {
        year_month: "2023-07",
        category: "Preventive",
        total_beneficiaries_served: 9,
        total_claims: 20,
        total_amount_paid: 500,
    },
];

describe("getValueForRegion with monthly records", () => {
    it("matches on year_month", () => {
        expect(getValueForRegion(monthlyFixtures, "2023-06", "all")).toBe(70);
        expect(getValueForRegion(monthlyFixtures, "2023-07", "all")).toBe(20);
    });

    it("filters by category within the month", () => {
        expect(getValueForRegion(monthlyFixtures, "2023-06", "preventive")).toBe(40);
    });

    it("does not match a bare year against monthly rows", () => {
        expect(getValueForRegion(monthlyFixtures, "2023", "all")).toBe(0);
    });
});

describe("getValueForRegion per-enrollee metric", () => {
    it("divides claims by the enrollee denominator", () => {
        expect(getValueForRegion(fixtures, "2023", "all", "enrollees", 400)).toBe(2);
    });

    it("is NaN when the denominator is missing or non-positive", () => {
        expect(getValueForRegion(fixtures, "2023", "all", "enrollees", null)).toBeNaN();
        expect(getValueForRegion(fixtures, "2023", "all", "enrollees", 0)).toBeNaN();
    });
});

describe("isMonthlyPeriod", () => {
    it("distinguishes a year-month from a bare year", () => {
        expect(isMonthlyPeriod("2023-06")).toBe(true);
        expect(isMonthlyPeriod("2023")).toBe(false);
    });
});
