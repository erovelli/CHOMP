import { describe, it, expect } from "vitest";
import { getValueForRegion } from "./dataService";
import type { DataRecord } from "./types";

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
