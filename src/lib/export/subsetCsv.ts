import Papa from "papaparse";
import type { DataRecord, MonthlyDataRecord, EnrollmentRecord, GeoLevel, LayerKey } from "../types";
import { CATEGORY_TO_KEY, LAYER_CONFIGS } from "../../constants/map";
import { STATE_USPS_TO_NAME } from "../../constants/stateFips";

// The custom-subset export is a *separate* schema from the current-view CSV in
// csv.ts: it is tidy/long (one row per region × period × category, across many
// of each in a single file) and carries the ACS Medicaid-enrollee denominator
// plus a derived claims-per-enrollee rate. csv.ts is left untouched so its
// pinned column contract (and tests) don't move.
export const SUBSET_CSV_COLUMNS = [
    "region_id",
    "region_name",
    "level",
    "period",
    "category",
    "total_claims",
    "total_beneficiaries_served",
    "total_amount_paid",
    "medicaid_enrollees",
    "claims_per_enrollee",
] as const;

export type SubsetCsvColumn = (typeof SUBSET_CSV_COLUMNS)[number];
export type SubsetCsvRow = Record<SubsetCsvColumn, string | number>;

export type Grain = "annual" | "monthly";

// Pseudo-category label for the optional summed-across-all-categories row.
// Matches the live map / csv.ts "All Categories" wording.
export const ALL_CATEGORIES_LABEL = "All Categories";

interface BuildSubsetRowsArgs {
    level: GeoLevel;
    grain: Grain;
    // Years (annual) or year-months (monthly) to emit.
    periods: string[];
    // Specific category layer keys to emit one row each for. "all" must not
    // appear here — use includeAllCategoriesTotal for the summed row instead.
    categories: LayerKey[];
    // When true, add one summed "All Categories" row per region × period.
    includeAllCategoriesTotal?: boolean;
    // Explicit region ids (postal / FIPS GEOID / 3-digit ZIP3) to include.
    regionIds: string[];
    // Annual or monthly claims cache, keyed by region id — supply the one that
    // matches `grain`.
    annualData?: Record<string, DataRecord[]>;
    monthlyData?: Record<string, MonthlyDataRecord[]>;
    // ACS C27007 enrollment cache for `level`, keyed by region id. Optional —
    // a missing cache simply blanks the enrollee/rate columns.
    enrollment?: Record<string, EnrollmentRecord[]>;
    // GEOID → "County, ST" labels (only consulted at county level).
    countyNames?: Record<string, string>;
}

interface CategoryTotals {
    claims: number;
    beneficiaries: number;
    amountPaid: number;
}

function emptyTotals(): CategoryTotals {
    return { claims: 0, beneficiaries: 0, amountPaid: 0 };
}

function regionName(level: GeoLevel, id: string, countyNames?: Record<string, string>): string {
    if (level === "state") return STATE_USPS_TO_NAME[id] ?? id;
    if (level === "county") return countyNames?.[id] ?? id;
    return `ZIP3 ${id}`;
}

// ACS is annual; monthly rows reuse the endpoint-year enrollment (same
// convention as getValueForRegionMonthly). Returns null when the geography has
// no enrollment record for that year — callers blank the columns rather than
// emit a misleading 0.
function enrolleesFor(
    enrollment: Record<string, EnrollmentRecord[]> | undefined,
    id: string,
    year: string,
): number | null {
    const recs = enrollment?.[id];
    if (!recs) return null;
    const hit = recs.find((r) => r.year === year);
    return hit ? hit.medicaid_enrollees : null;
}

// Rate is claims / enrollees, rounded for a tidy CSV; blank when the
// denominator is missing or non-positive so "no denominator" reads differently
// from a true 0 rate.
function rateCell(claims: number, enrollees: number | null): string | number {
    if (enrollees == null || enrollees <= 0) return "";
    return Number((claims / enrollees).toFixed(6));
}

function periodYear(grain: Grain, period: string): string {
    return grain === "annual" ? period : period.slice(0, 4);
}

function isZero(t: CategoryTotals): boolean {
    return t.claims === 0 && t.beneficiaries === 0 && t.amountPaid === 0;
}

/**
 * Expand the user's selection into tidy/long rows. One pass per region; for
 * each selected period we bucket that region's records by category in a single
 * sweep, so the cost is O(records) rather than O(records × categories).
 */
