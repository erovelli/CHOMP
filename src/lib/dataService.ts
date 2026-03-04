import type { LayerKey, DataRecord, MonthlyDataRecord } from "./types";
import { CATEGORY_TO_KEY, DATA_PATHS } from "../constants/map";

// ── Module-level caches ───────────────────────────────────────
let stateAnnualCache: Record<string, DataRecord[]> = {};
let zip3AnnualCache: Record<string, DataRecord[]> = {};
let stateMonthlyCache: Record<string, MonthlyDataRecord[]> = {};
let zip3MonthlyCache: Record<string, MonthlyDataRecord[]> = {};

// ── NDJSON parser ─────────────────────────────────────────────

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
            if (key === "") continue;
            result[key] = records;
        }
    }
    return result;
}

// ── Annual data ───────────────────────────────────────────────

export async function loadAnnualData(): Promise<void> {
    const BASE = import.meta.env.BASE_URL;
    const [stateData, zip3Data] = await Promise.all([
        fetchNDJSON<DataRecord>(`${BASE}${DATA_PATHS.annualState}`),
        fetchNDJSON<DataRecord>(`${BASE}${DATA_PATHS.annualZip3}`),
    ]);
    stateAnnualCache = stateData;
    zip3AnnualCache = zip3Data;
    console.log(`Loaded annual data: ${Object.keys(stateData).length} states, ${Object.keys(zip3Data).length} zip3`);
}

export function getStateAnnualData(): Record<string, DataRecord[]> {
    return stateAnnualCache;
}

export function getZip3AnnualData(): Record<string, DataRecord[]> {
    return zip3AnnualCache;
}

// ── Monthly data (lazy-loaded) ────────────────────────────────

export async function loadMonthlyData(): Promise<void> {
    if (Object.keys(stateMonthlyCache).length > 0) return;
    const BASE = import.meta.env.BASE_URL;
    const [stateData, zip3Data] = await Promise.all([
        fetchNDJSON<MonthlyDataRecord>(`${BASE}${DATA_PATHS.monthlyState}`),
        fetchNDJSON<MonthlyDataRecord>(`${BASE}${DATA_PATHS.monthlyZip3}`),
    ]);
    stateMonthlyCache = stateData;
    zip3MonthlyCache = zip3Data;
    console.log(`Loaded monthly data: ${Object.keys(stateData).length} states, ${Object.keys(zip3Data).length} zip3`);
}

export function getMonthlyRecords(id: string, level: "state" | "zip3"): MonthlyDataRecord[] {
    const cache = level === "state" ? stateMonthlyCache : zip3MonthlyCache;
    return cache[id] ?? [];
}

// ── Value computation ─────────────────────────────────────────

export function getValueForRegion(
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
