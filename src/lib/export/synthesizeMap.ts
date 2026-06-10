import {
    geoAlbersUsa,
    geoMercator,
    geoPath,
    type GeoProjection,
    type GeoPermissibleObjects,
} from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import type { DataRecord, LayerKey, Metric } from "../types";
import { CHOROPLETH_COLORS, N_STOPS, quantileStops } from "../mapStyles";
import { LAYER_CONFIGS } from "../../constants/map";
import { STATE_FIPS_TO_USPS, PR_FIPS, TERRITORY_NON_PR_FIPS } from "../../constants/stateFips";
import { colorForValue } from "./colorScale";
import { getValueForRegion, getEnrolleesFor } from "../dataService";

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
// projected by geoAlbersUsa. Render them as labeled color chips below the PR
// inset so the data slice is still visible on the export.
const TERRITORY_CHIPS = {
    x: PR_INSET.x,
    y: PR_INSET.y + PR_INSET.h + 16,
    chipSize: 14,
    chipGap: 26, // square + label + gutter
};
const TERRITORY_POSTALS: readonly string[] = ["GU", "MP", "VI"];

const FOOTER_TEXT = "medicaid-dent-policy · choropleth synthesized via d3-geo";
const FOOTER_X = 1568;
const FOOTER_Y = 970;

// ── TopoJSON loader (cached) ─────────────────────────────────

interface StatesTopology extends Topology {
    objects: {
        states: GeometryCollection<{ name: string }>;
    };
}

type StateFeature = Feature<Geometry, { name: string; fips: string; postal: string }>;

let topologyPromise: Promise<StatesTopology> | null = null;
let featuresCache: { main: StateFeature[]; pr: StateFeature[] } | null = null;

async function loadTopology(): Promise<StatesTopology> {
    if (topologyPromise) return topologyPromise;
    const BASE = import.meta.env.BASE_URL;
    topologyPromise = fetch(`${BASE}data/export/states-10m.json`).then(async (res) => {
        if (!res.ok) {
            throw new Error(`Failed to load states topology: HTTP ${res.status}`);
        }
        return (await res.json()) as StatesTopology;
    });
    return topologyPromise;
}

async function getStateFeatures(): Promise<{ main: StateFeature[]; pr: StateFeature[] }> {
    if (featuresCache) return featuresCache;
    const topo = await loadTopology();
    const fc = feature(topo, topo.objects.states) as FeatureCollection<Geometry, { name: string }>;
    const main: StateFeature[] = [];
    const pr: StateFeature[] = [];
    for (const f of fc.features) {
        // us-atlas exposes the 2-digit FIPS as the TopoJSON id (string).
        const fips = String(f.id ?? "").padStart(2, "0");
        const postal = STATE_FIPS_TO_USPS[fips];
        if (!postal) continue;
        // Non-PR Pacific / Caribbean territories: claims data carries them
        // but geoAlbersUsa projects their coordinates to null. Render them in
        // the CSV (via stateFips name lookup) and skip the polygon here. To
        // add them to the synthesized map, give each a dedicated Mercator
        // inset like PR.
        if (TERRITORY_NON_PR_FIPS.has(fips)) continue;
        const enriched: StateFeature = {
            type: "Feature",
            geometry: f.geometry,
            properties: { name: f.properties?.name ?? postal, fips, postal },
        };
        if (fips === PR_FIPS) pr.push(enriched);
        else main.push(enriched);
    }
    featuresCache = { main, pr };
    return featuresCache;
}

// ── Render args ──────────────────────────────────────────────

export interface RenderArgs {
    activeLayer: LayerKey;
    year: string; // 4-digit year; the synthesized map is annual-only by design.
    metric: Metric;
    stateAnnualData: Record<string, DataRecord[]>;
    // Optional pre-computed per-state value override (postal → numeric value).
    // Lets callers reuse a value table they already built; otherwise the
    // renderer derives one with `getValueForRegion` + `getEnrolleesFor`.
    valueByPostal?: Record<string, number>;
    scale?: number; // 0 < scale ≤ 1; preview defaults to 0.3
}

// ── Helpers ─────────────────────────────────────────────────

function fitProjection(
    projection: GeoProjection,
    box: { x: number; y: number; w: number; h: number },
    features: StateFeature[],
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
): void {
    ctx.fillStyle = "#1a1917";
    ctx.font = "600 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`Medicaid Dental Claims · ${layerLabel}`, TITLE_X, TITLE_Y);
    ctx.fillStyle = "#6b6660";
    ctx.font = "400 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(`${period} · ${metricLabel}`, TITLE_X, SUBTITLE_Y);
}

