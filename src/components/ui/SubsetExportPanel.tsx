import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeoLevel, LayerKey } from "../../lib/types";
import { useMapStore } from "../../lib/store";
import {
    getAnnualDataForLevel,
    getMonthlyDataForLevel,
    getEnrollmentForLevel,
    getCountyNames,
    loadMonthlyData,
} from "../../lib/dataService";
import { GEO_LEVELS, LAYER_ORDER, LAYER_CONFIGS } from "../../constants/map";
import { STATE_USPS_TO_NAME } from "../../constants/stateFips";
import { AVAILABLE_YEARS } from "../../constants/time";
import { downloadCsv } from "../../lib/export/csv";
import {
    type Grain,
    availableMonthlyPeriods,
    buildSubsetCsvRows,
    estimateSubsetRows,
    rowsToSubsetCsv,
    subsetCsvFilename,
} from "../../lib/export/subsetCsv";

const GRAINS: { key: Grain; label: string }[] = [
    { key: "annual", label: "Annual" },
    { key: "monthly", label: "Monthly" },
];

// Selectable category layers (every CDT division; "all" is offered separately
// as the optional summed-total checkbox, not a row category).
const CATEGORY_KEYS = LAYER_ORDER.filter((k) => k !== "all");

// Above this many estimated rows the build can briefly jank the tab, so we
// require an explicit override. County × every month × every category is the
// realistic offender.
const ROW_CAP = 250_000;

// How many region rows to render at once; the rest stay selectable via search /
// select-all without paying for thousands of DOM nodes.
const REGION_DISPLAY_CAP = 250;

function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
}

