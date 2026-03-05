import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapStore } from "../../lib/store";
import { fetchProtomapsStyle, buildColorExpression, colorExpression } from "../../lib/mapStyles";
import type { LayerKey, RegionDetail } from "../../lib/types";
import {
    loadAnnualData,
    getStateAnnualData,
    getZip3AnnualData,
    getValueForRegion,
} from "../../lib/dataService";
import {
    MAP_CENTER, MAP_ZOOM, MAP_MIN_ZOOM, MAP_MAX_ZOOM,
    STATES_SOURCE, STATES_FILL, STATES_STROKE, STATES_LAYER, STATES_ID_PROP,
    ZIP3_SOURCE, ZIP3_FILL, ZIP3_STROKE, ZIP3_LAYER, ZIP3_ID_PROP,
    FALLBACK_BG_COLOR,
    STROKE_COLOR_ACTIVE, STROKE_COLOR_DEFAULT_STATES, STROKE_COLOR_DEFAULT_ZIP3,
    STATES_FILL_OPACITY, ZIP3_FILL_OPACITY,
    STATES_LINE_WIDTH, ZIP3_LINE_WIDTH,
    STATES_LINE_OPACITY, ZIP3_LINE_OPACITY,
} from "../../constants/map";

// ── Layer helpers ────────────────────────────────────────────

function addStatesLayers(map: maplibregl.Map) {
    const BASE = import.meta.env.BASE_URL;

    if (!map.getSource(STATES_SOURCE)) {
        map.addSource(STATES_SOURCE, {
            type: "vector",
            url: `pmtiles://${BASE}states.pmtiles`,
            promoteId: { [STATES_LAYER]: STATES_ID_PROP },
        });
    }

    if (!map.getLayer(STATES_FILL)) {
        map.addLayer({
            id: STATES_FILL,
            type: "fill",
            source: STATES_SOURCE,
            "source-layer": STATES_LAYER,
            paint: {
                "fill-color": colorExpression as maplibregl.ExpressionSpecification,
                "fill-opacity": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    STATES_FILL_OPACITY.selected,
                    ["boolean", ["feature-state", "hover"], false],
                    STATES_FILL_OPACITY.hover,
                    STATES_FILL_OPACITY.default,
                ],
            },
        });
    }

    if (!map.getLayer(STATES_STROKE)) {
        map.addLayer({
            id: STATES_STROKE,
            type: "line",
            source: STATES_SOURCE,
            "source-layer": STATES_LAYER,
            paint: {
                "line-color": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false], STROKE_COLOR_ACTIVE,
                    ["boolean", ["feature-state", "hover"], false], STROKE_COLOR_ACTIVE,
                    STROKE_COLOR_DEFAULT_STATES,
                ],
                "line-width": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false], STATES_LINE_WIDTH.selected,
                    ["boolean", ["feature-state", "hover"], false], STATES_LINE_WIDTH.hover,
                    STATES_LINE_WIDTH.default,
                ],
                "line-opacity": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    STATES_LINE_OPACITY.selected,
                    STATES_LINE_OPACITY.default,
                ],
            },
        });
    }
}

function addZip3Layers(map: maplibregl.Map) {
    const BASE = import.meta.env.BASE_URL;

    if (!map.getSource(ZIP3_SOURCE)) {
        map.addSource(ZIP3_SOURCE, {
            type: "vector",
            url: `pmtiles://${BASE}zip3.pmtiles`,
            promoteId: { [ZIP3_LAYER]: ZIP3_ID_PROP },
        });
    }

    if (!map.getLayer(ZIP3_FILL)) {
        map.addLayer({
            id: ZIP3_FILL,
            type: "fill",
            source: ZIP3_SOURCE,
            "source-layer": ZIP3_LAYER,
            paint: {
                "fill-color": colorExpression as maplibregl.ExpressionSpecification,
                "fill-opacity": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    ZIP3_FILL_OPACITY.selected,
                    ["boolean", ["feature-state", "hover"], false],
                    ZIP3_FILL_OPACITY.hover,
                    ZIP3_FILL_OPACITY.default,
                ],
            },
        });
    }

    if (!map.getLayer(ZIP3_STROKE)) {
        map.addLayer({
            id: ZIP3_STROKE,
            type: "line",
            source: ZIP3_SOURCE,
            "source-layer": ZIP3_LAYER,
            paint: {
                "line-color": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false], STROKE_COLOR_ACTIVE,
                    ["boolean", ["feature-state", "hover"], false], STROKE_COLOR_ACTIVE,
                    STROKE_COLOR_DEFAULT_ZIP3,
                ],
                "line-width": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false], ZIP3_LINE_WIDTH.selected,
                    ["boolean", ["feature-state", "hover"], false], ZIP3_LINE_WIDTH.hover,
                    ZIP3_LINE_WIDTH.default,
                ],
                "line-opacity": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    ZIP3_LINE_OPACITY.selected,
                    ZIP3_LINE_OPACITY.default,
                ],
            },
        });
    }
}

