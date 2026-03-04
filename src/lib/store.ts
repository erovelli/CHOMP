import { create } from "zustand";
import type { LayerKey, RegionDetail } from "./types";
import { DEFAULT_YEAR } from "../constants/time";

interface MapState {
    activeLayer: LayerKey;
    setActiveLayer: (layer: LayerKey) => void;

    selectedYear: string;
    setSelectedYear: (year: string) => void;

    selectedMonth: string | null;
    setSelectedMonth: (month: string | null) => void;

    monthlyDataLoaded: boolean;
    setMonthlyDataLoaded: (loaded: boolean) => void;

    selectedRegion: string | null;
    selectedDetail: RegionDetail | null;
    setSelectedRegion: (id: string | null, detail: RegionDetail | null) => void;

    selectedState: string | null;
    setSelectedState: (state: string | null) => void;

    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;

    hoveredRegion: string | null;
    hoveredValue: number | null;
    hoveredPoint: { x: number; y: number } | null;
    setHovered: (
        region: string | null,
        value: number | null,
        point: { x: number; y: number } | null,
    ) => void;

    hintVisible: boolean;
    dismissHint: () => void;
}

export const useMapStore = create<MapState>((set) => ({
    activeLayer: "all",
    setActiveLayer: (layer) => set({ activeLayer: layer }),

    selectedYear: DEFAULT_YEAR,
    setSelectedYear: (year) => set({ selectedYear: year, selectedMonth: null }),

    selectedMonth: null,
    setSelectedMonth: (month) => set({ selectedMonth: month }),

    monthlyDataLoaded: false,
    setMonthlyDataLoaded: (loaded) => set({ monthlyDataLoaded: loaded }),

    selectedRegion: null,
    selectedDetail: null,
    setSelectedRegion: (id, detail) =>
        set({
            selectedRegion: id,
            selectedDetail: detail,
            panelOpen: id !== null,
        }),

    selectedState: null,
    setSelectedState: (state) => set({ selectedState: state }),

    panelOpen: false,
    setPanelOpen: (open) => set({ panelOpen: open }),

    hoveredRegion: null,
    hoveredValue: null,
    hoveredPoint: null,
    setHovered: (region, value, point) =>
        set({ hoveredRegion: region, hoveredValue: value, hoveredPoint: point }),

    hintVisible: true,
    dismissHint: () => set({ hintVisible: false }),
}));
