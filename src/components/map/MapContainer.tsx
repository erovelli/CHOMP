import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapStore } from "../../lib/store";
import type { DqTopicKey, DqData, LayerKey, GeoLevel, Metric } from "../../lib/types";
import {
    DQ_RING_HALO_LAYER,
    DQ_RING_WIDTH,
    DQ_RING_HALO_WIDTH,
    DQ_RING_OPACITY,
    DQ_RING_HALO_OPACITY,
    DQ_RING_HALO_COLOR,
    DQ_RING_NEUTRAL_COLOR,
    DQ_ASSESSMENT_COLORS,
    DQ_TIER_STACK_ORDER,
    dqTierLayerId,
} from "../../constants/dq";
import {
    fetchProtomapsStyle,
    minimizeProtomapsStyle,
    PROTOMAPS_FIRST_LABEL_LAYER,
    buildColorExpression,
    colorExpression,
    quantileStops,
} from "../../lib/mapStyles";
import {
    loadAnnualData,
    loadMonthlyData,
    loadDqAtlas,
    getAnnualDataForLevel,
    getMonthlyDataForLevel,
    getRegionValue,
    isMonthlyPeriod,
} from "../../lib/dataService";
import { MOBILE_MEDIA_QUERY, COARSE_POINTER_QUERY } from "../../constants/layout";
import {
    MAP_CENTER,
    MAP_ZOOM,
    MAP_MIN_ZOOM,
    MAP_MAX_ZOOM,
    CONUS_BOUNDS,
    GEO_LAYERS,
    GEO_LEVEL_KEYS,
    WORLD_SOURCE,
    WORLD_FILL,
    WORLD_STROKE,
    WORLD_GEOJSON,
    WORLD_FILL_COLOR,
    WORLD_STROKE_COLOR,
    WORLD_FILL_OPACITY,
    WORLD_LINE_WIDTH,
    WORLD_LINE_OPACITY,
    FALLBACK_BG_COLOR,
    STROKE_COLOR_ACTIVE,
    OSM_ATTRIBUTION,
} from "../../constants/map";

type LayerMouseEvent = maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] };
type RegionIds = Record<GeoLevel, string | null>;

const STATE_SOURCE = GEO_LAYERS.state.source;
const STATE_STROKE = GEO_LAYERS.state.stroke;

// How a feature is named in the hover tooltip and in the detail panel title.
// `name` is the feature's own `name` property, when the geometry carries one.
const REGION_LABELS: Record<
    GeoLevel,
    {
        tooltip: (id: string, name?: string) => string;
        detail: (id: string, name?: string) => string;
    }
> = {
    state: { tooltip: (id) => id, detail: (id, name) => name || id },
    county: {
        tooltip: (id, name) => name || `County ${id}`,
        detail: (id, name) => name || `County ${id}`,
    },
    zip3: { tooltip: (id) => `ZIP3 ${id}`, detail: (id) => `ZIP3 ${id}` },
};

/** Feature-state target for a region; vector-tile sources also need the layer name. */
function featureRef(level: GeoLevel, id: string): maplibregl.FeatureIdentifier {
    const { source, sourceLayer } = GEO_LAYERS[level];
    return sourceLayer ? { source, sourceLayer, id } : { source, id };
}

/** Claims cache for a level at the time grain `period` implies. */
function dataForPeriod(level: GeoLevel, period: string) {
    return isMonthlyPeriod(period) ? getMonthlyDataForLevel(level) : getAnnualDataForLevel(level);
}

// ── Layer helpers ────────────────────────────────────────────

// Grey backdrop of non-US countries. Used only on the fallback (no-Protomaps)
// path — when Protomaps loads, its own `earth` + `boundaries_country` layers
// already render the whole world cleanly, and stacking our LSIB polygons on
// top creates a visible seam where non-US meets US. Non-interactive (no
// handlers, no feature-state, no promoteId).
function addWorldLayer(map: maplibregl.Map) {
    const BASE = import.meta.env.BASE_URL;

    if (!map.getSource(WORLD_SOURCE)) {
        map.addSource(WORLD_SOURCE, {
            type: "geojson",
            data: `${BASE}${WORLD_GEOJSON}`,
        });
    }

    if (!map.getLayer(WORLD_FILL)) {
        map.addLayer({
            id: WORLD_FILL,
            type: "fill",
            source: WORLD_SOURCE,
            paint: {
                "fill-color": WORLD_FILL_COLOR,
                "fill-opacity": WORLD_FILL_OPACITY,
            },
        });
    }

    if (!map.getLayer(WORLD_STROKE)) {
        map.addLayer({
            id: WORLD_STROKE,
            type: "line",
            source: WORLD_SOURCE,
            paint: {
                "line-color": WORLD_STROKE_COLOR,
                "line-width": WORLD_LINE_WIDTH,
                "line-opacity": WORLD_LINE_OPACITY,
            },
        });
    }
}

