import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapStore } from "../../lib/store";
import {
    fetchProtomapsStyle,
    buildColorExpression,
    colorExpression,
    quantileStops,
} from "../../lib/mapStyles";
import type { LayerKey, GeoLevel, Metric, RegionDetail } from "../../lib/types";
import {
    loadAnnualData,
    loadMonthlyData,
    getStateAnnualData,
    getCountyAnnualData,
    getZip3AnnualData,
    getAnnualDataForLevel,
    getMonthlyDataForLevel,
    getValueForRegion,
    getValueForRegionMonthly,
    getEnrolleesFor,
} from "../../lib/dataService";
import type { DataRecord, MonthlyDataRecord } from "../../lib/types";
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

// Grey backdrop of non-US countries. Added first so every data layer renders
// above it. Non-interactive (no handlers, no feature-state, no promoteId).
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

// Non-active geography levels are fully hidden — only the level the user
// selected is rendered.
const DIMMED_FILL_OPACITY = 0;
const DIMMED_LINE_OPACITY = 0;
const DIMMED_LINE_WIDTH = 0;

// Exception: when the user is on County or ZIP3, faint state borders stay
// visible as spatial context (no fill, just the outline). This is one-way —
// the State view does NOT show county/zip3 outlines underneath. Values mirror
// STATES_LINE_OPACITY.default / STATES_LINE_WIDTH.default so the at-rest
// border looks identical whether the user is on State, County, or ZIP3.
const CONTEXT_STATE_LINE_OPACITY = STATES_LINE_OPACITY.default;
const CONTEXT_STATE_LINE_WIDTH = STATES_LINE_WIDTH.default;

// State stroke line-color case expression — extracted so we can restore it
// when state becomes active again after a context-mode override.
function activeStateLineColorExpr() {
    return [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        STROKE_COLOR_ACTIVE,
        ["boolean", ["feature-state", "hover"], false],
        STROKE_COLOR_ACTIVE,
        STROKE_COLOR_DEFAULT_STATES,
    ];
}

const LEVEL_STROKE: Record<GeoLevel, string> = {
    state: STATES_STROKE,
    county: COUNTY_STROKE,
    zip3: ZIP3_STROKE,
};

function activeFillOpacityExpr(opa: { selected: number; hover: number; default: number }) {
    return [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        opa.selected,
        ["boolean", ["feature-state", "hover"], false],
        opa.hover,
        opa.default,
    ];
}

function activeLineOpacityExpr(opa: { selected: number; default: number }) {
    return ["case", ["boolean", ["feature-state", "selected"], false], opa.selected, opa.default];
}

function activeLineWidthExpr(w: { selected: number; hover: number; default: number }) {
    return [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        w.selected,
        ["boolean", ["feature-state", "hover"], false],
        w.hover,
        w.default,
    ];
}

const FILL_OPA_BY_LEVEL = {
    state: STATES_FILL_OPACITY,
    county: COUNTY_FILL_OPACITY,
    zip3: ZIP3_FILL_OPACITY,
} as const;
const LINE_OPA_BY_LEVEL = {
    state: STATES_LINE_OPACITY,
    county: COUNTY_LINE_OPACITY,
    zip3: ZIP3_LINE_OPACITY,
} as const;
const LINE_W_BY_LEVEL = {
    state: STATES_LINE_WIDTH,
    county: COUNTY_LINE_WIDTH,
    zip3: ZIP3_LINE_WIDTH,
} as const;

