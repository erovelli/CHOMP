import { create } from "zustand";
import type { LayerKey, GeoLevel, Metric, RegionDetail, DqTopicKey, DqData } from "./types";
import { DEFAULT_YEAR } from "../constants/time";
import { DEFAULT_DQ_TOPIC } from "../constants/dq";

interface MapState {
    activeLayer: LayerKey;
    setActiveLayer: (layer: LayerKey) => void;

    geoLevel: GeoLevel;
    setGeoLevel: (level: GeoLevel) => void;

    metric: Metric;
    setMetric: (metric: Metric) => void;

    // Data-driven choropleth stops for the current slice (for the Legend).
    colorStops: number[];
    setColorStops: (stops: number[]) => void;

    selectedYear: string;
    setSelectedYear: (year: string) => void;

    selectedMonth: string | null;
    setSelectedMonth: (month: string | null) => void;

    monthlyDataLoaded: boolean;
    setMonthlyDataLoaded: (loaded: boolean) => void;

    selectedRegion: string | null;
    selectedDetail: RegionDetail | null;
    setSelectedRegion: (id: string | null, detail: RegionDetail | null) => void;

    panelOpen: boolean;

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

    // DQ Atlas overlay — ring-colored state borders keyed by CMS's per-topic
    // data-quality assessment. Data-quality ratings are state-only; when the
    // user drills into county/zip3 the rings persist as spatial context.
    dqTopic: DqTopicKey;
    setDqTopic: (topic: DqTopicKey) => void;
    dqOverlayVisible: boolean;
    setDqOverlayVisible: (visible: boolean) => void;
    dqData: DqData | null;
    setDqData: (data: DqData | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
    activeLayer: "all",
    setActiveLayer: (layer) => set({ activeLayer: layer }),

    geoLevel: "state",
    // Switching geography invalidates any open region selection (the selected
    // id won't exist at the new level), so close the detail panel too.
    setGeoLevel: (level) =>
        set({
            geoLevel: level,
            selectedRegion: null,
            selectedDetail: null,
            panelOpen: false,
        }),

    metric: "claims",
    setMetric: (metric) => set({ metric }),

    colorStops: [],
    setColorStops: (stops) => set({ colorStops: stops }),

    selectedYear: DEFAULT_YEAR,
    // Year and month are independently picked from the main menu; switching
    // year keeps the current month (e.g. Jun 2023 → Jun 2024).
    setSelectedYear: (year) => set({ selectedYear: year }),

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

    panelOpen: false,

    hoveredRegion: null,
    hoveredValue: null,
    hoveredPoint: null,
    setHovered: (region, value, point) =>
        set({ hoveredRegion: region, hoveredValue: value, hoveredPoint: point }),

    hintVisible: true,
    dismissHint: () => set({ hintVisible: false }),

    // Overlay defaults: OFF, seeded with the topic most directly analogous to
    // the map's subject (Claims Volume – OT) so first click gives an obvious
    // read. Convention from NYT/FT/OWID/CDC choropleths — primary encoding
    // stays clean and DQ annotations are opt-in from the sidebar; users who
    // care about provenance can turn it on, first-time viewers aren't asked
    // to decode a second visual layer before they've understood the first.
    // Data is null until loadDqAtlas resolves; MapContainer skips painting
    // rings until it arrives.
    dqTopic: DEFAULT_DQ_TOPIC,
    setDqTopic: (topic) => set({ dqTopic: topic }),
    dqOverlayVisible: false,
    setDqOverlayVisible: (visible) => set({ dqOverlayVisible: visible }),
    dqData: null,
    setDqData: (data) => set({ dqData: data }),
}));
