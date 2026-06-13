import { useCallback, useEffect, useRef, useState } from "react";
import { Z_INDEX } from "../../constants/layout";
import { useIsMobile } from "../../lib/useMediaQuery";
import { useMapStore } from "../../lib/store";
import { getAnnualDataForLevel, getMonthlyDataForLevel } from "../../lib/dataService";
import { buildCsvRows, csvFilename, downloadCsv, rowsToCsv } from "../../lib/export/csv";
import {
    canvasToBlob,
    downloadBlob,
    EXPORT_H,
    EXPORT_SCALE,
    EXPORT_W,
    imageFilename,
    renderSynthesizedMap,
} from "../../lib/export/synthesizeMap";
import { LAYER_CONFIGS } from "../../constants/map";
import type { GeoLevel } from "../../lib/types";
import SubsetExportPanel from "./SubsetExportPanel";

const LEVEL_LABEL: Record<GeoLevel, string> = {
    state: "State-level",
    county: "County-level",
    zip3: "ZIP3-level",
};

type ExportTab = "current" | "custom";
const TABS: { key: ExportTab; label: string }[] = [
    { key: "current", label: "Current view" },
    { key: "custom", label: "Custom dataset" },
];

interface ExportModalProps {
    open: boolean;
    onClose: () => void;
}

// Debounce window for regenerating the preview thumbnail when filters change.
// Matches the brief; long enough to skip mid-slide intermediate states, short
// enough that the preview feels alive.
const PREVIEW_DEBOUNCE_MS = 300;

// Preview thumbnail scale relative to the 1600×1000 reference — keeps the
// render fast (<100 ms on a modern laptop) while staying readable at 400×250.
const PREVIEW_SCALE = 0.25;