// Promote the chosen level to interactive opacities; hide everything else,
// except keep faint state borders as spatial context when the user is on
// County or ZIP3.
function setActiveGeoLayer(map: maplibregl.Map, level: GeoLevel) {
    const levels: GeoLevel[] = ["state", "county", "zip3"];
    for (const lvl of levels) {
        const fill = LEVEL_FILL[lvl];
        const stroke = LEVEL_STROKE[lvl];
        if (!map.getLayer(fill) || !map.getLayer(stroke)) continue;
        if (lvl === level) {
            map.setPaintProperty(
                fill,
                "fill-opacity",
                activeFillOpacityExpr(FILL_OPA_BY_LEVEL[lvl]),
            );
            map.setPaintProperty(
                stroke,
                "line-opacity",
                activeLineOpacityExpr(LINE_OPA_BY_LEVEL[lvl]),
            );
            map.setPaintProperty(stroke, "line-width", activeLineWidthExpr(LINE_W_BY_LEVEL[lvl]));
            if (lvl === "state") {
                // Restore the case-expression line-color in case we came back
                // from context mode (which pinned it to the default constant).
                map.setPaintProperty(stroke, "line-color", activeStateLineColorExpr());
            }
        } else if (lvl === "state") {
            // Context mode: no fill; outline matches State view's at-rest look
            // (same opacity, width, and greenish-grey default color).
            map.setPaintProperty(fill, "fill-opacity", 0);
            map.setPaintProperty(stroke, "line-opacity", CONTEXT_STATE_LINE_OPACITY);
            map.setPaintProperty(stroke, "line-width", CONTEXT_STATE_LINE_WIDTH);
            map.setPaintProperty(stroke, "line-color", STROKE_COLOR_DEFAULT_STATES);
        } else {
            map.setPaintProperty(fill, "fill-opacity", DIMMED_FILL_OPACITY);
            map.setPaintProperty(stroke, "line-opacity", DIMMED_LINE_OPACITY);
            map.setPaintProperty(stroke, "line-width", DIMMED_LINE_WIDTH);
        }
    }
    // Make sure the state stroke sits ABOVE the active level's fill so the
    // context border isn't half-obscured by county/zip3 fill opacity. (Layers
    // are added world→state→county→zip3, so without this the state stroke is
    // buried beneath county fills and only shows through over water/no-fill
    // areas — which is what produced the bold-on-lakes / faint-inland mismatch.)
    if (map.getLayer(STATES_STROKE)) {
        map.moveLayer(STATES_STROKE);
    }
}

// ── Paint per-region values into feature-state (all three levels) ────

