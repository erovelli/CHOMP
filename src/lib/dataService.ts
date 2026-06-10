import type {
    LayerKey,
    GeoLevel,
    Metric,
    DataRecord,
    MonthlyDataRecord,
    EnrollmentRecord,
} from "./types";
import { CATEGORY_TO_KEY, DATA_PATHS } from "../constants/map";

// ── Module-level caches ───────────────────────────────────────
let stateAnnualCache: Record<string, DataRecord[]> = {};
let countyAnnualCache: Record<string, DataRecord[]> = {};
let zip3AnnualCache: Record<string, DataRecord[]> = {};
let stateMonthlyCache: Record<string, MonthlyDataRecord[]> = {};
let countyMonthlyCache: Record<string, MonthlyDataRecord[]> = {};
let zip3MonthlyCache: Record<string, MonthlyDataRecord[]> = {};
// ACS C27007 Medicaid enrollment by geography-year. Endpoint years 2018-2024.
// Built by scripts/build_medicaid_enrollment.py; rolled up from county (state)
// and ZCTA (zip3). Same NDJSON shape as the procedure-category aggregates so it
// flows through the same fetchNDJSON parser.
let stateEnrollmentCache: Record<string, EnrollmentRecord[]> = {};
let countyEnrollmentCache: Record<string, EnrollmentRecord[]> = {};
let zip3EnrollmentCache: Record<string, EnrollmentRecord[]> = {};

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
    // Core claims data: required for any view. Failure here is fatal.
    const [stateData, countyData, zip3Data] = await Promise.all([
        fetchNDJSON<DataRecord>(`${BASE}${DATA_PATHS.annualState}`),
        fetchNDJSON<DataRecord>(`${BASE}${DATA_PATHS.annualCounty}`),
        fetchNDJSON<DataRecord>(`${BASE}${DATA_PATHS.annualZip3}`),
    ]);
    stateAnnualCache = stateData;
    countyAnnualCache = countyData;
    zip3AnnualCache = zip3Data;

    // Enrollment denominators: only needed for the Per-enrollee rate metric.
    // Fetch with allSettled so a missing/broken denominator file degrades the
    // app to "Volume-only" instead of failing the whole load. Missing
    // geographies are surfaced as null in getEnrolleesFor (not silently zero).
    const enrollment = await Promise.allSettled([
        fetchNDJSON<EnrollmentRecord>(`${BASE}${DATA_PATHS.enrollmentState}`),
        fetchNDJSON<EnrollmentRecord>(`${BASE}${DATA_PATHS.enrollmentCounty}`),
        fetchNDJSON<EnrollmentRecord>(`${BASE}${DATA_PATHS.enrollmentZip3}`),
    ]);
    const [stateEnroll, countyEnroll, zip3Enroll] = enrollment.map((r) =>
        r.status === "fulfilled" ? r.value : ({} as Record<string, EnrollmentRecord[]>),
    );
    stateEnrollmentCache = stateEnroll;
    countyEnrollmentCache = countyEnroll;
    zip3EnrollmentCache = zip3Enroll;
    const failed = enrollment
        .map((r, i) => (r.status === "rejected" ? ["state", "county", "zip3"][i] : null))
        .filter((x): x is string => x !== null);
    if (failed.length) {
        console.warn(
            `ACS enrollment fetch failed for: ${failed.join(", ")}. ` +
                `Per-enrollee metric will be unavailable for those levels.`,
        );
    }
    console.log(
        `Loaded annual data: ${Object.keys(stateData).length} states, ` +
            `${Object.keys(countyData).length} counties, ${Object.keys(zip3Data).length} zip3 ` +
            `(+ ACS enrollment: ${Object.keys(stateEnroll).length}/${Object.keys(countyEnroll).length}/${Object.keys(zip3Enroll).length})`,
    );
}

export function getStateAnnualData(): Record<string, DataRecord[]> {
    return stateAnnualCache;
}

export function getCountyAnnualData(): Record<string, DataRecord[]> {
    return countyAnnualCache;
}

export function getZip3AnnualData(): Record<string, DataRecord[]> {
    return zip3AnnualCache;
}

export function getAnnualDataForLevel(level: GeoLevel): Record<string, DataRecord[]> {
    if (level === "state") return stateAnnualCache;
    if (level === "county") return countyAnnualCache;
    return zip3AnnualCache;
}

