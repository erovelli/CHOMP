import {
    geoAlbersUsa,
    geoArea,
    geoMercator,
    geoPath,
    type GeoProjection,
    type GeoPermissibleObjects,
} from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry, Position } from "geojson";
import type { GeoLevel, LayerKey, Metric } from "../types";
import { CHOROPLETH_COLORS, N_STOPS, quantileStops } from "../mapStyles";
import { LAYER_CONFIGS, COUNTY_GEOJSON } from "../../constants/map";
import { STATE_FIPS_TO_USPS, PR_FIPS, TERRITORY_NON_PR_FIPS } from "../../constants/stateFips";
import { colorForValue } from "./colorScale";
import { getAnnualDataForLevel, getEnrolleesFor, getValueForRegion } from "../dataService";

// ── Canvas / layout ───────────────────────────────────────────
//
// 1600×1000 is the default; the modal preview asks for a smaller pass via
// `scale`. Layout coordinates assume the 1600×1000 reference; the renderer
// applies a single ctx.scale(s, s) so the preview is pixel-perfect identical.

const REFERENCE_W = 1600;
const REFERENCE_H = 1000;

const TITLE_X = 32;
const TITLE_Y = 48;
const SUBTITLE_Y = 78;

const MAP_BOX = { x: 0, y: 92, w: 1600, h: 808 };
const PR_INSET = { x: 1380, y: 760, w: 200, h: 140 };

const LEGEND = { x: 32, y: 922, w: 360, h: 14 };
const LEGEND_LABEL_Y = LEGEND.y + LEGEND.h + 16;

// Pacific / Caribbean territories: GU / MP / VI carry claims data but can't be
// projected by geoAlbersUsa. Rendered as labeled color chips below the PR
// inset so the data slice stays visible. State-level only — at county/ZIP3 the
// aggregation level isn't a state postal, so the chip lookup is undefined.
const TERRITORY_CHIPS = {
    x: PR_INSET.x,
    y: PR_INSET.y + PR_INSET.h + 16,
    chipSize: 14,
    chipGap: 26,
};
const TERRITORY_POSTALS: readonly string[] = ["GU", "MP", "VI"];

const FOOTER_TEXT = "medicaid-dent-policy · choropleth synthesized via d3-geo";
const SOURCE_TEXT =
    "Data: HHS Medicaid Dental Claims 2018–2024 · CMS NPPES · ACS C27007 · U.S. Census TIGER/Line";
const FOOTER_X = 1568;
const SOURCE_Y = 954;
const FOOTER_Y = 970;

// Per-level visual tuning. Counties and ZIP3s are denser than states, so the
// stroke gets thinner and dimmer to avoid swamping the fill.
const LEVEL_STROKE: Record<GeoLevel, { color: string; width: number }> = {
    state: { color: "#6b7f7d", width: 0.6 },
    county: { color: "#9a948d", width: 0.2 },
    zip3: { color: "#7a756d", width: 0.35 },
};

// Soft cream wash painted under the main-projection polygons so the lightest
// quantile band (#f7f4ee) stays distinguishable from the page/canvas backdrop.
const MAP_BACKDROP = "#ece7df";

// ── Spherical winding repair ─────────────────────────────────
//
// d3-geo interprets polygon rings ON THE SPHERE: a ring wound the "wrong" way
// is read as the entire globe minus the enclosed area. public/zip3codes.geojson
// ships every ring in the opposite convention (geoArea reads 4π for all 896
// features), so without rewinding each ZIP3 fills the whole canvas and the
// last-drawn polygon's color wins — the empty-cream export bug. The county
// GeoJSON and the us-atlas TopoJSON are already d3-wound; the rewind is
// idempotent so it's applied to every GeoJSON-sourced level defensively.
// (MapLibre is unaffected: GPU tile fills ignore spherical winding, which is
// why the live ZIP3 choropleth always rendered fine.)
function rewindRings(rings: Position[][]): Position[][] {
    return rings.map((ring, i) => {
        const area = geoArea({ type: "Polygon", coordinates: [ring] });
        // Exterior rings (i=0) must enclose less than a hemisphere when read
        // standalone; holes the opposite, since they're wound against their
        // exterior. 2π steradians = half the sphere's 4π.
        const wrongWay = i === 0 ? area > 2 * Math.PI : area < 2 * Math.PI;
        return wrongWay ? [...ring].reverse() : ring;
    });
}

