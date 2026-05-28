import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapStore } from "../../lib/store";
import { fetchProtomapsStyle, buildColorExpression, colorExpression, quantileStops } from "../../lib/mapStyles";
import type { LayerKey, GeoLevel, Metric, RegionDetail } from "../../lib/types";
import {
    loadAnnualData,
    getStateAnnualData,
    getCountyAnnualData,
    getZip3AnnualData,
    getAnnualDataForLevel,
    getValueForRegion,
} from "../../lib/dataService";
import {
    MAP_CENTER,
    MAP_ZOOM,
    MAP_MIN_ZOOM,
    MAP_MAX_ZOOM,
    STATES_SOURCE,
    STATES_FILL,
    STATES_STROKE,
    STATES_LAYER,
    STATES_ID_PROP,
    ZIP3_SOURCE,
    ZIP3_FILL,
    ZIP3_STROKE,
    ZIP3_LAYER,
    ZIP3_ID_PROP,
    COUNTY_SOURCE,
    COUNTY_FILL,
    COUNTY_STROKE,
    COUNTY_ID_PROP,
    COUNTY_GEOJSON,
    FALLBACK_BG_COLOR,
    STROKE_COLOR_ACTIVE,
    STROKE_COLOR_DEFAULT_STATES,
    STROKE_COLOR_DEFAULT_ZIP3,
    STROKE_COLOR_DEFAULT_COUNTY,
    STATES_FILL_OPACITY,
    ZIP3_FILL_OPACITY,
    COUNTY_FILL_OPACITY,
    STATES_LINE_WIDTH,
    ZIP3_LINE_WIDTH,
    COUNTY_LINE_WIDTH,
    STATES_LINE_OPACITY,
    ZIP3_LINE_OPACITY,
    COUNTY_LINE_OPACITY,
} from "../../constants/map";

// Per-level lookups for the dynamic-color logic.
const LEVEL_FILL: Record<GeoLevel, string> = {
    state: STATES_FILL,
    county: COUNTY_FILL,
    zip3: ZIP3_FILL,
};
const LEVEL_ID_PROP: Record<GeoLevel, string> = {
    state: STATES_ID_PROP,
    county: COUNTY_ID_PROP,
    zip3: ZIP3_ID_PROP,
};

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
                    ["boolean", ["feature-state", "selected"], false],
                    STROKE_COLOR_ACTIVE,
                    ["boolean", ["feature-state", "hover"], false],
                    STROKE_COLOR_ACTIVE,
                    STROKE_COLOR_DEFAULT_STATES,
                ],
                "line-width": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    STATES_LINE_WIDTH.selected,
                    ["boolean", ["feature-state", "hover"], false],
                    STATES_LINE_WIDTH.hover,
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