export default function ExportModal({ open, onClose }: ExportModalProps) {
    const isMobile = useIsMobile();
    const activeLayer = useMapStore((s) => s.activeLayer);
    const selectedYear = useMapStore((s) => s.selectedYear);
    const selectedMonth = useMapStore((s) => s.selectedMonth);
    const monthlyDataLoaded = useMapStore((s) => s.monthlyDataLoaded);
    const geoLevel = useMapStore((s) => s.geoLevel);
    const metric = useMapStore((s) => s.metric);

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [exporting, setExporting] = useState<null | "png" | "jpeg" | "csv">(null);
    const previewSeqRef = useRef(0);
    const [tab, setTab] = useState<ExportTab>("current");

    // Escape to close.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Reset preview when modal opens fresh so a stale dataURL doesn't flash.
    useEffect(() => {
        if (!open) {
            setPreviewUrl(null);
            setPreviewError(null);
        }
    }, [open]);

    // Debounced preview regeneration. Sequence guards against a late finisher
    // from a prior set of filters overwriting the current preview.
    useEffect(() => {
        if (!open || tab !== "current") return;
        setPreviewing(true);
        setPreviewError(null);
        const seq = ++previewSeqRef.current;
        const handle = window.setTimeout(async () => {
            try {
                const canvas = await renderSynthesizedMap({
                    activeLayer,
                    year: selectedYear,
                    metric,
                    level: geoLevel,
                    scale: PREVIEW_SCALE,
                });
                if (seq !== previewSeqRef.current) return;
                setPreviewUrl(canvas.toDataURL("image/png"));
            } catch (err) {
                if (seq !== previewSeqRef.current) return;
                setPreviewError(err instanceof Error ? err.message : String(err));
            } finally {
                if (seq === previewSeqRef.current) setPreviewing(false);
            }
        }, PREVIEW_DEBOUNCE_MS);
        return () => window.clearTimeout(handle);
    }, [open, tab, activeLayer, selectedYear, metric, geoLevel]);

    // The CSV "current view" inherits the user's monthly/annual selection, and
    // the geo level it's currently zoomed to. PNG/JPEG are state-only by spec.
    const usingMonthly = selectedMonth !== null && monthlyDataLoaded;
    const period = usingMonthly
        ? `${selectedYear}-${(selectedMonth ?? "").padStart(2, "0")}`
        : selectedYear;

    const handleExportCsv = useCallback(() => {
        setExporting("csv");
        try {
            const rows = buildCsvRows({
                level: geoLevel,
                period,
                activeLayer,
                annualData: usingMonthly ? undefined : getAnnualDataForLevel(geoLevel),
                monthlyData: usingMonthly ? getMonthlyDataForLevel(geoLevel) : undefined,
            });
            const csv = rowsToCsv(rows);
            downloadCsv(csvFilename(activeLayer, period, geoLevel), csv);
        } finally {
            setExporting(null);
        }
    }, [geoLevel, period, activeLayer, usingMonthly]);

    const handleExportImage = useCallback(
        async (format: "png" | "jpeg") => {
            setExporting(format);
            try {
                const canvas = await renderSynthesizedMap({
                    activeLayer,
                    year: selectedYear,
                    metric,
                    level: geoLevel,
                    scale: EXPORT_SCALE,
                });
                const blob = await canvasToBlob(canvas, format);
                downloadBlob(imageFilename(activeLayer, selectedYear, geoLevel, format), blob);
            } finally {
                setExporting(null);
            }
        },
        [activeLayer, selectedYear, metric, geoLevel],
    );

    if (!open) return null;

    const layerLabel = LAYER_CONFIGS[activeLayer]?.label ?? activeLayer;
    const csvRowsHint = `${geoLevel}-level rows · ${period}`;

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: Z_INDEX.MODAL,
                background: "rgba(26,25,23,0.55)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: isMobile ? 12 : 24,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="modal-card"
                style={{
                    position: "relative",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                    width: "100%",
                    maxWidth: 640,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        padding: isMobile ? "18px 16px 14px" : "24px 24px 18px",
                        borderBottom: "1px solid var(--border)",
                        flexShrink: 0,
                    }}
                >
                    <p
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "var(--ink-dim)",
                            marginBottom: 6,
                        }}
                    >
                        Export
                    </p>
                    <h2
                        style={{
                            fontFamily: "var(--ff-sans)",
                            fontSize: 20,
                            fontWeight: 600,
                            letterSpacing: "-0.02em",
                            color: "var(--ink)",
                            lineHeight: 1.25,
                        }}
                    >
                        Save the current view
                    </h2>
                    <p
                        style={{
                            fontFamily: "var(--ff-sans)",
                            fontSize: 12,
                            color: "var(--ink-dim)",
                            marginTop: 8,
                        }}
                    >
                        {layerLabel} · {period} ·{" "}
                        {metric === "enrollees" ? "Per enrollee" : "Volume"}
                    </p>

                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            position: "absolute",
                            top: 16,
                            right: 16,
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "var(--surface2)",
                            border: "1px solid var(--border)",
                            borderRadius: "50%",
                            cursor: "pointer",
                            fontSize: 14,
                            color: "var(--ink-mid)",
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: isMobile
                            ? "16px 16px calc(20px + env(safe-area-inset-bottom, 0px))"
                            : "20px 24px 24px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 18,
                    }}
                >
                    {/* Tab switcher: keeps the existing current-view export
                        untouched under "Current view" and adds the subset
                        builder under "Custom dataset". */}
                    <div
                        style={{
                            display: "inline-flex",
                            gap: 2,
                            padding: 3,
                            background: "var(--surface2)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            alignSelf: "flex-start",
                        }}
                    >
                        {TABS.map((t) => {
                            const active = t.key === tab;
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => setTab(t.key)}
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
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {tab === "custom" && <SubsetExportPanel />}

                    {tab === "current" && (
                        <>
                            {/* Preview thumbnail */}
                            <div
                                style={{
                                    border: "1px solid var(--border)",
                                    borderRadius: 4,
                                    background: "var(--surface2)",
                                    aspectRatio: "1600 / 1000",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    overflow: "hidden",
                                    position: "relative",
                                }}
                            >
                                {previewUrl && (
                                    <img
                                        src={previewUrl}
                                        alt="Synthesized map preview"
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            opacity: previewing ? 0.6 : 1,
                                            transition: "opacity 0.2s",
                                        }}
                                    />
                                )}
                                {!previewUrl && !previewError && (
                                    <span
                                        style={{
                                            fontFamily: "var(--ff-sans)",
                                            fontSize: 12,
                                            color: "var(--ink-dim)",
                                        }}
                                    >
                                        Generating preview…
                                    </span>
                                )}
                                {previewError && (
                                    <span
                                        style={{
                                            fontFamily: "var(--ff-sans)",
                                            fontSize: 12,
                                            color: "var(--ink-dim)",
                                            padding: "0 16px",
                                            textAlign: "center",
                                        }}
                                    >
                                        Preview unavailable: {previewError}
                                    </span>
                                )}
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 10,
                                }}
                            >
                                <ExportButton
                                    label="PNG"
                                    sub={`${LEVEL_LABEL[geoLevel]} choropleth · ${EXPORT_W}×${EXPORT_H} · ${layerLabel}, ${selectedYear}`}
                                    onClick={() => handleExportImage("png")}
                                    disabled={exporting !== null}
                                    busy={exporting === "png"}
                                />
                                <ExportButton
                                    label="JPEG"
                                    onClick={() => handleExportImage("jpeg")}
                                    disabled={exporting !== null}
                                    busy={exporting === "jpeg"}
                                />
                                <ExportButton
                                    label="CSV"
                                    sub={`Per-region totals at this view · ${csvRowsHint}`}
                                    onClick={handleExportCsv}
                                    disabled={exporting !== null}
                                    busy={exporting === "csv"}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

interface ExportButtonProps {
    label: string;
    sub?: string;
    onClick: () => void;
    disabled: boolean;
    busy: boolean;
}

function ExportButton({ label, sub, onClick, disabled, busy }: ExportButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                width: "100%",
                padding: "12px 14px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: disabled ? "default" : "pointer",
                textAlign: "left",
                transition: "background 0.12s, border-color 0.12s",
                opacity: disabled && !busy ? 0.55 : 1,
                fontFamily: "var(--ff-sans)",
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
            }}
        >
            <div style={{ flex: 1 }}>
                <span
                    style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--ink)",
                        lineHeight: 1.2,
                    }}
                >
                    {label}
                </span>
                {sub && (
                    <span
                        style={{
                            display: "block",
                            fontSize: 11,
                            color: "var(--ink-dim)",
                            marginTop: 3,
                            lineHeight: 1.3,
                        }}
                    >
                        {sub}
                    </span>
                )}
            </div>
            <span
                style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    fontWeight: 600,
                }}
            >
                {busy ? "…" : "↓"}
            </span>
        </button>
    );
}