// ── Paint expressions keyed on feature-state ─────────────────

/** `case` over the selected / hover feature-state flags. Omit `hover` for
 * properties that don't react to it. */
function interactionExpr<T extends string | number>(v: {
    selected: T;
    hover?: T;
    default: T;
}): maplibregl.ExpressionSpecification {
    const expr: unknown[] = ["case", ["boolean", ["feature-state", "selected"], false], v.selected];
    if (v.hover !== undefined) {
        expr.push(["boolean", ["feature-state", "hover"], false], v.hover);
    }
    expr.push(v.default);
    return expr as maplibregl.ExpressionSpecification;
}

function strokeColorExpr(level: GeoLevel) {
    return interactionExpr({
        selected: STROKE_COLOR_ACTIVE,
        hover: STROKE_COLOR_ACTIVE,
        default: GEO_LAYERS[level].strokeColor,
    });
}

// Source + fill + stroke for one geography level. `beforeId` (when supplied)
// pins data fills below the basemap's remaining label layers, so water-body /
// city labels can float above the choropleth for orientation instead of being
// buried by an opaque fill.
function addGeoLayers(map: maplibregl.Map, level: GeoLevel, beforeId?: string) {
    const BASE = import.meta.env.BASE_URL;
    const spec = GEO_LAYERS[level];
    const insertBefore = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    const sourceLayer = spec.sourceLayer ? { "source-layer": spec.sourceLayer } : {};

    if (!map.getSource(spec.source)) {
        map.addSource(
            spec.source,
            spec.sourceLayer
                ? {
                      type: "vector",
                      url: `pmtiles://${BASE}${spec.file}`,
                      promoteId: { [spec.sourceLayer]: spec.idProp },
                  }
                : { type: "geojson", data: `${BASE}${spec.file}`, promoteId: spec.idProp },
        );
    }

    if (!map.getLayer(spec.fill)) {
        map.addLayer(
            {
                id: spec.fill,
                type: "fill",
                source: spec.source,
                ...sourceLayer,
                paint: {
                    "fill-color": colorExpression as maplibregl.ExpressionSpecification,
                    "fill-opacity": interactionExpr(spec.fillOpacity),
                },
            },
            insertBefore,
        );
    }

    if (!map.getLayer(spec.stroke)) {
        map.addLayer(
            {
                id: spec.stroke,
                type: "line",
                source: spec.source,
                ...sourceLayer,
                paint: {
                    "line-color": strokeColorExpr(level),
                    "line-width": interactionExpr(spec.lineWidth),
                    "line-opacity": interactionExpr(spec.lineOpacity),
                },
            },
            insertBefore,
        );
    }
}

