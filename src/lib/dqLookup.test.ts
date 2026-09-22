import { describe, it, expect } from "vitest";
import { getDqRecord, dqHasYear } from "./dataService";
import type { DqData } from "./types";

const fixture: DqData = {
    topics: {
        "link-bene": {
            label: "Linking Claims to Beneficiaries",
            description: "",
            metric_label: "% not linking",
            years: {
                "2023": {
                    CA: { assessment: "Low concern", pct: 0.8 },
                    NY: { assessment: "High concern", pct: 12.4 },
                },
            },
        },
        "link-providers": {
            label: "Linking Claims to Providers",
            description: "",
            metric_label: "% linked",
            years: {},
        },
    } as unknown as DqData["topics"],
    assessments: ["Low concern", "Medium concern", "High concern", "Unusable", "Unclassified"],
};

describe("getDqRecord", () => {
    it("returns the record for a known (topic, year, state)", () => {
        expect(getDqRecord(fixture, "link-bene", "2023", "CA")).toEqual({
            assessment: "Low concern",
            pct: 0.8,
        });
    });

    it("returns undefined for a state absent from the year bucket", () => {
        expect(getDqRecord(fixture, "link-bene", "2023", "TX")).toBeUndefined();
    });

    it("returns undefined for a year the topic doesn't cover", () => {
        expect(getDqRecord(fixture, "link-bene", "2019", "CA")).toBeUndefined();
    });

    it("returns undefined when the atlas hasn't loaded yet", () => {
        expect(getDqRecord(null, "link-bene", "2023", "CA")).toBeUndefined();
    });
});

describe("dqHasYear", () => {
    it("true when the year bucket has at least one state", () => {
        expect(dqHasYear(fixture, "link-bene", "2023")).toBe(true);
    });

    it("false for a year the topic doesn't cover", () => {
        expect(dqHasYear(fixture, "link-bene", "2018")).toBe(false);
    });

    it("false when the topic has an empty years map", () => {
        expect(dqHasYear(fixture, "link-providers", "2023")).toBe(false);
    });

    it("false when the atlas hasn't loaded yet", () => {
        expect(dqHasYear(null, "link-bene", "2023")).toBe(false);
    });
});