function rewindForD3(geom: Geometry): Geometry {
    if (geom.type === "Polygon") {
        return { type: "Polygon", coordinates: rewindRings(geom.coordinates) };
    }
    if (geom.type === "MultiPolygon") {
        return { type: "MultiPolygon", coordinates: geom.coordinates.map(rewindRings) };
    }
    return geom;
}

// ── Feature loaders (per level, cached module-scope) ──────────

// One row-shape for every level: `id` is the value the claims cache is keyed
// on (postal / GEOID / 3-digit ZIP3 prefix). PR routing is decided per-level
// (see splitPr*).
type LevelFeature = Feature<Geometry, { id: string }>;

interface LevelFeatures {
    main: LevelFeature[];
    pr: LevelFeature[];
}

interface StatesTopology extends Topology {
    objects: {
        states: GeometryCollection<{ name: string }>;
    };
}

const featuresCache: Partial<Record<GeoLevel, LevelFeatures>> = {};
const inflightCache: Partial<Record<GeoLevel, Promise<LevelFeatures>>> = {};

async function getStateFeatures(): Promise<LevelFeatures> {
    const BASE = import.meta.env.BASE_URL;
    const res = await fetch(`${BASE}data/export/states-10m.json`);
    if (!res.ok) throw new Error(`Failed to load states topology: HTTP ${res.status}`);
    const topo = (await res.json()) as StatesTopology;
    const fc = feature(topo, topo.objects.states) as FeatureCollection<Geometry, { name: string }>;
    const main: LevelFeature[] = [];
    const pr: LevelFeature[] = [];
    for (const f of fc.features) {
        const fips = String(f.id ?? "").padStart(2, "0");
        const postal = STATE_FIPS_TO_USPS[fips];
        if (!postal) continue;
        // Non-PR Pacific / Caribbean territories: claims data carries them but
        // geoAlbersUsa nulls their coordinates. Surfaced as chips below.
        if (TERRITORY_NON_PR_FIPS.has(fips)) continue;
        const enriched: LevelFeature = {
            type: "Feature",
            geometry: f.geometry,
            properties: { id: postal },
        };
        if (fips === PR_FIPS) pr.push(enriched);
        else main.push(enriched);
    }
    return { main, pr };
}

async function getCountyFeatures(): Promise<LevelFeatures> {
    const BASE = import.meta.env.BASE_URL;
    const res = await fetch(`${BASE}${COUNTY_GEOJSON}`);
    if (!res.ok) throw new Error(`Failed to load counties geojson: HTTP ${res.status}`);
    const fc = (await res.json()) as FeatureCollection<Geometry, { GEOID?: string; name?: string }>;
    const main: LevelFeature[] = [];
    const pr: LevelFeature[] = [];
    for (const f of fc.features) {
        const geoid = f.properties?.GEOID;
        if (!geoid) continue;
        const enriched: LevelFeature = {
            type: "Feature",
            geometry: rewindForD3(f.geometry),
            properties: { id: geoid },
        };
        // PR municipios: 5-digit FIPS starts with "72". Routed to the inset.
        if (geoid.startsWith(PR_FIPS)) pr.push(enriched);
        else main.push(enriched);
    }
    return { main, pr };
}

// ZIP3 prefixes that share the PR inset: 006-007 + 009 are Puerto Rico
// proper, 008 is the U.S. Virgin Islands. All four sit outside geoAlbersUsa's
// coverage so they're rendered through the Mercator inset rather than dropped.
const PR_ZIP3_PREFIXES = new Set(["006", "007", "008", "009"]);