export default function SubsetExportPanel() {
    const setMonthlyDataLoaded = useMapStore((s) => s.setMonthlyDataLoaded);

    const [level, setLevel] = useState<GeoLevel>("state");
    const [grain, setGrain] = useState<Grain>("annual");

    const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set(AVAILABLE_YEARS));
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

    const [selectedCategories, setSelectedCategories] = useState<Set<LayerKey>>(
        new Set(CATEGORY_KEYS),
    );
    const [includeAllTotal, setIncludeAllTotal] = useState(false);

    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [regionSearch, setRegionSearch] = useState("");
    const [countyNames, setCountyNames] = useState<Record<string, string>>({});

    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const [monthlyError, setMonthlyError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [confirmLarge, setConfirmLarge] = useState(false);

    // Region universe for the current level — keys of the always-loaded annual
    // cache. (Monthly suppression can drop a few ids; the builder simply emits
    // no rows for an id absent from the monthly cache.)
    const regionUniverse = useMemo(() => {
        return Object.keys(getAnnualDataForLevel(level)).sort();
    }, [level]);

    // Reset the region selection (default: all) whenever the level changes.
    useEffect(() => {
        setSelectedRegions(new Set(regionUniverse));
        setRegionSearch("");
    }, [regionUniverse]);

    // County labels for the picker — lazy, memoized in dataService.
    useEffect(() => {
        if (level !== "county") return;
        let cancelled = false;
        getCountyNames()
            .then((names) => {
                if (!cancelled) setCountyNames(names);
            })
            .catch(() => {
                /* fall back to raw GEOIDs */
            });
        return () => {
            cancelled = true;
        };
    }, [level]);

    // Monthly grain needs the lazy ~16 MB monthly dataset. Load once, then
    // default to every available month.
    useEffect(() => {
        if (grain !== "monthly") return;
        let cancelled = false;
        const ready = getMonthlyDataForLevel(level);
        if (Object.keys(ready).length > 0) {
            const months = availableMonthlyPeriods(ready);
            setAvailableMonths(months);
            setSelectedMonths((prev) => (prev.size ? prev : new Set(months)));
            return;
        }
        setMonthlyLoading(true);
        setMonthlyError(null);
        loadMonthlyData()
            .then(() => {
                if (cancelled) return;
                setMonthlyDataLoaded(true);
                const months = availableMonthlyPeriods(getMonthlyDataForLevel(level));
                setAvailableMonths(months);
                setSelectedMonths(new Set(months));
            })
            .catch((err) => {
                if (!cancelled) setMonthlyError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (!cancelled) setMonthlyLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [grain, level, setMonthlyDataLoaded]);

    const regionLabel = useCallback(
        (id: string) => {
            if (level === "state") return STATE_USPS_TO_NAME[id] ?? id;
            if (level === "county") return countyNames[id] ?? id;
            return `ZIP3 ${id}`;
        },
        [level, countyNames],
    );

    const filteredRegions = useMemo(() => {
        const q = regionSearch.trim().toLowerCase();
        if (!q) return regionUniverse;
        return regionUniverse.filter(
            (id) => id.toLowerCase().includes(q) || regionLabel(id).toLowerCase().includes(q),
        );
    }, [regionUniverse, regionSearch, regionLabel]);

    const periodsSelected = grain === "annual" ? selectedYears : selectedMonths;
    const estRows = estimateSubsetRows(
        selectedRegions.size,
        periodsSelected.size,
        selectedCategories.size,
        includeAllTotal,
    );
    const overCap = estRows > ROW_CAP;

    const hasCategorySelection = selectedCategories.size > 0 || includeAllTotal;
    const canDownload =
        selectedRegions.size > 0 &&
        periodsSelected.size > 0 &&
        hasCategorySelection &&
        !monthlyLoading &&
        !generating &&
        (!overCap || confirmLarge);

    const handleDownload = useCallback(() => {
        setGenerating(true);
        // Defer one tick so the "Generating…" label paints before a large
        // synchronous build blocks the thread.
        setTimeout(() => {
            try {
                const periods = grain === "annual" ? [...selectedYears] : [...selectedMonths];
                const rows = buildSubsetCsvRows({
                    level,
                    grain,
                    periods,
                    categories: [...selectedCategories],
                    includeAllCategoriesTotal: includeAllTotal,
                    regionIds: [...selectedRegions],
                    annualData: grain === "annual" ? getAnnualDataForLevel(level) : undefined,
                    monthlyData: grain === "monthly" ? getMonthlyDataForLevel(level) : undefined,
                    enrollment: getEnrollmentForLevel(level),
                    countyNames: level === "county" ? countyNames : undefined,
                });
                downloadCsv(subsetCsvFilename(level, grain, periods), rowsToSubsetCsv(rows));
            } finally {
                setGenerating(false);
            }
        }, 0);
    }, [
        grain,
        level,
        selectedYears,
        selectedMonths,
        selectedCategories,
        includeAllTotal,
        selectedRegions,
        countyNames,
    ]);

    const shownRegions = filteredRegions.slice(0, REGION_DISPLAY_CAP);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p
                style={{
                    fontFamily: "var(--ff-sans)",
                    fontSize: 12,
                    color: "var(--ink-dim)",
                    lineHeight: 1.45,
                    margin: 0,
                }}
            >
                Build a CSV of exactly the slice you need — one row per region × period × category.
                Enrollee counts (ACS C27007) are per region-year, so they repeat across a region's
                category rows.
            </p>

            {/* Geo level */}
            <Section label="Geography">
                <Segmented
                    options={GEO_LEVELS}
                    value={level}
                    onChange={(k) => setLevel(k as GeoLevel)}
                />
            </Section>

            {/* Time grain */}
            <Section label="Time grain">
                <Segmented options={GRAINS} value={grain} onChange={(k) => setGrain(k as Grain)} />
            </Section>

            {/* Periods */}
            <Section
                label={grain === "annual" ? "Years" : "Months"}
                action={
                    grain === "annual" ? (
                        <SelectAllClear
                            onAll={() => setSelectedYears(new Set(AVAILABLE_YEARS))}
                            onClear={() => setSelectedYears(new Set())}
                        />
                    ) : availableMonths.length ? (
                        <SelectAllClear
                            onAll={() => setSelectedMonths(new Set(availableMonths))}
                            onClear={() => setSelectedMonths(new Set())}
                        />
                    ) : null
                }
            >
                {grain === "annual" ? (
                    <ChipRow>
                        {AVAILABLE_YEARS.map((y) => (
                            <Chip
                                key={y}
                                label={y}
                                active={selectedYears.has(y)}
                                onClick={() => setSelectedYears((s) => toggle(s, y))}
                            />
                        ))}
                    </ChipRow>
                ) : monthlyLoading ? (
                    <Hint>Loading monthly data (~16 MB)…</Hint>
                ) : monthlyError ? (
                    <Hint>Monthly data unavailable: {monthlyError}</Hint>
                ) : (
                    <ChipRow scroll>
                        {availableMonths.map((m) => (
                            <Chip
                                key={m}
                                label={m}
                                active={selectedMonths.has(m)}
                                onClick={() => setSelectedMonths((s) => toggle(s, m))}
                            />
                        ))}
                    </ChipRow>
                )}
            </Section>

            {/* Categories */}
            <Section
                label="Categories"
                action={
                    <SelectAllClear
                        onAll={() => setSelectedCategories(new Set(CATEGORY_KEYS))}
                        onClear={() => setSelectedCategories(new Set())}
                    />
                }
            >
                <ChipRow>
                    {CATEGORY_KEYS.map((k) => (
                        <Chip
                            key={k}
                            label={LAYER_CONFIGS[k].label}
                            active={selectedCategories.has(k)}
                            onClick={() => setSelectedCategories((s) => toggle(s, k))}
                        />
                    ))}
                </ChipRow>
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 10,
                        fontFamily: "var(--ff-sans)",
                        fontSize: 12,
                        color: "var(--ink-mid)",
                        cursor: "pointer",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={includeAllTotal}
                        onChange={(e) => setIncludeAllTotal(e.target.checked)}
                    />
                    Also include an “All Categories” total row per region &amp; period
                </label>
            </Section>

            {/* Regions */}
            <Section
                label="Regions"
                action={
                    <SelectAllClear
                        onAll={() => setSelectedRegions(new Set(regionUniverse))}
                        onClear={() => setSelectedRegions(new Set())}
                    />
                }
            >
                <input
                    type="text"
                    value={regionSearch}
                    onChange={(e) => setRegionSearch(e.target.value)}
                    placeholder="Search by name or code…"
                    style={{
                        width: "100%",
                        padding: "7px 10px",
                        fontSize: 12,
                        fontFamily: "var(--ff-sans)",
                        color: "var(--ink)",
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        marginBottom: 8,
                        boxSizing: "border-box",
                    }}
                />
                <p
                    style={{
                        fontFamily: "var(--ff-sans)",
                        fontSize: 11,
                        color: "var(--ink-dim)",
                        margin: "0 0 8px",
                    }}
                >
                    {selectedRegions.size} of {regionUniverse.length} selected
                </p>
                <div
                    style={{
                        maxHeight: 180,
                        overflowY: "auto",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: 6,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                    }}
                >
                    {shownRegions.map((id) => (
                        <label
                            key={id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "4px 6px",
                                borderRadius: 3,
                                fontFamily: "var(--ff-sans)",
                                fontSize: 12,
                                color: "var(--ink-mid)",
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={selectedRegions.has(id)}
                                onChange={() => setSelectedRegions((s) => toggle(s, id))}
                            />
                            <span style={{ color: "var(--ink)" }}>{regionLabel(id)}</span>
                            {regionLabel(id) !== id && (
                                <span style={{ color: "var(--ink-dim)" }}>{id}</span>
                            )}
                        </label>
                    ))}
                    {filteredRegions.length === 0 && (
                        <Hint>No regions match “{regionSearch}”.</Hint>
                    )}
                    {filteredRegions.length > REGION_DISPLAY_CAP && (
                        <Hint>
                            +{filteredRegions.length - REGION_DISPLAY_CAP} more — refine your search
                            to see them (select-all still covers every match).
                        </Hint>
                    )}
                </div>
            </Section>

            {/* Footer: estimate + download */}
            <div
                style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                }}
            >
                <p
                    style={{
                        fontFamily: "var(--ff-sans)",
                        fontSize: 12,
                        color: overCap ? "var(--ink)" : "var(--ink-dim)",
                        margin: 0,
                    }}
                >
                    ~{estRows.toLocaleString()} rows
                    {overCap && (
                        <span style={{ color: "var(--ink)" }}>
                            {" "}
                            — that's a large file and may take a moment to build.
                        </span>
                    )}
                </p>

                {overCap && !confirmLarge ? (
                    <button onClick={() => setConfirmLarge(true)} style={secondaryButtonStyle}>
                        Generate anyway
                    </button>
                ) : (
                    <button
                        onClick={handleDownload}
                        disabled={!canDownload}
                        style={{
                            ...primaryButtonStyle,
                            opacity: canDownload ? 1 : 0.5,
                            cursor: canDownload ? "pointer" : "default",
                        }}
                    >
                        {generating ? "Generating…" : "Download CSV"}
                    </button>
                )}

                {!hasCategorySelection && <Hint>Select at least one category.</Hint>}
                {periodsSelected.size === 0 && grain === "annual" && (
                    <Hint>Select at least one year.</Hint>
                )}
                {selectedRegions.size === 0 && <Hint>Select at least one region.</Hint>}
            </div>
        </div>
    );
}

// ── Presentational helpers ────────────────────────────────────

function Section({
    label,
    action,
    children,
}: {
    label: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                }}
            >
                <span
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--ink-dim)",
                    }}
                >
                    {label}
                </span>
                {action}
            </div>
            {children}
        </div>
    );
}

