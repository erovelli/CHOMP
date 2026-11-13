import {
    recordPeriod,
    type LayerKey,
    type GeoLevel,
    type Metric,
    type ClaimsRecord,
    type DataRecord,
    type MonthlyDataRecord,
    type EnrollmentRecord,
    type DqData,
    type DqTopicKey,
    type DqStateRecord,
} from "./types";
import { CATEGORY_TO_KEY, COUNTY_GEOJSON, DATA_PATHS, GEO_LEVEL_KEYS } from "../constants/map";
import { DQ_DATA_PATH } from "../constants/dq";

// ── Module-level caches, keyed by geography level then region id ──
type ByLevel<T> = Record<GeoLevel, Record<string, T[]>>;

function emptyByLevel<T>(): ByLevel<T> {
    return { state: {}, county: {}, zip3: {} };
}

let annualCache = emptyByLevel<DataRecord>();
let monthlyCache = emptyByLevel<MonthlyDataRecord>();
// ACS C27007 Medicaid enrollment by geography-year. Endpoint years 2018-2024.
// Built by scripts/build_medicaid_enrollment.py; rolled up from county (state)
// and ZCTA (zip3). Same NDJSON shape as the procedure-category aggregates so it
// flows through the same fetchNDJSON parser.
let enrollmentCache = emptyByLevel<EnrollmentRecord>();

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

/** Fetch one NDJSON file per level. Rejects if any level fails. */
async function fetchAllLevels<T>(paths: Record<GeoLevel, string>): Promise<ByLevel<T>> {
    const BASE = import.meta.env.BASE_URL;
    const results = await Promise.all(
        GEO_LEVEL_KEYS.map((level) => fetchNDJSON<T>(`${BASE}${paths[level]}`)),
    );
    const byLevel = emptyByLevel<T>();
    GEO_LEVEL_KEYS.forEach((level, i) => {
        byLevel[level] = results[i];
    });
    return byLevel;
}

// ── Annual data ───────────────────────────────────────────────

export async function loadAnnualData(): Promise<void> {
    // Core claims data: required for any view. Failure here is fatal.
    annualCache = await fetchAllLevels<DataRecord>(DATA_PATHS.annual);

    // Enrollment denominators: only needed for the Per-enrollee rate metric.
    // Fetch with allSettled so a missing/broken denominator file degrades the
    // app to "Volume-only" instead of failing the whole load. Missing
    // geographies are surfaced as null in getEnrolleesFor (not silently zero).
    const BASE = import.meta.env.BASE_URL;
    const settled = await Promise.allSettled(
        GEO_LEVEL_KEYS.map((level) =>
            fetchNDJSON<EnrollmentRecord>(`${BASE}${DATA_PATHS.enrollment[level]}`),
        ),
    );
    const enrollment = emptyByLevel<EnrollmentRecord>();
    const failed: GeoLevel[] = [];
    settled.forEach((result, i) => {
        const level = GEO_LEVEL_KEYS[i];
        if (result.status === "fulfilled") enrollment[level] = result.value;
        else failed.push(level);
    });
    enrollmentCache = enrollment;
    if (failed.length) {
        console.warn(
            `ACS enrollment fetch failed for: ${failed.join(", ")}. ` +
                `Per-enrollee metric will be unavailable for those levels.`,
        );
    }
}

export function getAnnualDataForLevel(level: GeoLevel): Record<string, DataRecord[]> {
    return annualCache[level];
}

// ── Monthly data (lazy-loaded) ────────────────────────────────

export async function loadMonthlyData(): Promise<void> {
    if (Object.keys(monthlyCache.state).length > 0) return;
    monthlyCache = await fetchAllLevels<MonthlyDataRecord>(DATA_PATHS.monthly);
}

export function getMonthlyDataForLevel(level: GeoLevel): Record<string, MonthlyDataRecord[]> {
    return monthlyCache[level];
}

// ── Enrollment lookup ─────────────────────────────────────────

export function getEnrollmentForLevel(level: GeoLevel): Record<string, EnrollmentRecord[]> {
    return enrollmentCache[level];
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
    const recs = enrollmentCache[level][id];
    if (!recs) return null;
    const hit = recs.find((r) => r.year === year);
    return hit ? hit.medicaid_enrollees : null;
}

