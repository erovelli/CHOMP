import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapStore, useMapFields } from "./store";

const initialState = useMapStore.getState();

beforeEach(() => {
    useMapStore.setState(initialState, true);
});

describe("useMapFields", () => {
    it("returns the named fields", () => {
        const { result } = renderHook(() => useMapFields("activeLayer", "metric"));
        expect(result.current).toEqual({ activeLayer: "all", metric: "claims" });
    });

    it("does not re-render when an unrelated field changes", () => {
        let renders = 0;
        renderHook(() => {
            renders++;
            return useMapFields("activeLayer", "metric");
        });
        const before = renders;

        act(() => useMapStore.getState().setHovered("KS", 12, { x: 1, y: 2 }));
        act(() => useMapStore.getState().setHovered(null, null, null));

        expect(renders).toBe(before);
    });

    it("re-renders when a picked field changes", () => {
        let renders = 0;
        const { result } = renderHook(() => {
            renders++;
            return useMapFields("activeLayer", "metric");
        });
        const before = renders;

        act(() => useMapStore.getState().setActiveLayer("preventive"));

        expect(renders).toBe(before + 1);
        expect(result.current.activeLayer).toBe("preventive");
    });
});

describe("setGeoLevel", () => {
    it("clears the region selection and closes the panel", () => {
        const { setSelectedRegion, setGeoLevel } = useMapStore.getState();
        setSelectedRegion("KS", { id: "KS", name: "Kansas", level: "state", records: [] });
        expect(useMapStore.getState().panelOpen).toBe(true);

        setGeoLevel("county");

        const state = useMapStore.getState();
        expect(state.geoLevel).toBe("county");
        expect(state.selectedRegion).toBeNull();
        expect(state.selectedDetail).toBeNull();
        expect(state.panelOpen).toBe(false);
    });
});