export function buildSubsetCsvRows({
    level,
    grain,
    periods,
    categories,
    includeAllCategoriesTotal = false,
    regionIds,
    annualData,
    monthlyData,
    enrollment,
    countyNames,
}: BuildSubsetRowsArgs): SubsetCsvRow[] {
    const data: Record<string, Array<DataRecord | MonthlyDataRecord>> = grain === "monthly"
        ? (monthlyData ?? {})
        : (annualData ?? {});
    const periodOf = (r: DataRecord | MonthlyDataRecord): string =>
        grain === "monthly" ? (r as MonthlyDataRecord).year_month : (r as DataRecord).year;

    const wantedCategories = new Set<LayerKey>(categories);
    const rows: SubsetCsvRow[] = [];

    for (const id of regionIds) {
        const records = data[id];
        if (!records) continue;
        const name = regionName(level, id, countyNames);

        for (const period of periods) {
            // Bucket this region/period's records once: per selected category +
            // an "all" accumulator for the optional summed row.
            const perCategory = new Map<LayerKey, CategoryTotals>();
            const allTotals = emptyTotals();
            let sawAny = false;

            for (const r of records) {
                if (periodOf(r) !== period) continue;
                sawAny = true;
                if (includeAllCategoriesTotal) {
                    allTotals.claims += r.total_claims;
                    allTotals.beneficiaries += r.total_beneficiaries_served;
                    allTotals.amountPaid += r.total_amount_paid;
                }
                const key = CATEGORY_TO_KEY[r.category];
                if (!key || !wantedCategories.has(key)) continue;
                let bucket = perCategory.get(key);
                if (!bucket) {
                    bucket = emptyTotals();
                    perCategory.set(key, bucket);
                }
                bucket.claims += r.total_claims;
                bucket.beneficiaries += r.total_beneficiaries_served;
                bucket.amountPaid += r.total_amount_paid;
            }

            if (!sawAny) continue;

            const year = periodYear(grain, period);
            const enrollees = enrolleesFor(enrollment, id, year);
            const enrolleesCell: string | number = enrollees == null ? "" : enrollees;

            for (const cat of categories) {
                const totals = perCategory.get(cat);
                if (!totals || isZero(totals)) continue;
                rows.push({
                    region_id: id,
                    region_name: name,
                    level,
                    period,
                    category: LAYER_CONFIGS[cat].label,
                    total_claims: totals.claims,
                    total_beneficiaries_served: totals.beneficiaries,
                    total_amount_paid: totals.amountPaid,
                    medicaid_enrollees: enrolleesCell,
                    claims_per_enrollee: rateCell(totals.claims, enrollees),
                });
            }

            if (includeAllCategoriesTotal && !isZero(allTotals)) {
                rows.push({
                    region_id: id,
                    region_name: name,
                    level,
                    period,
                    category: ALL_CATEGORIES_LABEL,
                    total_claims: allTotals.claims,
                    total_beneficiaries_served: allTotals.beneficiaries,
                    total_amount_paid: allTotals.amountPaid,
                    medicaid_enrollees: enrolleesCell,
                    claims_per_enrollee: rateCell(allTotals.claims, enrollees),
                });
            }
        }
    }

    // Deterministic, diffable order: region, then period, then category label.
    rows.sort(
        (a, b) =>
            String(a.region_id).localeCompare(String(b.region_id)) ||
            String(a.period).localeCompare(String(b.period)) ||
            String(a.category).localeCompare(String(b.category)),
    );
    return rows;
}

/** Distinct year-months present in the monthly cache, sorted ascending. */
export function availableMonthlyPeriods(
    monthlyData: Record<string, MonthlyDataRecord[]>,
): string[] {
    const set = new Set<string>();
    for (const records of Object.values(monthlyData)) {
        for (const r of records) set.add(r.year_month);
    }
    return [...set].sort();
}

/** Estimate row count for the UI guardrail (before zero-row dropping). */
export function estimateSubsetRows(
    regionCount: number,
    periodCount: number,
    categoryCount: number,
    includeAllCategoriesTotal: boolean,
): number {
    return regionCount * periodCount * (categoryCount + (includeAllCategoriesTotal ? 1 : 0));
}

export function subsetCsvFilename(level: GeoLevel, grain: Grain, periods: string[]): string {
    const sorted = [...periods].sort();
    const span =
        sorted.length === 0
            ? "all"
            : sorted.length === 1
              ? sorted[0]
              : `${sorted[0]}_${sorted[sorted.length - 1]}`;
    return `medicaid-dental_subset_${level}_${grain}_${span}.csv`;
}

export function rowsToSubsetCsv(rows: SubsetCsvRow[]): string {
    // Papa auto-quotes fields containing the delimiter (county names like
    // "Autauga County, AL"), so quotes:false is safe here.
    return Papa.unparse(
        { fields: [...SUBSET_CSV_COLUMNS], data: rows },
        { quotes: false, newline: "\n" },
    );
}