// ZIP3 prefixes entirely outside geoAlbersUsa's (continental + AK + HI)
// coverage: 969 is Guam / CNMI / Marshall Islands / Palau / Micronesia / FSM,
// clustered around lng 144°E. Every point projects to null, so the feature
// can never render — dropped for clarity. 967 (Hawaii outer islands) stays:
// its Maui/Kauai/Big Island polygons render through the Hawaii sub-projection
// and its American Samoa tail is silently clipped, which is the right outcome.
const ZIP3_OUTSIDE_ALBERS_USA = new Set(["969"]);

async function getZip3Features(): Promise<LevelFeatures> {
    const BASE = import.meta.env.BASE_URL;
    const res = await fetch(`${BASE}zip3codes.geojson`);
    if (!res.ok) throw new Error(`Failed to load zip3codes geojson: HTTP ${res.status}`);
    const fc = (await res.json()) as FeatureCollection<Geometry, { "3dig_zip"?: string }>;
    const main: LevelFeature[] = [];
    const pr: LevelFeature[] = [];
    for (const f of fc.features) {
        const zip3 = f.properties?.["3dig_zip"];
        if (!zip3) continue;
        if (ZIP3_OUTSIDE_ALBERS_USA.has(zip3)) continue;
        const enriched: LevelFeature = {
            type: "Feature",
            geometry: rewindForD3(f.geometry),
            properties: { id: zip3 },
        };
        if (PR_ZIP3_PREFIXES.has(zip3)) pr.push(enriched);
        else main.push(enriched);
    }
    return { main, pr };
}

async function getFeaturesForLevel(level: GeoLevel): Promise<LevelFeatures> {
    const cached = featuresCache[level];
    if (cached) return cached;
    const inflight = inflightCache[level];
    if (inflight) return inflight;
    const loader =
        level === "state"
            ? getStateFeatures
            : level === "county"
              ? getCountyFeatures
              : getZip3Features;
    const promise = loader().then((fs) => {
        featuresCache[level] = fs;
        return fs;
    });
    inflightCache[level] = promise;
    try {
        return await promise;
    } finally {
        delete inflightCache[level];
    }
}

// ── Render args ──────────────────────────────────────────────

export interface RenderArgs {
    activeLayer: LayerKey;
    year: string;
    metric: Metric;
    level: GeoLevel;
    scale?: number;
}

// ── Helpers ─────────────────────────────────────────────────

function fitProjection(
    projection: GeoProjection,
    box: { x: number; y: number; w: number; h: number },
    features: LevelFeature[],
): GeoProjection {
    const fc: FeatureCollection<Geometry> = {
        type: "FeatureCollection",
        features: features as Feature<Geometry>[],
    };
    return projection.fitExtent(
        [
            [box.x, box.y],
            [box.x + box.w, box.y + box.h],
        ],
        fc as GeoPermissibleObjects,
    );
}

function drawTitleBlock(
    ctx: CanvasRenderingContext2D,
    layerLabel: string,
    period: string,
    metricLabel: string,
    levelLabel: string,
): void {
    ctx.fillStyle = "#1a1917";
    ctx.font = "600 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`Medicaid Dental Claims · ${layerLabel}`, TITLE_X, TITLE_Y);
    ctx.fillStyle = "#6b6660";
    ctx.font = "400 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(`${period} · ${levelLabel} · ${metricLabel}`, TITLE_X, SUBTITLE_Y);
}

