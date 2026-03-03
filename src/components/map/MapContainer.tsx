import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapStore } from "../../lib/store";
import { fetchProtomapsStyle, buildColorExpression, colorExpression, HOVER_COLOR } from "../../lib/mapStyles";
import type { LayerKey, ZCTADetail } from "../../lib/types";

const REGIONS_SOURCE = "regions";
const FILL_LAYER = "regions-fill";
const STROKE_LAYER = "regions-stroke";
const SOURCE_LAYER = "zcta";

// Module-level cache — persists across layer switches
let attrCache: Record<string, Record<string, number>> = {};

export default function MapContainer() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const hoveredIdRef = useRef<string | null>(null);
    const selectedIdRef = useRef<string | null>(null);

    const { activeLayer, selectedZCTA, setSelectedZCTA, setHovered, dismissHint } = useMapStore();
    const activeLayerRef = useRef<LayerKey>(activeLayer);

    // Repaint when layer switches
    useEffect(() => {
        activeLayerRef.current = activeLayer;
        if (!map.current || !map.current.isStyleLoaded()) return;
        if (Object.keys(attrCache).length === 0) return;

        Object.entries(attrCache).forEach(([zip, vals]) => {
            map.current!.setFeatureState(
                {
                    source: REGIONS_SOURCE,
                    sourceLayer: SOURCE_LAYER,
                    id: zip,
                },
                { value: vals[activeLayer] ?? 0 },
            );
        });
    }, [activeLayer]);

    // Reset paint when panel is closed (selectedZCTA becomes null)
    useEffect(() => {
        if (selectedZCTA !== null) return;
        if (!map.current) return;

        if (selectedIdRef.current) {
            map.current.setFeatureState(
                {
                    source: REGIONS_SOURCE,
                    sourceLayer: SOURCE_LAYER,
                    id: selectedIdRef.current,
                },
                { selected: false },
            );
            selectedIdRef.current = null;
        }

        // Reset to plain choropleth
        map.current.setPaintProperty(FILL_LAYER, "fill-color", colorExpression);
    }, [selectedZCTA]);

    const handleClick = useCallback(
        (
            e: maplibregl.MapMouseEvent & {
                features?: maplibregl.MapGeoJSONFeature[];
            },
        ) => {
            if (!e.features?.length || !map.current) return;
            const zip = e.features[0].properties?.ZCTA5 as string;
            if (!zip) return;

            if (selectedIdRef.current) {
                map.current.setFeatureState(
                    {
                        source: REGIONS_SOURCE,
                        sourceLayer: SOURCE_LAYER,
                        id: selectedIdRef.current,
                    },
                    { selected: false },
                );
            }

            selectedIdRef.current = zip;
            map.current.setFeatureState(
                { source: REGIONS_SOURCE, sourceLayer: SOURCE_LAYER, id: zip },
                { selected: true },
            );

            // Paint selected ZIP
            map.current.setPaintProperty(FILL_LAYER, "fill-color", buildColorExpression(hoveredIdRef.current, zip));

            const attrs = attrCache[zip];
            const detail = attrs ? buildDetailFromAttrs(zip, attrs) : null;
            setSelectedZCTA(zip, detail);
            dismissHint();
        },
        [setSelectedZCTA, dismissHint],
    );

    const handleMouseMove = useCallback(
        (
            e: maplibregl.MapMouseEvent & {
                features?: maplibregl.MapGeoJSONFeature[];
            },
        ) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const zip = e.features[0].properties?.ZCTA5 as string;
            if (!zip) return;

            if (hoveredIdRef.current && hoveredIdRef.current !== zip) {
                map.current.setFeatureState(
                    {
                        source: REGIONS_SOURCE,
                        sourceLayer: SOURCE_LAYER,
                        id: hoveredIdRef.current,
                    },
                    { hover: false },
                );
            }

            hoveredIdRef.current = zip;
            map.current.setFeatureState(
                { source: REGIONS_SOURCE, sourceLayer: SOURCE_LAYER, id: zip },
                { hover: true },
            );

            // Paint hovered ZIP, preserve selected ZIP
            map.current.setPaintProperty(FILL_LAYER, "fill-color", buildColorExpression(zip, selectedIdRef.current));

            const val = attrCache[zip]?.[activeLayerRef.current] ?? null;
            setHovered(zip, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered],
    );

    const handleMouseLeave = useCallback(() => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";

        if (hoveredIdRef.current) {
            map.current.setFeatureState(
                {
                    source: REGIONS_SOURCE,
                    sourceLayer: SOURCE_LAYER,
                    id: hoveredIdRef.current,
                },
                { hover: false },
            );
        }
        hoveredIdRef.current = null;
        setHovered(null, null, null);

        // Preserve selected ZIP color, reset everything else
        map.current.setPaintProperty(FILL_LAYER, "fill-color", buildColorExpression(null, selectedIdRef.current));
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
                // Fallback: plain light background if no API key
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
                center: [-71.8, 42.1],
                zoom: 7.5,
                minZoom: 2,
                maxZoom: 14,
                attributionControl: false,
            });

            map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
            map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

            map.current.on("load", async () => {
                if (!map.current) return;

                if (!map.current.getSource(REGIONS_SOURCE)) {
                    map.current.addSource(REGIONS_SOURCE, {
                        type: "vector",
                        url: `pmtiles://${import.meta.env.BASE_URL}ma_zips.pmtiles`,
                    });
                }

                if (!map.current.getLayer(FILL_LAYER)) {
                    map.current.addLayer({
                        id: FILL_LAYER,
                        type: "fill",
                        source: REGIONS_SOURCE,
                        "source-layer": SOURCE_LAYER,
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

                if (!map.current.getLayer(STROKE_LAYER)) {
                    map.current.addLayer({
                        id: STROKE_LAYER,
                        type: "line",
                        source: REGIONS_SOURCE,
                        "source-layer": SOURCE_LAYER,
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

                map.current.on("click", FILL_LAYER, handleClick);
                map.current.on("mousemove", FILL_LAYER, handleMouseMove);
                map.current.on("mouseleave", FILL_LAYER, handleMouseLeave);

                await loadAndPaint(map.current, activeLayerRef.current);
            });
        };

        initMap();

        return () => {
            maplibregl.removeProtocol("pmtiles");
            map.current?.remove();
            map.current = null;
        };
    }, [handleClick, handleMouseMove, handleMouseLeave]);

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

async function loadAndPaint(map: maplibregl.Map, activeLayer: LayerKey) {
    try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/ma-dental.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Record<string, Record<string, number>> = await res.json();
        attrCache = data;

        Object.entries(data).forEach(([zip, vals]) => {
            map.setFeatureState(
                { source: REGIONS_SOURCE, sourceLayer: SOURCE_LAYER, id: zip },
                {
                    value: vals[activeLayer] ?? 0,
                    all: vals.all,
                    preventive: vals.preventive,
                    restorative: vals.restorative,
                    extractions: vals.extractions,
                    ortho: vals.ortho,
                    providers: vals.providers,
                    beneficiaries: vals.beneficiaries,
                    totalPayment: vals.totalPayment,
                    avgPaymentPerClaim: vals.avgPaymentPerClaim,
                },
            );
        });

        console.log(`Painted ${Object.keys(data).length} ZIP codes`);
    } catch (err) {
        console.error("Failed to load dental data:", err);
    }
}

function buildDetailFromAttrs(zip: string, attrs: Record<string, number>): ZCTADetail {
    return {
        zcta: zip,
        state: "MA",
        stateName: "Massachusetts",
        all: attrs.all ?? 0,
        preventive: attrs.preventive ?? 0,
        restorative: attrs.restorative ?? 0,
        extractions: attrs.extractions ?? 0,
        ortho: attrs.ortho ?? 0,
        providers: attrs.providers ?? 0,
        beneficiaries: attrs.beneficiaries ?? 0,
        totalPayment: attrs.totalPayment ?? 0,
        avgPaymentPerClaim: attrs.avgPaymentPerClaim ?? 0,
        nationalPctile: 50,
        nationalAvg: {
            all: 92,
            preventive: 54,
            restorative: 31,
            extractions: 19,
            ortho: 11,
        },
        stateAvg: {
            all: 88,
            preventive: 51,
            restorative: 29,
            extractions: 21,
            ortho: 10,
        },
    };
}
