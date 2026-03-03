import { create } from "zustand";
import type { LayerKey, ZCTADetail } from "./types";

interface MapState {
    activeLayer: LayerKey;
    setActiveLayer: (layer: LayerKey) => void;

    selectedZCTA: string | null;
    selectedDetail: ZCTADetail | null;
    setSelectedZCTA: (zcta: string | null, detail: ZCTADetail | null) => void;

    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;

    hoveredZCTA: string | null;
    hoveredValue: number | null;
    hoveredPoint: { x: number; y: number } | null;
    setHovered: (
        zcta: string | null,
        value: number | null,
        point: { x: number; y: number } | null,
    ) => void;

    hintVisible: boolean;
    dismissHint: () => void;
}

export const useMapStore = create<MapState>((set) => ({
    activeLayer: "all",
    setActiveLayer: (layer) => set({ activeLayer: layer }),

    selectedZCTA: null,
    selectedDetail: null,
    setSelectedZCTA: (zcta, detail) =>
        set({
            selectedZCTA: zcta,
            selectedDetail: detail,
            panelOpen: zcta !== null,
        }),

    panelOpen: false,
    setPanelOpen: (open) => set({ panelOpen: open }),

    hoveredZCTA: null,
    hoveredValue: null,
    hoveredPoint: null,
    setHovered: (zcta, value, point) =>
        set({ hoveredZCTA: zcta, hoveredValue: value, hoveredPoint: point }),

    hintVisible: true,
    dismissHint: () => set({ hintVisible: false }),
}));