// `period` is either a 4-digit year ("2023") for the annual view, or a
// "YYYY-MM" string ("2023-06") for the monthly view. `monthly` decides which
// cache + value function to use.
function paintValues(
    map: maplibregl.Map,
    period: string,
    activeLayer: LayerKey,
    metric: Metric,
    monthly: boolean,
) {
    const stateData = monthly ? getMonthlyDataForLevel("state") : getStateAnnualData();
    const countyData = monthly ? getMonthlyDataForLevel("county") : getCountyAnnualData();
    const zip3Data = monthly ? getMonthlyDataForLevel("zip3") : getZip3AnnualData();

    // ACS denominator is annual; for monthly mode the period is "YYYY-MM" — use
    // the year prefix as the ACS endpoint-year lookup key.
    const enrollmentYear = monthly ? period.slice(0, 4) : period;
    const needsEnroll = metric === "enrollees";
    const valueOf = (
        level: GeoLevel,
        id: string,
        records: DataRecord[] | MonthlyDataRecord[],
    ): number => {
        const enrollees = needsEnroll ? getEnrolleesFor(level, id, enrollmentYear) : null;
        return monthly
            ? getValueForRegionMonthly(
                  records as MonthlyDataRecord[],
                  period,
                  activeLayer,
                  metric,
                  enrollees,
              )
            : getValueForRegion(records as DataRecord[], period, activeLayer, metric, enrollees);
    };

    // valueOf can return NaN for the per-enrollee metric when ACS has no
    // record for the geography (e.g. territories, PO-box ZIPs — see L26/L37).
    // MapLibre's `interpolate` paint expression doesn't handle NaN gracefully,
    // so we coerce to 0 at the GPU boundary; the rate-metric's quantileStops
    // already filters non-positive values out of the scale, so a coerced 0
    // paints as the lightest band rather than skewing the quantiles. The
    // value functions themselves still return NaN so tooltip/panel code can
    // distinguish "no data" from "true zero".
    const safe = (v: number): number => (Number.isFinite(v) ? v : 0);
    for (const [id, records] of Object.entries(stateData)) {
        map.setFeatureState(
            { source: STATES_SOURCE, sourceLayer: STATES_LAYER, id },
            { value: safe(valueOf("state", id, records)) },
        );
    }
    for (const [id, records] of Object.entries(countyData)) {
        map.setFeatureState(
            { source: COUNTY_SOURCE, id },
            { value: safe(valueOf("county", id, records)) },
        );
    }
    for (const [id, records] of Object.entries(zip3Data)) {
        map.setFeatureState(
            { source: ZIP3_SOURCE, sourceLayer: ZIP3_LAYER, id },
            { value: safe(valueOf("zip3", id, records)) },
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
        selectedMonth,
        selectedRegion,
        geoLevel,
        metric,
        monthlyDataLoaded,
        setMonthlyDataLoaded,
        setSelectedRegion,
        setSelectedState,
        setHovered,
        setColorStops,
        dismissHint,
    } = useMapStore();
    const activeLayerRef = useRef<LayerKey>(activeLayer);
    const selectedYearRef = useRef<string>(selectedYear);
    const selectedMonthRef = useRef<string | null>(selectedMonth);
    const metricRef = useRef<Metric>(metric);
    const geoLevelRef = useRef<GeoLevel>(geoLevel);
    const monthlyLoadedRef = useRef<boolean>(monthlyDataLoaded);
    // Current data-driven color stops, shared with hover/select handlers.
    const stopsRef = useRef<number[]>([]);

    // The map paints monthly values only once the monthly data has actually
    // loaded; until then it stays on the annual view (so the choropleth never
    // goes blank while we wait on a ~16 MB gzipped fetch). These helpers all
    // read from refs, so empty deps keep them referentially stable across
    // renders (the handler useCallbacks below depend on them).
    const isMonthlyMode = useCallback((): boolean => {
        return selectedMonthRef.current !== null && monthlyLoadedRef.current;
    }, []);
    const currentPeriod = useCallback((): string => {
        const m = selectedMonthRef.current;
        if (m !== null && monthlyLoadedRef.current) {
            return `${selectedYearRef.current}-${m.padStart(2, "0")}`;
        }
        return selectedYearRef.current;
    }, []);
    const hoveredValueForLevel = useCallback(
        (level: GeoLevel, id: string): number => {
            const monthly = isMonthlyMode();
            const data = monthly ? getMonthlyDataForLevel(level) : getAnnualDataForLevel(level);
            const records = data[id];
            if (!records) return 0;
            const period = currentPeriod();
            const enrollees =
                metricRef.current === "enrollees"
                    ? getEnrolleesFor(level, id, monthly ? period.slice(0, 4) : period)
                    : null;
            return monthly
                ? getValueForRegionMonthly(
                      records as MonthlyDataRecord[],
                      period,
                      activeLayerRef.current,
                      metricRef.current,
                      enrollees,
                  )
                : getValueForRegion(
                      records as DataRecord[],
                      period,
                      activeLayerRef.current,
                      metricRef.current,
                      enrollees,
                  );
        },
        [isMonthlyMode, currentPeriod],
    );

    const hoveredRefFor = (lvl: GeoLevel) =>
        lvl === "state" ? hoveredStateRef : lvl === "county" ? hoveredCountyRef : hoveredZip3Ref;
    const selectedRefFor = (lvl: GeoLevel) =>
        lvl === "state" ? selectedStateRef : lvl === "county" ? selectedCountyRef : selectedZip3Ref;

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
        const active = geoLevelRef.current;
        const monthly = isMonthlyMode();
        const period = currentPeriod();
        const levels: GeoLevel[] = ["state", "county", "zip3"];
        const enrollmentYear = monthly ? period.slice(0, 4) : period;
        const needsEnroll = metricRef.current === "enrollees";

        const valuesByLevel: Record<GeoLevel, number[]> = {
            state: [],
            county: [],
            zip3: [],
        };
        for (const level of levels) {
            const data = monthly ? getMonthlyDataForLevel(level) : getAnnualDataForLevel(level);
            valuesByLevel[level] = Object.entries(data).map(([id, recs]) => {
                const enrollees = needsEnroll ? getEnrolleesFor(level, id, enrollmentYear) : null;
                return monthly
                    ? getValueForRegionMonthly(
                          recs as MonthlyDataRecord[],
                          period,
                          activeLayerRef.current,
                          metricRef.current,
                          enrollees,
                      )
                    : getValueForRegion(
                          recs as DataRecord[],
                          period,
                          activeLayerRef.current,
                          metricRef.current,
                          enrollees,
                      );
            });
        }

        const sharedStops = needsEnroll
            ? quantileStops(
                  [...valuesByLevel.state, ...valuesByLevel.county, ...valuesByLevel.zip3],
                  metricRef.current,
              )
            : null;

        for (const level of levels) {
            const stops = sharedStops ?? quantileStops(valuesByLevel[level], metricRef.current);
            if (level === active) {
                stopsRef.current = stops;
                setColorStops(stops);
            }
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
        }
    }, [setColorStops, currentPeriod, isMonthlyMode]);

    // Repaint values + rescale when category, year, month, monthly-load, or
    // metric changes. The choropleth shows monthly values once the user has
    // picked a month AND the monthly NDJSON has finished loading.
    useEffect(() => {
        activeLayerRef.current = activeLayer;
        selectedYearRef.current = selectedYear;
        selectedMonthRef.current = selectedMonth;
        metricRef.current = metric;
        monthlyLoadedRef.current = monthlyDataLoaded;
        if (!map.current || !map.current.isStyleLoaded()) return;
        const monthly = isMonthlyMode();
        paintValues(map.current, currentPeriod(), activeLayer, metric, monthly);
        applyActiveColors();
    }, [
        activeLayer,
        selectedYear,
        selectedMonth,
        metric,
        monthlyDataLoaded,
        applyActiveColors,
        currentPeriod,
        isMonthlyMode,
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
            if (geoLevelRef.current !== "state") return;
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
                buildColorExpression(
                    hoveredStateRef.current,
                    postal,
                    STATES_ID_PROP,
                    stopsRef.current,
                ),
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
            if (geoLevelRef.current !== "county") return;
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
                buildColorExpression(
                    hoveredCountyRef.current,
                    fips,
                    COUNTY_ID_PROP,
                    stopsRef.current,
                ),
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
            if (geoLevelRef.current !== "zip3") return;
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
            if (geoLevelRef.current !== "state") return;
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
                buildColorExpression(
                    postal,
                    selectedStateRef.current,
                    STATES_ID_PROP,
                    stopsRef.current,
                ),
            );

            const val = hoveredValueForLevel("state", postal);
            setHovered(postal, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered, hoveredValueForLevel],
    );

    const handleCountyMouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (geoLevelRef.current !== "county") return;
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
                buildColorExpression(
                    fips,
                    selectedCountyRef.current,
                    COUNTY_ID_PROP,
                    stopsRef.current,
                ),
            );

            const val = hoveredValueForLevel("county", fips);
            setHovered(name || `County ${fips}`, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered, hoveredValueForLevel],
    );

    const handleZip3MouseMove = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (geoLevelRef.current !== "zip3") return;
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

            const val = hoveredValueForLevel("zip3", zip3);
            setHovered(`ZIP3 ${zip3}`, val, { x: e.point.x, y: e.point.y });
        },
        [setHovered, hoveredValueForLevel],
    );

    const handleStateMouseLeave = useCallback(() => {
        if (geoLevelRef.current !== "state") return;
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
        if (geoLevelRef.current !== "county") return;
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
        if (geoLevelRef.current !== "zip3") return;
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

                addWorldLayer(map.current);
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
                    currentPeriod(),
                    activeLayerRef.current,
                    metricRef.current,
                    isMonthlyMode(),
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
        currentPeriod,
        isMonthlyMode,
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
