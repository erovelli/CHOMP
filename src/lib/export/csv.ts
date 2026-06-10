import Papa from "papaparse";
import type { DataRecord, MonthlyDataRecord, GeoLevel, LayerKey } from "../types";
import { CATEGORY_TO_KEY, LAYER_CONFIGS } from "../../constants/map";
import { STATE_USPS_TO_NAME } from "../../constants/stateFips";

// CSV column order is fixed and tested — downstream spreadsheets pin to it.
export const CSV_COLUMNS = [
    "region_id",
    "region_name",
    "level",
    "year",
    "category",
    "total_claims",
    "total_beneficiaries_served",
    "total_amount_paid",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRow = Record<CsvColumn, string | number>;

interface BuildRowsArgs {
    level: GeoLevel;
    period: string;
    activeLayer: LayerKey;
    // Annual or monthly cache, depending on the user's current mode. Keys are
    // region ids (postal / FIPS / 3-digit ZIP3 prefix).
    annualData?: Record<string, DataRecord[]>;
    monthlyData?: Record<string, MonthlyDataRecord[]>;
}

interface RegionTotals {
    claims: number;
    beneficiaries: number;
    amountPaid: number;
}

/**
 * Aggregate the records for one region down to a single CSV row.
 *
 * When activeLayer is "all", the totals are summed across every category
 * present (matching the live map's "All Categories" view). When activeLayer is
 * a specific category, only rows of that category contribute — so
 * total_beneficiaries_served reflects the served-beneficiary count for that
 * category alone, not the union across categories (HHS suppresses below the
 * category-level threshold, not across categories — so the union is not
 * recoverable from this aggregate).
 */
function totalsForRegion(
    records: Array<DataRecord | MonthlyDataRecord>,
    matchesPeriod: (r: DataRecord | MonthlyDataRecord) => boolean,
    activeLayer: LayerKey,
): RegionTotals {
    const totals: RegionTotals = { claims: 0, beneficiaries: 0, amountPaid: 0 };
    for (const r of records) {
        if (!matchesPeriod(r)) continue;
        if (activeLayer !== "all" && CATEGORY_TO_KEY[r.category] !== activeLayer) continue;
        totals.claims += r.total_claims;
        totals.beneficiaries += r.total_beneficiaries_served;
        totals.amountPaid += r.total_amount_paid;
    }
    return totals;
}

function regionName(level: GeoLevel, id: string): string {
    if (level === "state") return STATE_USPS_TO_NAME[id] ?? id;
    // County GEOID and ZIP3 prefix don't have a name source colocated with the
    // claims data. Use the id itself as a stable, machine-parseable name; a
    // future iteration can join against the GeoJSON properties for prettier
    // labels.
    if (level === "county") return id;
    return `ZIP3 ${id}`;
}

export function buildCsvRows({
    level,
    period,
    activeLayer,
    annualData,
    monthlyData,
}: BuildRowsArgs): CsvRow[] {
    const categoryLabel =
        activeLayer === "all" ? "All Categories" : LAYER_CONFIGS[activeLayer].label;

    const rows: CsvRow[] = [];
    if (monthlyData) {
        const matchesPeriod = (r: DataRecord | MonthlyDataRecord) =>
            (r as MonthlyDataRecord).year_month === period;
        for (const [id, records] of Object.entries(monthlyData)) {
            const totals = totalsForRegion(records, matchesPeriod, activeLayer);
            if (totals.claims === 0 && totals.beneficiaries === 0 && totals.amountPaid === 0) {
                continue;
            }
            rows.push({
                region_id: id,
                region_name: regionName(level, id),
                level,
                year: period,
                category: categoryLabel,
                total_claims: totals.claims,
                total_beneficiaries_served: totals.beneficiaries,
                total_amount_paid: totals.amountPaid,
            });
        }
    } else if (annualData) {
        const matchesPeriod = (r: DataRecord | MonthlyDataRecord) =>
            (r as DataRecord).year === period;
        for (const [id, records] of Object.entries(annualData)) {
            const totals = totalsForRegion(records, matchesPeriod, activeLayer);
            if (totals.claims === 0 && totals.beneficiaries === 0 && totals.amountPaid === 0) {
                continue;
            }
            rows.push({
                region_id: id,
                region_name: regionName(level, id),
                level,
                year: period,
                category: categoryLabel,
                total_claims: totals.claims,
                total_beneficiaries_served: totals.beneficiaries,
                total_amount_paid: totals.amountPaid,
            });
        }
    }
    // Sort by region_id so the file is deterministic — diffable across exports.
    rows.sort((a, b) => String(a.region_id).localeCompare(String(b.region_id)));
    return rows;
}

export function csvFilename(activeLayer: LayerKey, period: string, level: GeoLevel): string {
    return `medicaid-dental_${activeLayer}_${period}_${level}.csv`;
}

export function rowsToCsv(rows: CsvRow[]): string {
    return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows }, { quotes: false, newline: "\n" });
}

export function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
