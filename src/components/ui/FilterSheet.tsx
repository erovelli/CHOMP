import { useEffect, useRef } from "react";
import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS, LAYER_ORDER, GEO_LEVELS, METRIC_OPTIONS } from "../../constants/map";
import { AVAILABLE_YEARS, MONTH_OPTIONS } from "../../constants/time";
import { Z_INDEX, SHEET_MAX_WIDTH, PANEL_TRANSITION } from "../../constants/layout";
import SheetHandle from "./SheetHandle";

// Mobile replacement for the four floating desktop controls (LayerControl,
// GeoLevelControl, MetricControl, TimeControl): one bottom sheet with
// touch-sized chips. Selections apply immediately, same as desktop — "Done"
// just dismisses the sheet.
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
                        <div style={{ display: "flex", gap: 6 }}>
                            {GEO_LEVELS.map(({ key, label }) => (
                                <Chip
                                    key={key}
                                    label={label}
                                    active={key === geoLevel}
                                    onClick={() => setGeoLevel(key)}
                                    grow
                                />
                            ))}
                        </div>
                    </Section>

                    <Section title="Metric">
                        <div style={{ display: "flex", gap: 6 }}>
                            {METRIC_OPTIONS.map(({ key, label }) => (
                                <Chip
                                    key={key}
                                    label={label}
                                    active={key === metric}
                                    onClick={() => setMetric(key)}
                                    grow
                                />
                            ))}
                        </div>
                    </Section>

                    <Section title="Year">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {AVAILABLE_YEARS.map((year) => (
                                <Chip
                                    key={year}
                                    label={year}
                                    active={year === selectedYear}
                                    onClick={() => setSelectedYear(year)}
                                />
                            ))}
                        </div>
                    </Section>

                    <Section title="Month" hint={loadingMonthly ? "loading…" : undefined}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {MONTH_OPTIONS.map(({ value, label }) => (
                                <Chip
                                    key={label}
                                    label={label}
                                    active={value === selectedMonth}
                                    onClick={() => setSelectedMonth(value)}
                                />
                            ))}
                        </div>
                    </Section>

                    <Section title="Procedure Category">
                        <div
                            style={{
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                overflow: "hidden",
                            }}
                        >
                            {LAYER_ORDER.map((key, i) => {
                                const cfg = LAYER_CONFIGS[key];
                                const isActive = key === activeLayer;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setActiveLayer(key)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            width: "100%",
                                            minHeight: 44,
                                            padding: "10px 12px",
                                            background: isActive
                                                ? "var(--accent-light)"
                                                : "transparent",
                                            border: "none",
                                            borderTop: i === 0 ? "none" : "1px solid var(--border)",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            fontFamily: "var(--ff-sans)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: "50%",
                                                background: cfg.accent,
                                                flexShrink: 0,
                                            }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <span
                                                style={{
                                                    display: "block",
                                                    fontSize: 13,
                                                    fontWeight: 500,
                                                    color: isActive
                                                        ? "var(--accent)"
                                                        : "var(--ink)",
                                                    lineHeight: 1.25,
                                                }}
                                            >
                                                {cfg.label}
                                            </span>
                                            <span
                                                style={{
                                                    display: "block",
                                                    fontSize: 11,
                                                    color: "var(--ink-dim)",
                                                    marginTop: 1,
                                                }}
                                            >
                                                {cfg.description}
                                            </span>
                                        </div>
                                        <span
                                            style={{
                                                fontSize: 13,
                                                color: "var(--accent)",
                                                opacity: isActive ? 1 : 0,
                                            }}
                                        >
                                            ✓
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
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
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink-dim)",
                    marginBottom: 8,
                }}
            >
                {title}
                {hint && (
                    <span
                        style={{
                            marginLeft: 8,
                            fontWeight: 500,
                            letterSpacing: "0.02em",
                            textTransform: "none",
                        }}
                    >
                        {hint}
                    </span>
                )}
            </p>
            {children}
        </div>
    );
}

function Chip({
    label,
    active,
    onClick,
    grow,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    grow?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                flex: grow ? 1 : undefined,
                minHeight: 40,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                fontFamily: "var(--ff-sans)",
                color: active ? "var(--accent)" : "var(--ink-mid)",
                background: active ? "var(--accent-light)" : "var(--surface2)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6,
                cursor: "pointer",
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
            }}
        >
            {label}
        </button>
    );
}