// Promote the chosen level to interactive paint and hide the others. The one
// exception: on County or ZIP3 the state outline stays visible as spatial
// context (no fill), looking the same as an at-rest border in State view.
// This is one-way; State view does not show county/zip3 outlines underneath.
function setActiveGeoLayer(map: maplibregl.Map, active: GeoLevel) {
    for (const level of GEO_LEVEL_KEYS) {
        const spec = GEO_LAYERS[level];
        if (!map.getLayer(spec.fill) || !map.getLayer(spec.stroke)) continue;
        if (level === active) {
            map.setPaintProperty(spec.fill, "fill-opacity", interactionExpr(spec.fillOpacity));
            map.setPaintProperty(spec.stroke, "line-opacity", interactionExpr(spec.lineOpacity));
            map.setPaintProperty(spec.stroke, "line-width", interactionExpr(spec.lineWidth));
            if (level === "state") {
                // Restore the case-expression line-color in case we came back
                // from context mode (which pinned it to the default constant).
                map.setPaintProperty(spec.stroke, "line-color", strokeColorExpr(level));
            }
        } else if (level === "state") {
            map.setPaintProperty(spec.fill, "fill-opacity", 0);
            map.setPaintProperty(spec.stroke, "line-opacity", spec.lineOpacity.default);
            map.setPaintProperty(spec.stroke, "line-width", spec.lineWidth.default);
            map.setPaintProperty(spec.stroke, "line-color", spec.strokeColor);
        } else {
            map.setPaintProperty(spec.fill, "fill-opacity", 0);
            map.setPaintProperty(spec.stroke, "line-opacity", 0);
            map.setPaintProperty(spec.stroke, "line-width", 0);
        }
    }
    // Make sure the state stroke sits ABOVE the active level's fill so the
    // context border isn't half-obscured by county/zip3 fill opacity. (Layers
    // are added world→state→county→zip3, so without this the state stroke is
    // buried beneath county fills and only shows through over water/no-fill
    // areas — which is what produced the bold-on-lakes / faint-inland mismatch.)
    if (map.getLayer(STATE_STROKE)) {
        map.moveLayer(STATE_STROKE);
    }
}

// ── Paint per-region values into feature-state (all three levels) ────

// `period` is either a 4-digit year ("2023") for the annual view, or a
// "YYYY-MM" string ("2023-06") for the monthly view.
function paintValues(map: maplibregl.Map, period: string, activeLayer: LayerKey, metric: Metric) {
    for (const level of GEO_LEVEL_KEYS) {
        for (const id of Object.keys(dataForPeriod(level, period))) {
            const value = getRegionValue(level, id, period, activeLayer, metric);
            // The per-enrollee metric is NaN when ACS has no record for the
            // geography (e.g. territories, PO-box ZIPs — see L26/L37).
            // MapLibre's `interpolate` doesn't handle NaN, so coerce to 0 at
            // the GPU boundary; quantileStops already drops non-positive
            // values, so a coerced 0 paints as the lightest band rather than
            // skewing the scale. getRegionValue itself still returns NaN so
            // the tooltip can tell "no data" from a true zero.
            map.setFeatureState(featureRef(level, id), {
                value: Number.isFinite(value) ? value : 0,
            });
        }
    }
}

// ── DQ Atlas overlay ────────────────────────────────────────
// Halo + one line layer per severity tier, added in ascending severity so the
// worst tier paints on top of shared borders. See constants/dq.ts for the
// full rationale; briefly, a single-layer approach let Wisconsin's
// Low-concern green ring erase part of Illinois's Unusable red ring on the
// shared boundary — with per-tier ordering, the Unusable ring is always last.
const DQ_HAS_STATE: maplibregl.ExpressionSpecification = [
    "!=",
    ["coalesce", ["feature-state", "dqColor"], ""],
    "",
];

function addDqRingLayers(map: maplibregl.Map) {
    if (!map.getLayer(DQ_RING_HALO_LAYER)) {
        map.addLayer({
            id: DQ_RING_HALO_LAYER,
            type: "line",
            source: STATE_SOURCE,
            layout: { visibility: "none" },
            paint: {
                "line-color": [
                    "case",
                    DQ_HAS_STATE,
                    DQ_RING_HALO_COLOR,
                    DQ_RING_NEUTRAL_COLOR,
                ] as maplibregl.ExpressionSpecification,
                "line-width": DQ_RING_HALO_WIDTH,
                "line-opacity": DQ_RING_HALO_OPACITY,
            },
        });
    }
    for (const tier of DQ_TIER_STACK_ORDER) {
        const id = dqTierLayerId(tier);
        if (map.getLayer(id)) continue;
        const color = DQ_ASSESSMENT_COLORS[tier];
        map.addLayer({
            id,
            type: "line",
            source: STATE_SOURCE,
            layout: { visibility: "none" },
            paint: {
                "line-color": color,
                "line-width": DQ_RING_WIDTH,
                // Each tier's layer draws only on states whose feature-state
                // dqColor matches this tier's hex — the paint-time equivalent
                // of a per-tier filter (feature-state can't be filtered on).
                "line-opacity": [
                    "case",
                    ["==", ["coalesce", ["feature-state", "dqColor"], ""], color],
                    DQ_RING_OPACITY,
                    0,
                ] as maplibregl.ExpressionSpecification,
            },
        });
    }
}