function Segmented({
    options,
    value,
    onChange,
}: {
    options: { key: string; label: string }[];
    value: string;
    onChange: (key: string) => void;
}) {
    return (
        <div
            style={{
                display: "inline-flex",
                gap: 2,
                padding: 3,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
            }}
        >
            {options.map(({ key, label }) => {
                const active = key === value;
                return (
                    <button
                        key={key}
                        onClick={() => onChange(key)}
                        style={{
                            padding: "5px 14px",
                            fontSize: 12,
                            fontFamily: "var(--ff-sans)",
                            fontWeight: active ? 600 : 500,
                            color: active ? "var(--accent)" : "var(--ink-mid)",
                            background: active ? "var(--accent-light)" : "transparent",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            transition: "background 0.12s, color 0.12s",
                        }}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

function ChipRow({ children, scroll }: { children: React.ReactNode; scroll?: boolean }) {
    return (
        <div
            style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                ...(scroll ? { maxHeight: 132, overflowY: "auto" } : null),
            }}
        >
            {children}
        </div>
    );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "5px 11px",
                fontSize: 12,
                fontFamily: "var(--ff-sans)",
                fontWeight: active ? 600 : 500,
                color: active ? "var(--accent)" : "var(--ink-mid)",
                background: active ? "var(--accent-light)" : "var(--surface2)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 4,
                cursor: "pointer",
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
            }}
        >
            {label}
        </button>
    );
}

function SelectAllClear({ onAll, onClear }: { onAll: () => void; onClear: () => void }) {
    const linkStyle: React.CSSProperties = {
        background: "none",
        border: "none",
        padding: 0,
        fontFamily: "var(--ff-sans)",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--accent)",
        cursor: "pointer",
    };
    return (
        <span style={{ display: "flex", gap: 10 }}>
            <button onClick={onAll} style={linkStyle}>
                All
            </button>
            <button onClick={onClear} style={linkStyle}>
                Clear
            </button>
        </span>
    );
}

function Hint({ children }: { children: React.ReactNode }) {
    return (
        <p
            style={{
                fontFamily: "var(--ff-sans)",
                fontSize: 11,
                color: "var(--ink-dim)",
                margin: "4px 2px 0",
                lineHeight: 1.4,
            }}
        >
            {children}
        </p>
    );
}

const primaryButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontFamily: "var(--ff-sans)",
    fontSize: 13,
    fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    background: "var(--surface2)",
    color: "var(--ink)",
    border: "1px solid var(--accent)",
    borderRadius: 4,
    fontFamily: "var(--ff-sans)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
};