// ── Paint feature states from data caches ────────────────────

function paintAllFeatureStates(
    map: maplibregl.Map,
    year: string,
    activeLayer: LayerKey,
) {
    const stateData = getStateAnnualData();
    const zip3Data = getZip3AnnualData();

    for (const [id, records] of Object.entries(stateData)) {
        map.setFeatureState(
            { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id },
            { value: getValueForRegion(records, year, activeLayer) },
        );
    }
    for (const [id, records] of Object.entries(zip3Data)) {
        map.setFeatureState(
            { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id },
            { value: getValueForRegion(records, year, activeLayer) },
        );
    }
}

// ── Component ────────────────────────────────────────────────

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
        paintAllFeatureStates(map.current, selectedYear, activeLayer);
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

    // ── Click handlers ───────────────────────────────────────

    const handleStateClick = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features?.length || !map.current) return;
            const postal = e.features[0].properties?.[STATES_ID_PROP] as string;
            const name = e.features[0].properties?.name as string;
            if (!postal) return;

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
                buildColorExpression(hoveredStateRef.current, postal, STATES_ID_PROP),
            );

            const records = getStateAnnualData()[postal] ?? [];
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
            const zip3 = e.features[0].properties?.[ZIP3_ID_PROP] as string;
            if (!zip3) return;

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
                buildColorExpression(hoveredZip3Ref.current, zip3, ZIP3_ID_PROP),
            );

            const records = getZip3AnnualData()[zip3] ?? [];
            const detail: RegionDetail = { id: zip3, name: `ZIP3 ${zip3}`, level: "zip3", records };
            setSelectedRegion(zip3, detail);
            dismissHint();
        },
        [setSelectedRegion, dismissHint],
    );

    // ── Hover handlers ───────────────────────────────────────

    const handleStateMouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const postal = e.features[0].properties?.[STATES_ID_PROP] as string;
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
                buildColorExpression(postal, selectedStateRef.current, STATES_ID_PROP),
            );

            const val = getValueForRegion(
                getStateAnnualData()[postal],
                selectedYearRef.current,
                activeLayerRef.current,
            );
            setHovered(postal, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered],
    );

    const handleZip3MouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const zip3 = e.features[0].properties?.[ZIP3_ID_PROP] as string;
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
                buildColorExpression(zip3, selectedZip3Ref.current, ZIP3_ID_PROP),
            );

            const val = getValueForRegion(
                getZip3AnnualData()[zip3],
                selectedYearRef.current,
                activeLayerRef.current,
            );
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
            buildColorExpression(null, selectedStateRef.current, STATES_ID_PROP),
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
            buildColorExpression(null, selectedZip3Ref.current, ZIP3_ID_PROP),
        );
    }, [setHovered]);

    // ── Map initialization ───────────────────────────────────

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
                            paint: { "background-color": FALLBACK_BG_COLOR },
                        },
                    ],
                };
            }

            if (!mapContainer.current) return;

            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style,
                center: MAP_CENTER,
                zoom: MAP_ZOOM,
                minZoom: MAP_MIN_ZOOM,
                maxZoom: MAP_MAX_ZOOM,
                attributionControl: false,
            });

            map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
            map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

            map.current.on("load", async () => {
                if (!map.current) return;

                addStatesLayers(map.current);
                addZip3Layers(map.current);

                map.current.on("click", STATES_FILL, handleStateClick);
                map.current.on("mousemove", STATES_FILL, handleStateMouseMove);
                map.current.on("mouseleave", STATES_FILL, handleStateMouseLeave);

                map.current.on("click", ZIP3_FILL, handleZip3Click);
                map.current.on("mousemove", ZIP3_FILL, handleZip3MouseMove);
                map.current.on("mouseleave", ZIP3_FILL, handleZip3MouseLeave);

                await loadAnnualData();
                paintAllFeatureStates(map.current, selectedYearRef.current, activeLayerRef.current);
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
