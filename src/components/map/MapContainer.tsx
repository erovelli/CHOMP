import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapStore } from "../../lib/store";
import { fetchProtomapsStyle, buildColorExpression, colorExpression } from "../../lib/mapStyles";
import type { LayerKey, DataRecord, MonthlyDataRecord, RegionDetail } from "../../lib/types";
import { CATEGORY_TO_KEY } from "../../lib/types";

const STATES_SOURCE = "states-source";
const STATES_FILL = "states-fill";
const STATES_STROKE = "states-stroke";
const STATES_LAYER = "states";

const ZIP3_SOURCE = "zip3-source";
const ZIP3_FILL = "zip3-fill";
const ZIP3_STROKE = "zip3-stroke";
const ZIP3_LAYER = "zip3codes";

// Module-level caches
let stateDataCache: Record<string, DataRecord[]> = {};
let zip3DataCache: Record<string, DataRecord[]> = {};
let stateMonthlyCache: Record<string, MonthlyDataRecord[]> = {};
let zip3MonthlyCache: Record<string, MonthlyDataRecord[]> = {};

/** Parse NDJSON: one JSON object per line, each object is { key: records[] } */
async function fetchNDJSON<T>(url: string): Promise<Record<string, T[]>> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const result: Record<string, T[]> = {};
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const obj = JSON.parse(trimmed) as Record<string, T[]>;
        for (const [key, records] of Object.entries(obj)) {
            if (key === "") continue; // skip empty key
            result[key] = records;
        }
    }
    return result;
}

/** Lazy-load monthly data files into caches */
export async function loadMonthlyData(): Promise<void> {
    if (Object.keys(stateMonthlyCache).length > 0) return; // already loaded
    const BASE = import.meta.env.BASE_URL;
    const [stateData, zip3Data] = await Promise.all([
        fetchNDJSON<MonthlyDataRecord>(`${BASE}data/provider_procedure_category_aggregate_monthly_state.json`),
        fetchNDJSON<MonthlyDataRecord>(`${BASE}data/provider_procedure_category_aggregate_monthly_zip3.json`),
    ]);
    stateMonthlyCache = stateData;
    zip3MonthlyCache = zip3Data;
    console.log(`Loaded monthly data: ${Object.keys(stateData).length} states, ${Object.keys(zip3Data).length} zip3`);
}

/** Get monthly records for a region from cache */
export function getMonthlyRecords(id: string, level: "state" | "zip3"): MonthlyDataRecord[] {
    const cache = level === "state" ? stateMonthlyCache : zip3MonthlyCache;
    return cache[id] ?? [];
}

/** Get total_claims for a region, filtered by year and category */
function getValueForRegion(
    records: DataRecord[] | undefined,
    year: string,
    activeLayer: LayerKey,
): number {
    if (!records) return 0;
    const yearRecords = records.filter((r) => r.year === year);
    if (activeLayer === "all") {
        return yearRecords.reduce((sum, r) => sum + r.total_claims, 0);
    }
    return yearRecords
        .filter((r) => CATEGORY_TO_KEY[r.category] === activeLayer)
        .reduce((sum, r) => sum + r.total_claims, 0);
}

function paintFeatureStates(
    map: maplibregl.Map,
    source: string,
    sourceLayer: string,
    dataCache: Record<string, DataRecord[]>,
    year: string,
    activeLayer: LayerKey,
) {
    for (const [id, records] of Object.entries(dataCache)) {
        const value = getValueForRegion(records, year, activeLayer);
        map.setFeatureState(
            { source, sourceLayer, id },
            { value },
        );
    }
}

