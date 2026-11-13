import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { DataRecord, GeoLevel } from "../../lib/types";
import { useMapStore } from "../../lib/store";
import SubsetExportPanel from "./SubsetExportPanel";

// Stand-in for dataService's module-level annual caches, so each test controls
// what is "loaded" and when.
const annual = vi.hoisted(() => ({
    data: { state: {}, county: {}, zip3: {} } as Record<GeoLevel, Record<string, DataRecord[]>>,
}));

vi.mock("../../lib/dataService", () => ({
    getAnnualDataForLevel: (level: GeoLevel) => annual.data[level],
    getMonthlyDataForLevel: () => ({}),
    getEnrollmentForLevel: () => ({}),
    getCountyNames: () => Promise.resolve({}),
    loadMonthlyData: () => Promise.resolve(),
}));

const LOADED: Record<GeoLevel, Record<string, DataRecord[]>> = {
    state: { AL: [], AK: [], WY: [] },
    county: {},
    zip3: { "021": [], "100": [] },
};

function downloadButton() {
    return screen.getByRole("button", { name: "Download CSV" });
}

// The Regions section's "Clear" is the last of the three (years, categories,
// regions).
function clearRegions() {
    const buttons = screen.getAllByRole("button", { name: "Clear" });
    fireEvent.click(buttons[buttons.length - 1]);
}

describe("SubsetExportPanel region selection", () => {
    beforeEach(() => {
        annual.data = LOADED;
        useMapStore.setState({ annualDataLoaded: true });
    });

    it("starts with every region of the level selected and the download enabled", () => {
        render(<SubsetExportPanel />);

        expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
        expect(downloadButton()).toBeEnabled();
        expect(screen.queryByText("Select at least one region.")).not.toBeInTheDocument();
    });

    it("resets to every region of the new level when the level changes", () => {
        render(<SubsetExportPanel />);

        clearRegions();
        expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
        expect(downloadButton()).toBeDisabled();

        fireEvent.click(screen.getByRole("button", { name: "ZIP3" }));
        expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
        expect(downloadButton()).toBeEnabled();

        fireEvent.click(screen.getByRole("button", { name: "State" }));
        expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
    });

    it("selects every region once the annual data arrives after mount", () => {
        annual.data = { state: {}, county: {}, zip3: {} };
        useMapStore.setState({ annualDataLoaded: false });
        render(<SubsetExportPanel />);

        expect(screen.getByText("0 of 0 selected")).toBeInTheDocument();
        expect(screen.getByText("Loading regions…")).toBeInTheDocument();
        expect(downloadButton()).toBeDisabled();

        act(() => {
            annual.data = LOADED;
            useMapStore.setState({ annualDataLoaded: true });
        });

        expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
        expect(screen.queryByText("Loading regions…")).not.toBeInTheDocument();
        expect(downloadButton()).toBeEnabled();
    });
});