/** Bring the DQ layers to the top of the render stack, halo first then each
 * tier in ascending severity. Call this after every layer reorder (geo-level
 * change) so the DQ overlay stays above county/zip3 fills and state stroke. */
function hoistDqLayers(map: maplibregl.Map) {
    if (map.getLayer(DQ_RING_HALO_LAYER)) map.moveLayer(DQ_RING_HALO_LAYER);
    for (const tier of DQ_TIER_STACK_ORDER) {
        const id = dqTierLayerId(tier);
        if (map.getLayer(id)) map.moveLayer(id);
    }
}

function setDqVisibility(map: maplibregl.Map, visible: boolean) {
    const v = visible ? "visible" : "none";
    if (map.getLayer(DQ_RING_HALO_LAYER)) {
        map.setLayoutProperty(DQ_RING_HALO_LAYER, "visibility", v);
    }
    for (const tier of DQ_TIER_STACK_ORDER) {
        const id = dqTierLayerId(tier);
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
}

// Iterate the (topic, year) bucket and write the resolved swatch color into
// each state's feature-state. States absent from the bucket keep the previous
// paint until this or the next paint pass clears them — call clearDqRings
// first when switching topic/year to avoid stale colors leaking through.
function paintDqRings(
    map: maplibregl.Map,
    data: DqData,
    topic: DqTopicKey,
    year: string,
    knownStates: Set<string>,
) {
    const yearBucket = data.topics[topic]?.years[year] ?? {};
    // Clear every known state first so states missing from this year's bucket
    // don't keep their previous color from a prior (topic, year) pass.
    for (const id of knownStates) {
        map.setFeatureState({ source: STATE_SOURCE, id }, { dqColor: "" });
    }
    for (const [postal, rec] of Object.entries(yearBucket)) {
        const color = DQ_ASSESSMENT_COLORS[rec.assessment];
        if (color) {
            map.setFeatureState({ source: STATE_SOURCE, id: postal }, { dqColor: color });
        }
    }
}

// ── Component ────────────────────────────────────────────────

export default function MapContainer() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    // Hovered / selected region id per level. Refs rather than state: the
    // handlers run on every mouse move and write straight to feature-state.
    const hoveredRef = useRef<RegionIds>({ state: null, county: null, zip3: null });
    const selectedRef = useRef<RegionIds>({ state: null, county: null, zip3: null });

    const {
        activeLayer,
        selectedYear,
        selectedMonth,
        selectedRegion,
        geoLevel,
        metric,
        monthlyDataLoaded,
        setMonthlyDataLoaded,
        setSelectedRegion,
        setHovered,
        setColorStops,
        dismissHint,
        dqTopic,
        dqOverlayVisible,
        dqData,
        setDqData,
    } = useMapStore();
    // Set of state ids that have DQ feature-state set. Used to clear stale
    // colors when topic/year changes so a state present last pass but missing
    // this pass doesn't keep its old ring color.
    const dqKnownStatesRef = useRef<Set<string>>(new Set());
    const activeLayerRef = useRef<LayerKey>(activeLayer);
    const selectedYearRef = useRef<string>(selectedYear);
    const selectedMonthRef = useRef<string | null>(selectedMonth);
    const metricRef = useRef<Metric>(metric);
    const geoLevelRef = useRef<GeoLevel>(geoLevel);
    const monthlyLoadedRef = useRef<boolean>(monthlyDataLoaded);
    // Current data-driven color stops, shared with hover/select handlers.
    const stopsRef = useRef<number[]>([]);
    // True once the load handler has added our layers, loaded annual data, and
    // done the first paint. The repaint effects gate on this rather than
    // map.isStyleLoaded(): isStyleLoaded() goes false during transient tile /
    // glyph fetches (e.g. right after a year change), and an effect that bails
    // then never re-runs — leaving the map painted for a stale metric/level.
    // Before this flips, the effects only update refs and the load handler's
    // first paint picks them up.
    const mapReadyRef = useRef(false);

    // "YYYY-MM" once the user has picked a month AND the monthly data has
    // loaded; the bare year until then, so the choropleth never goes blank
    // while we wait on a ~16 MB gzipped fetch. Reads only refs, so empty deps
    // keep it referentially stable (the handlers below depend on it).
    const currentPeriod = useCallback((): string => {
        const m = selectedMonthRef.current;
        if (m !== null && monthlyLoadedRef.current) {
            return `${selectedYearRef.current}-${m.padStart(2, "0")}`;
        }
        return selectedYearRef.current;
    }, []);

    // Re-apply one level's fill-color with its current hover/selection baked in.
    const applyFillColor = useCallback((level: GeoLevel, stops: number[]) => {
        map.current?.setPaintProperty(
            GEO_LAYERS[level].fill,
            "fill-color",
            buildColorExpression(
                hoveredRef.current[level],
                selectedRef.current[level],
                GEO_LAYERS[level].idProp,
                stops,
            ),
        );
    }, []);

    // Recompute the dynamic color scale and re-apply fill-color per level.
    //
    // Scale rule:
    // - Volume (claims count): per-level quantile stops. Magnitudes differ by
    //   10–100× across state → county → ZIP3, so a shared scale would wash the
    //   smaller-grain levels into the light end of the palette.
    // - Per-enrollee rate: SHARED stops across all three levels, computed on
    //   the union of values. A rate is unit-free — "1.32 claims / enrollee"
    //   means the same thing at every level, so color should mean the same
    //   thing too. The shared scale is also what the Legend reads.
    const applyActiveColors = useCallback(() => {
        if (!map.current) return;
        const period = currentPeriod();
        const metric = metricRef.current;

        const valuesByLevel = {} as Record<GeoLevel, number[]>;
        for (const level of GEO_LEVEL_KEYS) {
            valuesByLevel[level] = Object.keys(dataForPeriod(level, period)).map((id) =>
                getRegionValue(level, id, period, activeLayerRef.current, metric),
            );
        }

        const sharedStops =
            metric === "enrollees"
                ? quantileStops(Object.values(valuesByLevel).flat(), metric)
                : null;

        for (const level of GEO_LEVEL_KEYS) {
            const stops = sharedStops ?? quantileStops(valuesByLevel[level], metric);
            if (level === geoLevelRef.current) {
                stopsRef.current = stops;
                setColorStops(stops);
            }
            applyFillColor(level, stops);
        }
    }, [setColorStops, currentPeriod, applyFillColor]);

    // Repaint values + rescale when category, year, month, monthly-load, or
    // metric changes. The choropleth shows monthly values once the user has
    // picked a month AND the monthly NDJSON has finished loading.
    useEffect(() => {
        activeLayerRef.current = activeLayer;
        selectedYearRef.current = selectedYear;
        selectedMonthRef.current = selectedMonth;
        metricRef.current = metric;
        monthlyLoadedRef.current = monthlyDataLoaded;
        if (!map.current || !mapReadyRef.current) return;
        paintValues(map.current, currentPeriod(), activeLayer, metric);
        applyActiveColors();
    }, [
        activeLayer,
        selectedYear,
        selectedMonth,
        metric,
        monthlyDataLoaded,
        applyActiveColors,
        currentPeriod,
    ]);

    // Lazy-load the monthly NDJSON the first time the user picks a month.
    useEffect(() => {
        if (selectedMonth === null) return;
        if (monthlyDataLoaded) return;
        let cancelled = false;
        loadMonthlyData().then(() => {
            if (!cancelled) setMonthlyDataLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, [selectedMonth, monthlyDataLoaded, setMonthlyDataLoaded]);

    // Switch the visible geography level and rescale to its distribution.
    useEffect(() => {
        geoLevelRef.current = geoLevel;
        if (!map.current || !mapReadyRef.current) return;
        setActiveGeoLayer(map.current, geoLevel);
        applyActiveColors();
        // setActiveGeoLayer hoists the state stroke to keep the state border
        // above county/zip3 fills; the DQ overlay is state-scoped too and
        // needs to sit above that stroke, so re-hoist it after every level
        // change (halo first, then each severity tier in order).
        hoistDqLayers(map.current);
    }, [geoLevel, applyActiveColors]);

    // DQ overlay paint + visibility. Repaints when (dqData, dqTopic,
    // selectedYear) change. Hides the overlay entirely when the topic has no
    // data for the current year (per the design brief), when the user has
    // closed the overlay, or when the atlas hasn't loaded yet. Skips the
    // isStyleLoaded() check — a positive getLayer result is sufficient, and
    // isStyleLoaded returns false during transient tile fetches (Protomaps'
    // asynchronous glyph loading in particular) even after our layers are
    // safe to touch.
    useEffect(() => {
        const m = map.current;
        if (!m || !m.getLayer(DQ_RING_HALO_LAYER)) return;

        const hasYearData =
            !!dqData &&
            !!dqData.topics[dqTopic]?.years[selectedYear] &&
            Object.keys(dqData.topics[dqTopic].years[selectedYear]).length > 0;
        const shouldShow = dqOverlayVisible && hasYearData;

        if (shouldShow && dqData) {
            paintDqRings(m, dqData, dqTopic, selectedYear, dqKnownStatesRef.current);
        }
        setDqVisibility(m, shouldShow);
    }, [dqData, dqTopic, dqOverlayVisible, selectedYear]);

    // Reset paint when panel is closed
    useEffect(() => {
        if (selectedRegion !== null) return;
        if (!map.current) return;

        for (const level of GEO_LEVEL_KEYS) {
            const id = selectedRef.current[level];
            if (!id) continue;
            map.current.setFeatureState(featureRef(level, id), { selected: false });
            selectedRef.current[level] = null;
        }

        // Redraw the active layer (no selection highlight) with current stops.
        applyActiveColors();
    }, [selectedRegion, applyActiveColors]);

    // ── Pointer handlers (one set, registered once per level) ────
    // Every level's fill layer stays mounted, so each handler first checks
    // that its level is the one on screen.

    const handleClick = useCallback(
        (level: GeoLevel, e: LayerMouseEvent) => {
            if (geoLevelRef.current !== level) return;
            if (!e.features?.length || !map.current) return;
            const props = e.features[0].properties;
            const id = props?.[GEO_LAYERS[level].idProp] as string;
            if (!id) return;

            const previous = selectedRef.current[level];
            if (previous) {
                map.current.setFeatureState(featureRef(level, previous), { selected: false });
            }
            selectedRef.current[level] = id;
            map.current.setFeatureState(featureRef(level, id), { selected: true });
            applyFillColor(level, stopsRef.current);

            setSelectedRegion(id, {
                id,
                name: REGION_LABELS[level].detail(id, props?.name as string | undefined),
                level,
                records: getAnnualDataForLevel(level)[id] ?? [],
            });
            dismissHint();
        },
        [setSelectedRegion, dismissHint, applyFillColor],
    );

    const handleMouseMove = useCallback(
        (level: GeoLevel, e: LayerMouseEvent) => {
            if (geoLevelRef.current !== level) return;
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;
            const id = props?.[GEO_LAYERS[level].idProp] as string;
            if (!id) return;

            const previous = hoveredRef.current[level];
            if (previous && previous !== id) {
                map.current.setFeatureState(featureRef(level, previous), { hover: false });
            }
            hoveredRef.current[level] = id;
            map.current.setFeatureState(featureRef(level, id), { hover: true });
            applyFillColor(level, stopsRef.current);

            const value = getRegionValue(
                level,
                id,
                currentPeriod(),
                activeLayerRef.current,
                metricRef.current,
            );
            setHovered(REGION_LABELS[level].tooltip(id, props?.name as string | undefined), value, {
                x: e.point.x,
                y: e.point.y,
            });
        },
        [setHovered, currentPeriod, applyFillColor],
    );

    const handleMouseLeave = useCallback(
        (level: GeoLevel) => {
            if (geoLevelRef.current !== level) return;
            if (!map.current) return;
            map.current.getCanvas().style.cursor = "";

            const previous = hoveredRef.current[level];
            if (previous) {
                map.current.setFeatureState(featureRef(level, previous), { hover: false });
            }
            hoveredRef.current[level] = null;
            setHovered(null, null, null);
            applyFillColor(level, stopsRef.current);
        },
        [setHovered, applyFillColor],
    );

    // ── Map initialization ───────────────────────────────────

    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        const protocol = new Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);

        const initMap = async () => {
            const apiKey = import.meta.env.VITE_PROTOMAPS_API_KEY;

            let style;
            if (apiKey) {
                // Prune Protomaps' general-purpose style down to a
                // choropleth-appropriate backdrop — see minimizeProtomapsStyle
                // for the whitelist and the rationale.
                style = minimizeProtomapsStyle(await fetchProtomapsStyle(apiKey));
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

            // Init-time only (no resize handling): the viewport class rarely
            // changes mid-session, and re-fitting under the user would fight
            // their pan/zoom.
            const smallViewport = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
            const coarsePointer = window.matchMedia(COARSE_POINTER_QUERY).matches;

            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style,
                // The fixed center/zoom crop both seaboards on a portrait
                // phone — fit the continental US to the actual screen instead.
                ...(smallViewport
                    ? { bounds: CONUS_BOUNDS, fitBoundsOptions: { padding: 16 } }
                    : { center: MAP_CENTER, zoom: MAP_ZOOM }),
                minZoom: MAP_MIN_ZOOM,
                maxZoom: MAP_MAX_ZOOM,
                attributionControl: false,
            });

            // The compass is hidden, so a two-finger rotate/pitch would leave
            // the map askew with no affordance to reset it.
            map.current.touchZoomRotate.disableRotation();
            map.current.touchPitch.disable();

            map.current.addControl(
                new maplibregl.AttributionControl({
                    // Keep the OSM/Protomaps line visible inline on the map
                    // rather than tucked behind the compact "i" chip — the
                    // ODbL attribution requirement is easier for everyone to
                    // find when it's readable at a glance.
                    compact: false,
                    // Required by Protomaps' license when Protomaps tiles load.
                    customAttribution: apiKey ? OSM_ATTRIBUTION : undefined,
                }),
                "bottom-right",
            );
            if (!coarsePointer) {
                // Pinch-zoom covers this on touch devices; skip the buttons.
                map.current.addControl(
                    new maplibregl.NavigationControl({ showCompass: false }),
                    "bottom-right",
                );
            }

            map.current.on("load", async () => {
                if (!map.current) return;

                // On the Protomaps path, its own `earth` + `boundaries_country`
                // already render the whole world — skip our LSIB backdrop to
                // avoid the visible seam and the tone clash. Fall back to LSIB
                // only when there is no basemap at all.
                if (!apiKey) {
                    addWorldLayer(map.current);
                }
                // Pin data fills below the pruned basemap's remaining label
                // layers so water-body / city labels can float over the
                // choropleth for orientation at deep zoom, rather than being
                // buried by an opaque fill.
                const labelAnchor = apiKey ? PROTOMAPS_FIRST_LABEL_LAYER : undefined;
                for (const level of GEO_LEVEL_KEYS) {
                    addGeoLayers(map.current, level, labelAnchor);
                }
                // DQ overlay shares the states source; add after states so
                // the source already exists. Layers start hidden — turned on
                // by the visibility effect once dqData resolves.
                addDqRingLayers(map.current);
                setActiveGeoLayer(map.current, geoLevelRef.current);
                // setActiveGeoLayer hoists the state stroke to the top for
                // county/zip3 spatial context; the DQ overlay belongs above
                // that, so hoist it again as the final step.
                hoistDqLayers(map.current);

                for (const level of GEO_LEVEL_KEYS) {
                    const { fill } = GEO_LAYERS[level];
                    map.current.on("click", fill, (e) => handleClick(level, e));
                    map.current.on("mousemove", fill, (e) => handleMouseMove(level, e));
                    map.current.on("mouseleave", fill, () => handleMouseLeave(level));
                }

                await loadAnnualData();
                paintValues(
                    map.current,
                    currentPeriod(),
                    activeLayerRef.current,
                    metricRef.current,
                );
                applyActiveColors();
                mapReadyRef.current = true;
                // Track every state id the annual data knows about so the DQ
                // ring pass can wipe stale colors from states not present in
                // the current (topic, year) bucket. Uses annual state ids as
                // the universe — the ring layer is state-scoped anyway.
                dqKnownStatesRef.current = new Set(Object.keys(getAnnualDataForLevel("state")));
                // Kick off DQ overlay fetch in parallel; overlay is optional
                // and never blocks the main map from becoming interactive.
                loadDqAtlas().then((data) => {
                    if (data) setDqData(data);
                });
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
        currentPeriod,
        handleClick,
        handleMouseMove,
        handleMouseLeave,
        setDqData,
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