function drawLegend(ctx: CanvasRenderingContext2D, stops: number[], metric: Metric): void {
    const segW = LEGEND.w / N_STOPS;
    for (let i = 0; i < N_STOPS; i++) {
        ctx.fillStyle = CHOROPLETH_COLORS[i];
        ctx.fillRect(LEGEND.x + i * segW, LEGEND.y, segW, LEGEND.h);
    }
    ctx.strokeStyle = "#b3aea4";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(LEGEND.x, LEGEND.y, LEGEND.w, LEGEND.h);

    ctx.fillStyle = "#6b6660";
    ctx.font = "500 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    const title = metric === "enrollees" ? "Claims per Medicaid enrollee" : "Total claims";
    ctx.fillText(title, LEGEND.x, LEGEND.y - 8);

    ctx.textAlign = "center";
    const fmt = (v: number): string => {
        if (metric === "enrollees") {
            return v >= 10 ? v.toFixed(0) : v.toFixed(2);
        }
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
        return String(Math.round(v));
    };
    const labelIdxs = [0, Math.floor(N_STOPS / 2), N_STOPS - 1];
    for (const i of labelIdxs) {
        ctx.fillText(fmt(stops[i] ?? 0), LEGEND.x + (i + 0.5) * segW, LEGEND_LABEL_Y);
    }
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#9a948d";
    ctx.font = "400 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(SOURCE_TEXT, FOOTER_X, SOURCE_Y);
    ctx.fillText(FOOTER_TEXT, FOOTER_X, FOOTER_Y);
}

function drawPrInsetFrame(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "#b3aea4";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(PR_INSET.x, PR_INSET.y, PR_INSET.w, PR_INSET.h);
    ctx.fillStyle = "#6b6660";
    ctx.font = "600 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("PR", PR_INSET.x + 6, PR_INSET.y + 14);
}

function drawTerritoryChips(
    ctx: CanvasRenderingContext2D,
    valueFor: Record<string, number>,
    stops: number[],
): void {
    const { x, y, chipSize, chipGap } = TERRITORY_CHIPS;
    ctx.fillStyle = "#6b6660";
    ctx.font = "600 9px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PACIFIC · CARIBBEAN", x, y - 4);

    let cx = x;
    for (const postal of TERRITORY_POSTALS) {
        const v = valueFor[postal] ?? 0;
        ctx.fillStyle = colorForValue(v, stops);
        ctx.fillRect(cx, y + 4, chipSize, chipSize);
        ctx.strokeStyle = "#b3aea4";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, y + 4, chipSize, chipSize);

        ctx.fillStyle = "#1a1917";
        ctx.font = "500 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(postal, cx + chipSize + 4, y + 4 + chipSize / 2 + 1);

        cx += chipGap + 8;
    }
}

const LEVEL_LABEL: Record<GeoLevel, string> = {
    state: "State level",
    county: "County level",
    zip3: "ZIP3 level",
};

// ── Main render ─────────────────────────────────────────────

/**
 * Render a Wikipedia-style synthesized choropleth to an offscreen canvas.
 * The level selects which geometry source to load and which annual cache to
 * read values from. The 1600×1000 reference layout is unchanged across levels
 * (county/ZIP3 just paint denser polygons and thinner strokes).
 */