// ── Monthly data (lazy-loaded) ────────────────────────────────

export async function loadMonthlyData(): Promise<void> {
    if (Object.keys(stateMonthlyCache).length > 0) return;
    const BASE = import.meta.env.BASE_URL;
    const [stateData, countyData, zip3Data] = await Promise.all([
        fetchNDJSON<MonthlyDataRecord>(`${BASE}${DATA_PATHS.monthlyState}`),
        fetchNDJSON<MonthlyDataRecord>(`${BASE}${DATA_PATHS.monthlyCounty}`),
        fetchNDJSON<MonthlyDataRecord>(`${BASE}${DATA_PATHS.monthlyZip3}`),
    ]);
    stateMonthlyCache = stateData;
    countyMonthlyCache = countyData;
    zip3MonthlyCache = zip3Data;
    console.log(
        `Loaded monthly data: ${Object.keys(stateData).length} states, ` +
            `${Object.keys(countyData).length} counties, ${Object.keys(zip3Data).length} zip3`,
    );
}

export function getMonthlyRecords(id: string, level: GeoLevel): MonthlyDataRecord[] {
    const cache =
        level === "state"
            ? stateMonthlyCache
            : level === "county"
              ? countyMonthlyCache
              : zip3MonthlyCache;
    return cache[id] ?? [];
}

export function getMonthlyDataForLevel(level: GeoLevel): Record<string, MonthlyDataRecord[]> {
    if (level === "state") return stateMonthlyCache;
    if (level === "county") return countyMonthlyCache;
    return zip3MonthlyCache;
}

// ── Enrollment lookup ─────────────────────────────────────────

export function getEnrollmentForLevel(level: GeoLevel): Record<string, EnrollmentRecord[]> {
    if (level === "state") return stateEnrollmentCache;
    if (level === "county") return countyEnrollmentCache;
    return zip3EnrollmentCache;
}

/**
 * ACS endpoint-year medicaid enrollees for (level, id, year). Returns `null`
 * when the geography has no enrollment record at all (territories the ACS
 * doesn't cover, ZIP3s outside the ACS ZCTA universe, geographies dropped
 * upstream). The value functions propagate `null` as `NaN` for the rate
 * metric so the choropleth can distinguish "no denominator data" from
 * "true zero rate" instead of silently painting both at the bottom of the
 * scale. See L37 in docs/LIMITATIONS.md.
 */
export function getEnrolleesFor(level: GeoLevel, id: string, year: string): number | null {
    const recs = getEnrollmentForLevel(level)[id];
    if (!recs) return null;
    const hit = recs.find((r) => r.year === year);
    return hit ? hit.medicaid_enrollees : null;
}

// ── Value computation ─────────────────────────────────────────

export function getValueForRegion(
    records: DataRecord[] | undefined,
    year: string,
    activeLayer: LayerKey,
    metric: Metric = "claims",
    enrollees: number | null = null,
): number {
    if (!records) return 0;
    const rows = records.filter(
        (r) =>
            r.year === year &&
            (activeLayer === "all" || CATEGORY_TO_KEY[r.category] === activeLayer),
    );
    const claims = rows.reduce((sum, r) => sum + r.total_claims, 0);
    if (metric === "claims") return claims;
    // enrollees: ACS C27007 denominator — same for every category, no double-
    // counting at "all". Missing denominator → NaN (not 0), so the renderer
    // doesn't conflate "no data" with a true 0 rate.
    if (enrollees == null || enrollees <= 0) return Number.NaN;
    return claims / enrollees;
}

/** Monthly counterpart of getValueForRegion — same shape, filters on year_month. */
export function getValueForRegionMonthly(
    records: MonthlyDataRecord[] | undefined,
    yearMonth: string,
    activeLayer: LayerKey,
    metric: Metric = "claims",
    enrollees: number | null = null,
): number {
    if (!records) return 0;
    const rows = records.filter(
        (r) =>
            r.year_month === yearMonth &&
            (activeLayer === "all" || CATEGORY_TO_KEY[r.category] === activeLayer),
    );
    const claims = rows.reduce((sum, r) => sum + r.total_claims, 0);
    if (metric === "claims") return claims;
    // enrollees: ACS is annual; reuse the endpoint-year enrollment for every month.
    if (enrollees == null || enrollees <= 0) return Number.NaN;
    return claims / enrollees;
}