// ── County name lookup (subset-export region picker) ──────────
// counties.geojson (the map's county source) carries a human-readable `name`
// property ("Autauga County, AL") keyed by 5-digit GEOID. The custom-subset
// region picker needs those labels. Parse once and memoize; the fetch hits the
// browser cache after the map's initial county load, so it's effectively free.
let countyNamesCache: Record<string, string> | null = null;
let countyNamesPromise: Promise<Record<string, string>> | null = null;

export async function getCountyNames(): Promise<Record<string, string>> {
    if (countyNamesCache) return countyNamesCache;
    if (countyNamesPromise) return countyNamesPromise;
    const BASE = import.meta.env.BASE_URL;
    countyNamesPromise = (async () => {
        const res = await fetch(`${BASE}${COUNTY_GEOJSON}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geo = (await res.json()) as {
            features?: Array<{ id?: string; properties?: { GEOID?: string; name?: string } }>;
        };
        const names: Record<string, string> = {};
        for (const f of geo.features ?? []) {
            const id = f.properties?.GEOID ?? f.id;
            const name = f.properties?.name;
            if (id && name) names[id] = name;
        }
        countyNamesCache = names;
        return names;
    })().catch((err) => {
        // Allow a later retry rather than caching the rejection forever.
        countyNamesPromise = null;
        throw err;
    });
    return countyNamesPromise;
}

// ── Value computation ─────────────────────────────────────────

/**
 * Choropleth value for one region's records. `period` is a year ("2023") for
 * annual records or a year-month ("2023-06") for monthly ones.
 */
export function getValueForRegion(
    records: ClaimsRecord[] | undefined,
    period: string,
    activeLayer: LayerKey,
    metric: Metric = "claims",
    enrollees: number | null = null,
): number {
    if (!records) return 0;
    const rows = records.filter(
        (r) =>
            recordPeriod(r) === period &&
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

/** True for a "YYYY-MM" period, false for a bare "YYYY" year. */
export function isMonthlyPeriod(period: string): boolean {
    return period.includes("-");
}

/**
 * Choropleth value for a region looked up from the loaded caches. A monthly
 * period reads the monthly cache; ACS enrollment is annual, so the rate
 * metric uses the period's year as the denominator either way.
 */
export function getRegionValue(
    level: GeoLevel,
    id: string,
    period: string,
    activeLayer: LayerKey,
    metric: Metric,
): number {
    const cache = isMonthlyPeriod(period) ? monthlyCache : annualCache;
    const enrollees =
        metric === "enrollees" ? getEnrolleesFor(level, id, period.slice(0, 4)) : null;
    return getValueForRegion(cache[level][id], period, activeLayer, metric, enrollees);
}

// ── DQ Atlas ──────────────────────────────────────────────────
// Single JSON blob (not NDJSON) — the file is small enough (~40 KB gz) that
// there's no benefit to streaming, and a single fetch simplifies the loader.

let dqAtlasCache: DqData | null = null;
let dqAtlasPromise: Promise<DqData | null> | null = null;

export async function loadDqAtlas(): Promise<DqData | null> {
    if (dqAtlasCache) return dqAtlasCache;
    if (dqAtlasPromise) return dqAtlasPromise;
    const BASE = import.meta.env.BASE_URL;
    dqAtlasPromise = (async () => {
        try {
            const res = await fetch(`${BASE}${DQ_DATA_PATH}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            dqAtlasCache = (await res.json()) as DqData;
            return dqAtlasCache;
        } catch (err) {
            // Overlay is optional — a missing/broken atlas file degrades to
            // "no overlay" rather than failing the whole map load.
            console.warn(`DQ Atlas load failed: ${(err as Error).message}. Overlay disabled.`);
            dqAtlasPromise = null;
            return null;
        }
    })();
    return dqAtlasPromise;
}

/** Look up one state's DQ record for a (topic, year). Returns undefined when
 * the topic doesn't cover the year, the state isn't in the DQ Atlas, or the
 * atlas hasn't loaded. Callers must handle undefined gracefully. */
export function getDqRecord(
    data: DqData | null,
    topic: DqTopicKey,
    year: string,
    stateUsps: string,
): DqStateRecord | undefined {
    return data?.topics[topic]?.years[year]?.[stateUsps];
}

/** True if the atlas has data for (topic, year). LeftRail uses it to show a
 * "no data for <year>" hint next to the Data quality heading. */
export function dqHasYear(data: DqData | null, topic: DqTopicKey, year: string): boolean {
    const yearBucket = data?.topics[topic]?.years[year];
    return !!yearBucket && Object.keys(yearBucket).length > 0;
}