function drawLegend(ctx: CanvasRenderingContext2D, stops: number[], metric: Metric): void {
    // Bar with 7 palette swatches and stop labels under the inner ticks.
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
    // Label the min, midpoint, and max stops so the bar stays uncluttered.
    const labelIdxs = [0, Math.floor(N_STOPS / 2), N_STOPS - 1];
    for (const i of labelIdxs) {
        ctx.fillText(fmt(stops[i] ?? 0), LEGEND.x + (i + 0.5) * segW, LEGEND_LABEL_Y);
    }
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#9a948d";
    ctx.font = "400 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(FOOTER_TEXT, FOOTER_X, FOOTER_Y);
}

function drawPrInsetFrame(ctx: CanvasRenderingContext2D): void {
    // A thin frame and "PR" tag so the inset reads as a separate locator
    // instead of a stray polygon floating off the coast.
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

// ── Main render ─────────────────────────────────────────────

/**
 * Render a Wikipedia-style synthesized choropleth to an offscreen canvas. The
 * canvas is dimensioned `REFERENCE_W*scale × REFERENCE_H*scale`; layout coords
 * are written against the reference and a single `ctx.scale(s, s)` makes the
 * preview pass identical to the full-res pass.
 */
export async function renderSynthesizedMap(args: RenderArgs): Promise<HTMLCanvasElement> {
    const { activeLayer, year, metric, stateAnnualData, valueByPostal, scale = 1 } = args;

    const features = await getStateFeatures();

    // Resolve a value for every state we'll color anywhere on the export:
    // rendered polygons (main + PR) AND the non-PR territory chips. Stops
    // come from the same `quantileStops` helper as the runtime so the
    // exported ramp matches the on-screen ramp.
    const renderedPostals = new Set<string>();
    for (const f of features.main) renderedPostals.add(f.properties.postal);
    for (const f of features.pr) renderedPostals.add(f.properties.postal);
    const allPostals = new Set<string>([...renderedPostals, ...TERRITORY_POSTALS]);

    const values: number[] = [];
    const valueFor: Record<string, number> = {};
    for (const postal of allPostals) {
        let v: number;
        if (valueByPostal && postal in valueByPostal) {
            v = valueByPostal[postal];
        } else {
            const enrollees =
                metric === "enrollees" ? getEnrolleesFor("state", postal, year) : null;
            v = getValueForRegion(stateAnnualData[postal], year, activeLayer, metric, enrollees);
        }
        valueFor[postal] = v;
        if (Number.isFinite(v) && v > 0) values.push(v);
    }
    const stops = quantileStops(values, metric);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(REFERENCE_W * scale);
    canvas.height = Math.round(REFERENCE_H * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    if (scale !== 1) ctx.scale(scale, scale);

    // Main projection: Albers USA, auto-positions AK/HI (PR comes via the
    // separate Mercator inset below).
    const mainProjection = fitProjection(geoAlbersUsa(), MAP_BOX, features.main);
    const mainPath = geoPath(mainProjection, ctx);

    for (const f of features.main) {
        const fillColor = colorForValue(valueFor[f.properties.postal], stops);
        ctx.beginPath();
        mainPath(f);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = "#6b7f7d";
        ctx.lineWidth = 0.6;
        ctx.stroke();
    }

    // PR inset: fit the PR feature to the lower-right box. Frame drawn first
    // so the polygon paints on top of the frame stroke (cleaner edge).
    drawPrInsetFrame(ctx);
    if (features.pr.length > 0) {
        const prProjection = fitProjection(geoMercator(), PR_INSET, features.pr);
        const prPath = geoPath(prProjection, ctx);
        for (const f of features.pr) {
            const fillColor = colorForValue(valueFor[f.properties.postal], stops);
            ctx.beginPath();
            prPath(f);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = "#6b7f7d";
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    drawTerritoryChips(ctx, valueFor, stops);

    const layerLabel = LAYER_CONFIGS[activeLayer]?.label ?? activeLayer;
    const metricLabel = metric === "enrollees" ? "Per Medicaid enrollee" : "Volume";
    drawTitleBlock(ctx, layerLabel, year, metricLabel);
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
        // For JPEG the brief asks for white background; do the fill in a
        // throwaway intermediate canvas so the source canvas (used by the
        // preview) keeps its transparency.
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

export function imageFilename(activeLayer: LayerKey, year: string, format: "png" | "jpeg"): string {
    const ext = format === "jpeg" ? "jpg" : "png";
    return `medicaid-dental_${activeLayer}_${year}.${ext}`;
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