export default function MapContainer() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const hoveredStateRef = useRef<string | null>(null);
    const hoveredZip3Ref = useRef<string | null>(null);
    const selectedStateRef = useRef<string | null>(null);
    const selectedZip3Ref = useRef<string | null>(null);

    const {
        activeLayer,
        selectedYear,
        selectedRegion,
        setSelectedRegion,
        setSelectedState,
        setHovered,
        dismissHint,
    } = useMapStore();
    const activeLayerRef = useRef<LayerKey>(activeLayer);
    const selectedYearRef = useRef<string>(selectedYear);

    // Repaint when layer or year switches
    useEffect(() => {
        activeLayerRef.current = activeLayer;
        selectedYearRef.current = selectedYear;
        if (!map.current || !map.current.isStyleLoaded()) return;

        paintFeatureStates(map.current, STATES_SOURCE, STATES_LAYER, stateDataCache, selectedYear, activeLayer);
        paintFeatureStates(map.current, ZIP3_SOURCE, ZIP3_LAYER, zip3DataCache, selectedYear, activeLayer);
    }, [activeLayer, selectedYear]);

    // Reset paint when panel is closed
    useEffect(() => {
        if (selectedRegion !== null) return;
        if (!map.current) return;

        if (selectedStateRef.current) {
            map.current.setFeatureState(
                { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: selectedStateRef.current },
                { selected: false },
            );
            selectedStateRef.current = null;
        }
        if (selectedZip3Ref.current) {
            map.current.setFeatureState(
                { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: selectedZip3Ref.current },
                { selected: false },
            );
            selectedZip3Ref.current = null;
        }

        map.current.setPaintProperty(STATES_FILL, "fill-color", colorExpression);
        map.current.setPaintProperty(ZIP3_FILL, "fill-color", colorExpression);
    }, [selectedRegion]);

    const handleStateClick = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features?.length || !map.current) return;
            const postal = e.features[0].properties?.postal as string;
            const name = e.features[0].properties?.name as string;
            if (!postal) return;

            // Clear previous selection
            if (selectedStateRef.current) {
                map.current.setFeatureState(
                    { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: selectedStateRef.current },
                    { selected: false },
                );
            }
            if (selectedZip3Ref.current) {
                map.current.setFeatureState(
                    { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: selectedZip3Ref.current },
                    { selected: false },
                );
                selectedZip3Ref.current = null;
            }

            selectedStateRef.current = postal;
            map.current.setFeatureState(
                { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: postal },
                { selected: true },
            );

            map.current.setPaintProperty(
                STATES_FILL, "fill-color",
                buildColorExpression(hoveredStateRef.current, postal, "postal"),
            );

            const records = stateDataCache[postal] ?? [];
            const detail: RegionDetail = { id: postal, name: name || postal, level: "state", records };
            setSelectedRegion(postal, detail);
            setSelectedState(postal);
            dismissHint();
        },
        [setSelectedRegion, setSelectedState, dismissHint],
    );

    const handleZip3Click = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features?.length || !map.current) return;
            const zip3 = e.features[0].properties?.["3dig_zip"] as string;
            if (!zip3) return;

            // Clear previous zip3 selection
            if (selectedZip3Ref.current) {
                map.current.setFeatureState(
                    { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: selectedZip3Ref.current },
                    { selected: false },
                );
            }

            selectedZip3Ref.current = zip3;
            map.current.setFeatureState(
                { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: zip3 },
                { selected: true },
            );

            map.current.setPaintProperty(
                ZIP3_FILL, "fill-color",
                buildColorExpression(hoveredZip3Ref.current, zip3, "3dig_zip"),
            );

            const records = zip3DataCache[zip3] ?? [];
            const detail: RegionDetail = { id: zip3, name: `ZIP3 ${zip3}`, level: "zip3", records };
            setSelectedRegion(zip3, detail);
            dismissHint();
        },
        [setSelectedRegion, dismissHint],
    );

    const handleStateMouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const postal = e.features[0].properties?.postal as string;
            if (!postal) return;

            if (hoveredStateRef.current && hoveredStateRef.current !== postal) {
                map.current.setFeatureState(
                    { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: hoveredStateRef.current },
                    { hover: false },
                );
            }

            hoveredStateRef.current = postal;
            map.current.setFeatureState(
                { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: postal },
                { hover: true },
            );

            map.current.setPaintProperty(
                STATES_FILL, "fill-color",
                buildColorExpression(postal, selectedStateRef.current, "postal"),
            );

            const val = getValueForRegion(stateDataCache[postal], selectedYearRef.current, activeLayerRef.current);
            setHovered(postal, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered],
    );

    const handleZip3MouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const zip3 = e.features[0].properties?.["3dig_zip"] as string;
            if (!zip3) return;

            if (hoveredZip3Ref.current && hoveredZip3Ref.current !== zip3) {
                map.current.setFeatureState(
                    { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: hoveredZip3Ref.current },
                    { hover: false },
                );
            }

            hoveredZip3Ref.current = zip3;
            map.current.setFeatureState(
                { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: zip3 },
                { hover: true },
            );

            map.current.setPaintProperty(
                ZIP3_FILL, "fill-color",
                buildColorExpression(zip3, selectedZip3Ref.current, "3dig_zip"),
            );

            const val = getValueForRegion(zip3DataCache[zip3], selectedYearRef.current, activeLayerRef.current);
            setHovered(`ZIP3 ${zip3}`, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered],
    );

    const handleStateMouseLeave = useCallback(() => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";

        if (hoveredStateRef.current) {
            map.current.setFeatureState(
                { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: hoveredStateRef.current },
                { hover: false },
            );
        }
        hoveredStateRef.current = null;
        setHovered(null, null, null);
        map.current.setPaintProperty(
            STATES_FILL, "fill-color",
            buildColorExpression(null, selectedStateRef.current, "postal"),
        );
    }, [setHovered]);

    const handleZip3MouseLeave = useCallback(() => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";

        if (hoveredZip3Ref.current) {
            map.current.setFeatureState(
                { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: hoveredZip3Ref.current },
                { hover: false },
            );
        }
        hoveredZip3Ref.current = null;
        setHovered(null, null, null);
        map.current.setPaintProperty(
            ZIP3_FILL, "fill-color",
            buildColorExpression(null, selectedZip3Ref.current, "3dig_zip"),
        );
    }, [setHovered]);

    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        const protocol = new Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);

        const initMap = async () => {
            const apiKey = import.meta.env.VITE_PROTOMAPS_API_KEY;

            let style;
            if (apiKey) {
                style = await fetchProtomapsStyle(apiKey);
            } else {
                style = {
                    version: 8,
                    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
                    sources: {},
                    layers: [
                        {
                            id: "background",
                            type: "background",
                            paint: { "background-color": "#f0ede8" },
                        },
                    ],
                };
            }

            if (!mapContainer.current) return;

            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style,
                center: [-98.5, 39.8],
                zoom: 4,
                minZoom: 2,
                maxZoom: 14,
                attributionControl: false,
            });

            map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
            map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

            map.current.on("load", async () => {
                if (!map.current) return;

                const BASE = import.meta.env.BASE_URL;

                // States source + layers
                if (!map.current.getSource(STATES_SOURCE)) {
                    map.current.addSource(STATES_SOURCE, {
                        type: "vector",
                        url: `pmtiles://${BASE}states.pmtiles`,
                        promoteId: { [STATES_LAYER]: "postal" },
                    });
                }

                if (!map.current.getLayer(STATES_FILL)) {
                    map.current.addLayer({
                        id: STATES_FILL,
                        type: "fill",
                        source: STATES_SOURCE,
                        "source-layer": STATES_LAYER,
                        paint: {
                            "fill-color": colorExpression as maplibregl.ExpressionSpecification,
                            "fill-opacity": [
                                "case",
                                ["boolean", ["feature-state", "selected"], false],
                                1.0,
                                ["boolean", ["feature-state", "hover"], false],
                                0.95,
                                0.82,
                            ],
                        },
                    });
                }

                if (!map.current.getLayer(STATES_STROKE)) {
                    map.current.addLayer({
                        id: STATES_STROKE,
                        type: "line",
                        source: STATES_SOURCE,
                        "source-layer": STATES_LAYER,
                        paint: {
                            "line-color": [
                                "case",
                                ["boolean", ["feature-state", "selected"], false],
                                "#1a1917",
                                ["boolean", ["feature-state", "hover"], false],
                                "#1a1917",
                                "#6b7f7d",
                            ],
                            "line-width": [
                                "case",
                                ["boolean", ["feature-state", "selected"], false],
                                2,
                                ["boolean", ["feature-state", "hover"], false],
                                1.5,
                                0.8,
                            ],
                            "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.6],
                        },
                    });
                }

                // Zip3 source + layers
                if (!map.current.getSource(ZIP3_SOURCE)) {
                    map.current.addSource(ZIP3_SOURCE, {
                        type: "vector",
                        url: `pmtiles://${BASE}zip3.pmtiles`,
                        promoteId: { [ZIP3_LAYER]: "3dig_zip" },
                    });
                }

                if (!map.current.getLayer(ZIP3_FILL)) {
                    map.current.addLayer({
                        id: ZIP3_FILL,
                        type: "fill",
                        source: ZIP3_SOURCE,
                        "source-layer": ZIP3_LAYER,
                        paint: {
                            "fill-color": colorExpression as maplibregl.ExpressionSpecification,
                            "fill-opacity": [
                                "case",
                                ["boolean", ["feature-state", "selected"], false],
                                1.0,
                                ["boolean", ["feature-state", "hover"], false],
                                0.9,
                                0.5,
                            ],
                        },
                    });
                }

                if (!map.current.getLayer(ZIP3_STROKE)) {
                    map.current.addLayer({
                        id: ZIP3_STROKE,
                        type: "line",
                        source: ZIP3_SOURCE,
                        "source-layer": ZIP3_LAYER,
                        paint: {
                            "line-color": [
                                "case",
                                ["boolean", ["feature-state", "selected"], false],
                                "#1a1917",
                                ["boolean", ["feature-state", "hover"], false],
                                "#1a1917",
                                "#9a948d",
                            ],
                            "line-width": [
                                "case",
                                ["boolean", ["feature-state", "selected"], false],
                                2,
                                ["boolean", ["feature-state", "hover"], false],
                                1.2,
                                0.3,
                            ],
                            "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.4],
                        },
                    });
                }

                // Event handlers — states
                map.current.on("click", STATES_FILL, handleStateClick);
                map.current.on("mousemove", STATES_FILL, handleStateMouseMove);
                map.current.on("mouseleave", STATES_FILL, handleStateMouseLeave);

                // Event handlers — zip3
                map.current.on("click", ZIP3_FILL, handleZip3Click);
                map.current.on("mousemove", ZIP3_FILL, handleZip3MouseMove);
                map.current.on("mouseleave", ZIP3_FILL, handleZip3MouseLeave);

                // Load data
                await loadAndPaint(map.current, activeLayerRef.current, selectedYearRef.current);
            });
        };

        initMap();

        return () => {
            maplibregl.removeProtocol("pmtiles");
            map.current?.remove();
            map.current = null;
        };
    }, [
        handleStateClick, handleStateMouseMove, handleStateMouseLeave,
        handleZip3Click, handleZip3MouseMove, handleZip3MouseLeave,
    ]);

    return (
        <div
            ref={mapContainer}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
            }}
        />
    );
}

async function loadAndPaint(map: maplibregl.Map, activeLayer: LayerKey, selectedYear: string) {
    try {
        const BASE = import.meta.env.BASE_URL;
        const [stateData, zip3Data] = await Promise.all([
            fetchNDJSON<DataRecord>(`${BASE}data/provider_procedure_category_aggregate_annual_state.json`),
            fetchNDJSON<DataRecord>(`${BASE}data/provider_procedure_category_aggregate_annual_zip3.json`),
        ]);

        stateDataCache = stateData;
        zip3DataCache = zip3Data;

        paintFeatureStates(map, STATES_SOURCE, STATES_LAYER, stateDataCache, selectedYear, activeLayer);
        paintFeatureStates(map, ZIP3_SOURCE, ZIP3_LAYER, zip3DataCache, selectedYear, activeLayer);

        console.log(`Painted ${Object.keys(stateData).length} states, ${Object.keys(zip3Data).length} zip3 regions`);
    } catch (err) {
        console.error("Failed to load data:", err);
    }
}