export async function renderSynthesizedMap(args: RenderArgs): Promise<HTMLCanvasElement> {
    const { activeLayer, year, metric, level, scale = 1 } = args;

    const features = await getFeaturesForLevel(level);
    const annualData = getAnnualDataForLevel(level);

    // Resolve a value for every feature plus, at state level, the territory
    // chips. Stops use the same quantileStops as the live map so the export
    // matches the on-screen ramp by construction. Values are computed inline
    // from the level's annual cache — no intermediate lookup table to drift
    // out of sync with the render loop.
    const featureValue = (f: LevelFeature): number => {
        const id = f.properties.id;
        const enrollees = metric === "enrollees" ? getEnrolleesFor(level, id, year) : null;
        return getValueForRegion(annualData[id], year, activeLayer, metric, enrollees);
    };

    const values: number[] = [];
    for (const f of features.main) {
        const v = featureValue(f);
        if (Number.isFinite(v) && v > 0) values.push(v);
    }
    for (const f of features.pr) {
        const v = featureValue(f);
        if (Number.isFinite(v) && v > 0) values.push(v);
    }
    if (level === "state") {
        for (const postal of TERRITORY_POSTALS) {
            const enrollees = metric === "enrollees" ? getEnrolleesFor(level, postal, year) : null;
            const v = getValueForRegion(annualData[postal], year, activeLayer, metric, enrollees);
            if (Number.isFinite(v) && v > 0) values.push(v);
        }
    }
    const stops = quantileStops(values, metric);

    // Build a value lookup for the chip drawer (state only) so it doesn't
    // need to recompute.
    const valueForChip: Record<string, number> = {};
    if (level === "state") {
        for (const postal of TERRITORY_POSTALS) {
            const enrollees = metric === "enrollees" ? getEnrolleesFor(level, postal, year) : null;
            valueForChip[postal] = getValueForRegion(
                annualData[postal],
                year,
                activeLayer,
                metric,
                enrollees,
            );
        }
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(REFERENCE_W * scale);
    canvas.height = Math.round(REFERENCE_H * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    if (scale !== 1) ctx.scale(scale, scale);

    const strokeStyle = LEVEL_STROKE[level];

    // Paint the main-map backdrop first. Without this, lightest-band fills
    // (#f7f4ee) blend into the page background and the export looks empty,
    // most visibly at ZIP3 level where most low-claim regions sit in band 0.
    ctx.fillStyle = MAP_BACKDROP;
    ctx.fillRect(MAP_BOX.x, MAP_BOX.y, MAP_BOX.w, MAP_BOX.h);

    // Main projection: Albers USA — auto-positions AK/HI for state, and the
    // sub-state polygons within them for county/ZIP3.
    const mainProjection = fitProjection(geoAlbersUsa(), MAP_BOX, features.main);
    const mainPath = geoPath(mainProjection, ctx);

    for (const f of features.main) {
        ctx.beginPath();
        mainPath(f);
        ctx.fillStyle = colorForValue(featureValue(f), stops);
        ctx.fill();
        ctx.strokeStyle = strokeStyle.color;
        ctx.lineWidth = strokeStyle.width;
        ctx.stroke();
    }

    drawPrInsetFrame(ctx);
    if (features.pr.length > 0) {
        const prProjection = fitProjection(geoMercator(), PR_INSET, features.pr);
        const prPath = geoPath(prProjection, ctx);
        for (const f of features.pr) {
            ctx.beginPath();
            prPath(f);
            ctx.fillStyle = colorForValue(featureValue(f), stops);
            ctx.fill();
            ctx.strokeStyle = strokeStyle.color;
            ctx.lineWidth = Math.min(strokeStyle.width, 0.4);
            ctx.stroke();
        }
    }

    // Territory chips lookup by USPS postal — not defined at county/ZIP3, so
    // skip there. The county/ZIP3 polygons for those territories project to
    // null on AlbersUsa and are silently dropped (documented limitation).
    if (level === "state") drawTerritoryChips(ctx, valueForChip, stops);

    const layerLabel = LAYER_CONFIGS[activeLayer]?.label ?? activeLayer;
    const metricLabel = metric === "enrollees" ? "Per Medicaid enrollee" : "Volume";
    drawTitleBlock(ctx, layerLabel, year, metricLabel, LEVEL_LABEL[level]);
    drawLegend(ctx, stops, metric);
    drawFooter(ctx);

    return canvas;
}

// ── Public API: canvas → blob ─────────────────────────────────

export async function canvasToBlob(
    canvas: HTMLCanvasElement,
    format: "png" | "jpeg",
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        if (format === "jpeg") {
            const out = document.createElement("canvas");
            out.width = canvas.width;
            out.height = canvas.height;
            const ctx = out.getContext("2d");
            if (!ctx) {
                reject(new Error("2D canvas context unavailable"));
                return;
            }
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(canvas, 0, 0);
            out.toBlob(
                (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
                "image/jpeg",
                0.92,
            );
            return;
        }
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
            "image/png",
        );
    });
}

export function imageFilename(
    activeLayer: LayerKey,
    year: string,
    level: GeoLevel,
    format: "png" | "jpeg",
): string {
    const ext = format === "jpeg" ? "jpg" : "png";
    return `medicaid-dental_${activeLayer}_${year}_${level}.${ext}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
