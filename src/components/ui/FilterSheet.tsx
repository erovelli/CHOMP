import { useEffect, useRef } from "react";
import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS, LAYER_ORDER, GEO_LEVELS, METRIC_OPTIONS } from "../../constants/map";
import { AVAILABLE_YEARS, MONTH_OPTIONS } from "../../constants/time";
import { Z_INDEX, SHEET_MAX_WIDTH, PANEL_TRANSITION } from "../../constants/layout";
import {
    DQ_TOPIC_ORDER,
    DQ_TOPIC_LABELS,
    DQ_ASSESSMENT_ORDER,
    DQ_ASSESSMENT_COLORS,
} from "../../constants/dq";
import SheetHandle from "./SheetHandle";
import { Segmented, Select } from "./Controls";

// <select> values must be strings; the store models "all months" as null.
const ALL_MONTHS_KEY = "all";

// Mobile counterpart to the desktop LeftRail: one bottom sheet with the same
// shared controls (Controls.tsx), sized for touch. Selections apply
// immediately, same as desktop — "Done" just dismisses the sheet.
export default function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const {
        activeLayer,
        setActiveLayer,
        geoLevel,
        setGeoLevel,
        metric,
        setMetric,
        selectedYear,
        setSelectedYear,
        selectedMonth,
        setSelectedMonth,
        monthlyDataLoaded,
        dqTopic,
        setDqTopic,
        dqOverlayVisible,
        setDqOverlayVisible,
    } = useMapStore();
    const sheetRef = useRef<HTMLDivElement>(null);
    const loadingMonthly = selectedMonth !== null && !monthlyDataLoaded;

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: Z_INDEX.SHEET,
                    background: "rgba(26,25,23,0.35)",
                    opacity: open ? 1 : 0,
                    pointerEvents: open ? "auto" : "none",
                    transition: "opacity 0.25s",
                }}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                className="sheet-filters"
                role="dialog"
                aria-modal="true"
                aria-label="Map filters"
                style={{
                    position: "fixed",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    margin: "0 auto",
                    maxWidth: SHEET_MAX_WIDTH,
                    zIndex: Z_INDEX.SHEET,
                    display: "flex",
                    flexDirection: "column",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderBottom: "none",
                    borderRadius: "14px 14px 0 0",
                    boxShadow: "0 -6px 24px rgba(0,0,0,0.16)",
                    transform: open ? "translateY(0)" : "translateY(105%)",
                    transition: `transform ${PANEL_TRANSITION}`,
                }}
            >
                <SheetHandle sheetRef={sheetRef} />

                {/* Scrollable filter sections */}
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "8px 16px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 18,
                    }}
                >
                    <Section title="Geography">
                        <Segmented
                            ariaLabel="Geography"
                            options={GEO_LEVELS}
                            value={geoLevel}
                            onChange={setGeoLevel}
                        />
                    </Section>

                    <Section title="Metric">
                        <Segmented
                            ariaLabel="Metric"
                            options={METRIC_OPTIONS}
                            value={metric}
                            onChange={setMetric}
                        />
                    </Section>

                    <Section title="Year">
                        <Segmented
                            ariaLabel="Year"
                            options={AVAILABLE_YEARS.map((y) => ({ key: y, label: y }))}
                            value={selectedYear}
                            onChange={setSelectedYear}
                        />
                    </Section>

                    <Section title="Month" hint={loadingMonthly ? "loading…" : undefined}>
                        <Select
                            ariaLabel="Month"
                            options={MONTH_OPTIONS.map(({ value, label }) => ({
                                key: value ?? ALL_MONTHS_KEY,
                                label: value === null ? "All months" : label,
                            }))}
                            value={selectedMonth ?? ALL_MONTHS_KEY}
                            onChange={(key) =>
                                setSelectedMonth(key === ALL_MONTHS_KEY ? null : key)
                            }
                        />
                    </Section>

                    <Section title="Data quality" hint={dqOverlayVisible ? undefined : "hidden"}>
                        {dqOverlayVisible && (
                            <>
                                <Select
                                    ariaLabel="Data quality topic"
                                    options={DQ_TOPIC_ORDER.map((key) => ({
                                        key,
                                        label: DQ_TOPIC_LABELS[key],
                                    }))}
                                    value={dqTopic}
                                    onChange={setDqTopic}
                                />
                                <div
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "4px 12px",
                                        marginTop: 10,
                                        paddingTop: 8,
                                        borderTop: "1px solid var(--border)",
                                    }}
                                >
                                    {DQ_ASSESSMENT_ORDER.map((tier) => (
                                        <div
                                            key={tier}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                fontSize: 11,
                                                color: "var(--ink-mid)",
                                            }}
                                        >
                                            <span
                                                aria-hidden
                                                style={{
                                                    display: "inline-block",
                                                    width: 12,
                                                    height: 3,
                                                    borderRadius: 1,
                                                    background: DQ_ASSESSMENT_COLORS[tier],
                                                    boxShadow: "0 0 0 1px #ffffff",
                                                    flexShrink: 0,
                                                }}
                                            />
                                            {tier}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="chomp-rail-reset-row">
                            <button
                                type="button"
                                className="chomp-rail-reset"
                                onClick={() => setDqOverlayVisible(!dqOverlayVisible)}
                            >
                                {dqOverlayVisible ? "Hide overlay" : "Show overlay"}
                            </button>
                        </div>
                    </Section>

                    <Section title="Procedure category">
                        <Select
                            ariaLabel="Procedure category"
                            options={LAYER_ORDER.map((key) => ({
                                key,
                                label: LAYER_CONFIGS[key].label,
                            }))}
                            value={activeLayer}
                            onChange={setActiveLayer}
                        />
                    </Section>
                </div>

                {/* Sticky footer */}
                <div
                    style={{
                        flexShrink: 0,
                        padding: "12px 16px",
                        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                        borderTop: "1px solid var(--border)",
                        background: "var(--surface)",
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            width: "100%",
                            minHeight: 44,
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "var(--ff-sans)",
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            letterSpacing: "0.01em",
                        }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </>
    );
}

function Section({
    title,
    hint,
    children,
}: {
    title: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <p
                style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--ink)",
                    marginBottom: 8,
                }}
            >
                {title}
                {hint && <span className="chomp-rail-heading__value--muted"> · {hint}</span>}
            </p>
            {children}
        </div>
    );
}