function addCountyLayers(map: maplibregl.Map) {
    const BASE = import.meta.env.BASE_URL;

    if (!map.getSource(COUNTY_SOURCE)) {
        map.addSource(COUNTY_SOURCE, {
            type: "geojson",
            data: `${BASE}${COUNTY_GEOJSON}`,
            promoteId: COUNTY_ID_PROP,
        });
    }

    if (!map.getLayer(COUNTY_FILL)) {
        map.addLayer({
            id: COUNTY_FILL,
            type: "fill",
            source: COUNTY_SOURCE,
            layout: { visibility: "none" },
            paint: {
                "fill-color": colorExpression as maplibregl.ExpressionSpecification,
                "fill-opacity": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    COUNTY_FILL_OPACITY.selected,
                    ["boolean", ["feature-state", "hover"], false],
                    COUNTY_FILL_OPACITY.hover,
                    COUNTY_FILL_OPACITY.default,
                ],
            },
        });
    }

    if (!map.getLayer(COUNTY_STROKE)) {
        map.addLayer({
            id: COUNTY_STROKE,
            type: "line",
            source: COUNTY_SOURCE,
            layout: { visibility: "none" },
            paint: {
                "line-color": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    STROKE_COLOR_ACTIVE,
                    ["boolean", ["feature-state", "hover"], false],
                    STROKE_COLOR_ACTIVE,
                    STROKE_COLOR_DEFAULT_COUNTY,
                ],
                "line-width": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    COUNTY_LINE_WIDTH.selected,
                    ["boolean", ["feature-state", "hover"], false],
                    COUNTY_LINE_WIDTH.hover,
                    COUNTY_LINE_WIDTH.default,
                ],
                "line-opacity": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    COUNTY_LINE_OPACITY.selected,
                    COUNTY_LINE_OPACITY.default,
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
            layout: { visibility: "none" },
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
            layout: { visibility: "none" },
            paint: {
                "line-color": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    STROKE_COLOR_ACTIVE,
                    ["boolean", ["feature-state", "hover"], false],
                    STROKE_COLOR_ACTIVE,
                    STROKE_COLOR_DEFAULT_ZIP3,
                ],
                "line-width": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    ZIP3_LINE_WIDTH.selected,
                    ["boolean", ["feature-state", "hover"], false],
                    ZIP3_LINE_WIDTH.hover,
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

// Toggle which geography level's fill+stroke layers are visible.
function setActiveGeoLayer(map: maplibregl.Map, level: GeoLevel) {
    const vis: Record<GeoLevel, [string, string]> = {
        state: [STATES_FILL, STATES_STROKE],
        county: [COUNTY_FILL, COUNTY_STROKE],
        zip3: [ZIP3_FILL, ZIP3_STROKE],
    };
    for (const [lvl, [fill, stroke]] of Object.entries(vis) as [GeoLevel, [string, string]][]) {
        const visibility = lvl === level ? "visible" : "none";
        if (map.getLayer(fill)) map.setLayoutProperty(fill, "visibility", visibility);
        if (map.getLayer(stroke)) map.setLayoutProperty(stroke, "visibility", visibility);
    }
}

// ── Paint per-region values into feature-state (all three levels) ────

function paintValues(map: maplibregl.Map, year: string, activeLayer: LayerKey, metric: Metric) {
    for (const [id, records] of Object.entries(getStateAnnualData())) {
        map.setFeatureState(
            { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id },
            { value: getValueForRegion(records, year, activeLayer, metric) },
        );
    }
    for (const [id, records] of Object.entries(getCountyAnnualData())) {
        map.setFeatureState(
            { source: COUNTY_SOURCE, id },
            { value: getValueForRegion(records, year, activeLayer, metric) },
        );
    }
    for (const [id, records] of Object.entries(getZip3AnnualData())) {
        map.setFeatureState(
            { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id },
            { value: getValueForRegion(records, year, activeLayer, metric) },
        );
    }
}

// ── Component ────────────────────────────────────────────────

export default function MapContainer() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const hoveredStateRef = useRef<string | null>(null);
    const hoveredCountyRef = useRef<string | null>(null);
    const hoveredZip3Ref = useRef<string | null>(null);
    const selectedStateRef = useRef<string | null>(null);
    const selectedCountyRef = useRef<string | null>(null);
    const selectedZip3Ref = useRef<string | null>(null);

    const {
        activeLayer,
        selectedYear,
        selectedRegion,
        geoLevel,
        metric,
        setSelectedRegion,
        setSelectedState,
        setHovered,
        setColorStops,
        dismissHint,
    } = useMapStore();
    const activeLayerRef = useRef<LayerKey>(activeLayer);
    const selectedYearRef = useRef<string>(selectedYear);
    const metricRef = useRef<Metric>(metric);
    const geoLevelRef = useRef<GeoLevel>(geoLevel);
    // Current data-driven color stops, shared with hover/select handlers.
    const stopsRef = useRef<number[]>([]);

    const hoveredRefFor = (lvl: GeoLevel) =>
        lvl === "state" ? hoveredStateRef : lvl === "county" ? hoveredCountyRef : hoveredZip3Ref;
    const selectedRefFor = (lvl: GeoLevel) =>
        lvl === "state" ? selectedStateRef : lvl === "county" ? selectedCountyRef : selectedZip3Ref;

    // Recompute the dynamic color scale for the *active* level from the slice
    // currently on screen (year × category × metric), and re-apply the active
    // layer's fill-color preserving any hover/selected highlight.
    const applyActiveColors = useCallback(() => {
        if (!map.current) return;
        const level = geoLevelRef.current;
        const data = getAnnualDataForLevel(level);
        const values = Object.values(data).map((recs) =>
            getValueForRegion(recs, selectedYearRef.current, activeLayerRef.current, metricRef.current),
        );
        const stops = quantileStops(values, metricRef.current);
        stopsRef.current = stops;
        setColorStops(stops);
        map.current.setPaintProperty(
            LEVEL_FILL[level],
            "fill-color",
            buildColorExpression(
                hoveredRefFor(level).current,
                selectedRefFor(level).current,
                LEVEL_ID_PROP[level],
                stops,
            ),
        );
    }, [setColorStops]);

    // Repaint values + rescale when category, year, or metric changes.
    useEffect(() => {
        activeLayerRef.current = activeLayer;
        selectedYearRef.current = selectedYear;
        metricRef.current = metric;
        if (!map.current || !map.current.isStyleLoaded()) return;
        paintValues(map.current, selectedYear, activeLayer, metric);
        applyActiveColors();
    }, [activeLayer, selectedYear, metric, applyActiveColors]);

    // Switch the visible geography level and rescale to its distribution.
    useEffect(() => {
        geoLevelRef.current = geoLevel;
        if (!map.current || !map.current.isStyleLoaded()) return;
        setActiveGeoLayer(map.current, geoLevel);
        applyActiveColors();
    }, [geoLevel, applyActiveColors]);

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
        if (selectedCountyRef.current) {
            map.current.setFeatureState(
                { source: COUNTY_SOURCE, id: selectedCountyRef.current },
                { selected: false },
            );
            selectedCountyRef.current = null;
        }
        if (selectedZip3Ref.current) {
            map.current.setFeatureState(
                { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id: selectedZip3Ref.current },
                { selected: false },
            );
            selectedZip3Ref.current = null;
        }

        // Redraw the active layer (no selection highlight) with current stops.
        applyActiveColors();
    }, [selectedRegion, applyActiveColors]);

    // ── Click handlers ───────────────────────────────────────

    const handleStateClick = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features?.length || !map.current) return;
            const postal = e.features[0].properties?.[STATES_ID_PROP] as string;
            const name = e.features[0].properties?.name as string;
            if (!postal) return;

            if (selectedStateRef.current) {
                map.current.setFeatureState(
                    {
                        source: STATES_SOURCE,
                        sourceLayer: STATES_LAYER,
                        id: selectedStateRef.current,
                    },
                    { selected: false },
                );
            }

            selectedStateRef.current = postal;
            map.current.setFeatureState(
                { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: postal },
                { selected: true },
            );
            map.current.setPaintProperty(
                STATES_FILL,
                "fill-color",
                buildColorExpression(hoveredStateRef.current, postal, STATES_ID_PROP, stopsRef.current),
            );

            const records = getStateAnnualData()[postal] ?? [];
            const detail: RegionDetail = {
                id: postal,
                name: name || postal,
                level: "state",
                records,
            };
            setSelectedRegion(postal, detail);
            setSelectedState(postal);
            dismissHint();
        },
        [setSelectedRegion, setSelectedState, dismissHint],
    );

    const handleCountyClick = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features?.length || !map.current) return;
            const fips = e.features[0].properties?.[COUNTY_ID_PROP] as string;
            const name = e.features[0].properties?.name as string;
            if (!fips) return;

            if (selectedCountyRef.current) {
                map.current.setFeatureState(
                    { source: COUNTY_SOURCE, id: selectedCountyRef.current },
                    { selected: false },
                );
            }

            selectedCountyRef.current = fips;
            map.current.setFeatureState({ source: COUNTY_SOURCE, id: fips }, { selected: true });
            map.current.setPaintProperty(
                COUNTY_FILL,
                "fill-color",
                buildColorExpression(hoveredCountyRef.current, fips, COUNTY_ID_PROP, stopsRef.current),
            );

            const records = getCountyAnnualData()[fips] ?? [];
            const detail: RegionDetail = {
                id: fips,
                name: name || `County ${fips}`,
                level: "county",
                records,
            };
            setSelectedRegion(fips, detail);
            dismissHint();
        },
        [setSelectedRegion, dismissHint],
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
                ZIP3_FILL,
                "fill-color",
                buildColorExpression(hoveredZip3Ref.current, zip3, ZIP3_ID_PROP, stopsRef.current),
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
                    {
                        source: STATES_SOURCE,
                        sourceLayer: STATES_LAYER,
                        id: hoveredStateRef.current,
                    },
                    { hover: false },
                );
            }

            hoveredStateRef.current = postal;
            map.current.setFeatureState(
                { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id: postal },
                { hover: true },
            );
            map.current.setPaintProperty(
                STATES_FILL,
                "fill-color",
                buildColorExpression(postal, selectedStateRef.current, STATES_ID_PROP, stopsRef.current),
            );

            const val = getValueForRegion(
                getStateAnnualData()[postal],
                selectedYearRef.current,
                activeLayerRef.current,
                metricRef.current,
            );
            setHovered(postal, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered],
    );

    const handleCountyMouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const fips = e.features[0].properties?.[COUNTY_ID_PROP] as string;
            const name = e.features[0].properties?.name as string;
            if (!fips) return;

            if (hoveredCountyRef.current && hoveredCountyRef.current !== fips) {
                map.current.setFeatureState(
                    { source: COUNTY_SOURCE, id: hoveredCountyRef.current },
                    { hover: false },
                );
            }

            hoveredCountyRef.current = fips;
            map.current.setFeatureState({ source: COUNTY_SOURCE, id: fips }, { hover: true });
            map.current.setPaintProperty(
                COUNTY_FILL,
                "fill-color",
                buildColorExpression(fips, selectedCountyRef.current, COUNTY_ID_PROP, stopsRef.current),
            );

            const val = getValueForRegion(
                getCountyAnnualData()[fips],
                selectedYearRef.current,
                activeLayerRef.current,
                metricRef.current,
            );
            setHovered(name || `County ${fips}`, val, { x: e.point.x, y: e.point.y });
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
                ZIP3_FILL,
                "fill-color",
                buildColorExpression(zip3, selectedZip3Ref.current, ZIP3_ID_PROP, stopsRef.current),
            );

            const val = getValueForRegion(
                getZip3AnnualData()[zip3],
                selectedYearRef.current,
                activeLayerRef.current,
                metricRef.current,
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
            STATES_FILL,
            "fill-color",
            buildColorExpression(null, selectedStateRef.current, STATES_ID_PROP, stopsRef.current),
        );
    }, [setHovered]);

    const handleCountyMouseLeave = useCallback(() => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";

        if (hoveredCountyRef.current) {
            map.current.setFeatureState(
                { source: COUNTY_SOURCE, id: hoveredCountyRef.current },
                { hover: false },
            );
        }
        hoveredCountyRef.current = null;
        setHovered(null, null, null);
        map.current.setPaintProperty(
            COUNTY_FILL,
            "fill-color",
            buildColorExpression(null, selectedCountyRef.current, COUNTY_ID_PROP, stopsRef.current),
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
            ZIP3_FILL,
            "fill-color",
            buildColorExpression(null, selectedZip3Ref.current, ZIP3_ID_PROP, stopsRef.current),
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

            map.current.addControl(
                new maplibregl.AttributionControl({ compact: true }),
                "bottom-right",
            );
            map.current.addControl(
                new maplibregl.NavigationControl({ showCompass: false }),
                "bottom-right",
            );

            map.current.on("load", async () => {
                if (!map.current) return;

                addStatesLayers(map.current);
                addCountyLayers(map.current);
                addZip3Layers(map.current);
                setActiveGeoLayer(map.current, geoLevelRef.current);

                map.current.on("click", STATES_FILL, handleStateClick);
                map.current.on("mousemove", STATES_FILL, handleStateMouseMove);
                map.current.on("mouseleave", STATES_FILL, handleStateMouseLeave);

                map.current.on("click", COUNTY_FILL, handleCountyClick);
                map.current.on("mousemove", COUNTY_FILL, handleCountyMouseMove);
                map.current.on("mouseleave", COUNTY_FILL, handleCountyMouseLeave);

                map.current.on("click", ZIP3_FILL, handleZip3Click);
                map.current.on("mousemove", ZIP3_FILL, handleZip3MouseMove);
                map.current.on("mouseleave", ZIP3_FILL, handleZip3MouseLeave);

                await loadAnnualData();
                paintValues(
                    map.current,
                    selectedYearRef.current,
                    activeLayerRef.current,
                    metricRef.current,
                );
                applyActiveColors();
            });
        };

        initMap();

        return () => {
            maplibregl.removeProtocol("pmtiles");
            map.current?.remove();
            map.current = null;
        };
    }, [
        applyActiveColors,
        handleStateClick,
        handleStateMouseMove,
        handleStateMouseLeave,
        handleCountyClick,
        handleCountyMouseMove,
        handleCountyMouseLeave,
        handleZip3Click,
        handleZip3MouseMove,
        handleZip3MouseLeave,
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
