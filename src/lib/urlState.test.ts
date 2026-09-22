import { describe, it, expect } from "vitest";
import { parseUrlState, serializeUrlState } from "./urlState";

describe("parseUrlState", () => {
    it("returns an empty state for an empty query", () => {
        expect(parseUrlState("")).toEqual({});
    });

    it("parses valid layer / year / month", () => {
        expect(parseUrlState("?layer=preventive&year=2023&month=2023-06")).toEqual({
            layer: "preventive",
            year: "2023",
            month: "2023-06",
        });
    });

    it("ignores unknown layer values", () => {
        expect(parseUrlState("?layer=bogus")).toEqual({});
    });

    it("ignores years outside the known range", () => {
        expect(parseUrlState("?year=2099")).toEqual({});
    });

    it("ignores malformed months", () => {
        expect(parseUrlState("?month=06-2023")).toEqual({});
        expect(parseUrlState("?month=2023-13")).toEqual({});
        expect(parseUrlState("?month=not-a-date")).toEqual({});
    });

    it("accepts month without year", () => {
        expect(parseUrlState("?month=2023-06")).toEqual({ month: "2023-06" });
    });
});

describe("serializeUrlState", () => {
    it("returns an empty string when nothing is set", () => {
        expect(serializeUrlState({})).toBe("");
    });

    it("omits the default 'all' layer to keep URLs short", () => {
        expect(serializeUrlState({ layer: "all", year: "2024" })).toBe("?year=2024");
    });

    it("includes explicit non-default layer", () => {
        expect(serializeUrlState({ layer: "preventive", year: "2024" })).toBe(
            "?layer=preventive&year=2024",
        );
    });

    it("omits null / undefined month", () => {
        expect(serializeUrlState({ year: "2024", month: null })).toBe("?year=2024");
        expect(serializeUrlState({ year: "2024" })).toBe("?year=2024");
    });

    it("round-trips with parseUrlState", () => {
        const input = { layer: "restorative" as const, year: "2022", month: "2022-03" };
        expect(parseUrlState(serializeUrlState(input))).toEqual(input);
    });
});

describe("DQ overlay URL state", () => {
    it("parses a valid dq topic (overlay on)", () => {
        expect(parseUrlState("?dq=link-bene")).toEqual({ dq: "link-bene" });
    });

    it("still parses dq=off for backward-compat with older links", () => {
        expect(parseUrlState("?dq=off")).toEqual({ dq: "off" });
    });

    it("ignores unknown dq values", () => {
        expect(parseUrlState("?dq=bogus")).toEqual({});
    });

    it("serializes a topic (overlay on) — including the default topic", () => {
        // Overlay is hidden by default, so the default TOPIC still needs to
        // appear in the URL when the overlay is visible — otherwise a shared
        // link would silently drop back to hidden.
        expect(serializeUrlState({ dq: "claims-volume" })).toBe("?dq=claims-volume");
        expect(serializeUrlState({ dq: "link-bene" })).toBe("?dq=link-bene");
    });

    it("omits dq=off since hidden is the default", () => {
        expect(serializeUrlState({ dq: "off" })).toBe("");
    });

    it("round-trips a dq topic with other fields", () => {
        const input = { layer: "preventive" as const, year: "2023", dq: "link-bene" as const };
        expect(parseUrlState(serializeUrlState(input))).toEqual(input);
    });
});
