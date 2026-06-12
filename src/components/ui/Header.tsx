import { Suspense, lazy, useCallback, useState } from "react";
import LayerControl from "./LayerControl";
import GeoLevelControl from "./GeoLevelControl";
import MetricControl from "./MetricControl";
import TimeControl from "./TimeControl";
import FilterSheet from "./FilterSheet";
import DetailPanel from "./DetailPanel/index";
import Tooltip from "./Tooltip";
import Legend from "./Legend";
import ClickHint from "./ClickHint";
import InfoModal from "./InfoModal";
import { HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";
import { useIsMobile } from "../../lib/useMediaQuery";

// Export deps (d3-geo, topojson-client, papaparse) are only needed once the
// user opens the modal — load them lazily so they stay out of the critical
// path. The trade-off is a small (~200 ms on broadband) delay between clicking
// Export and the modal painting; acceptable for a save-action.
const ExportModal = lazy(() => import("./ExportModal"));

export default function Header() {
    const isMobile = useIsMobile();
    const [exportOpen, setExportOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const openExport = useCallback(() => setExportOpen(true), []);
    const closeExport = useCallback(() => setExportOpen(false), []);
    const openFilters = useCallback(() => setFiltersOpen(true), []);
    const closeFilters = useCallback(() => setFiltersOpen(false), []);

    return (
        <>
            <header
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: Z_INDEX.HEADER,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: isMobile ? "0 12px" : "0 20px",
                    height: HEADER_HEIGHT,
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                    backdropFilter: "blur(8px)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 12,
                        minWidth: 0,
                    }}
                >
                    <h1
                        style={{
                            fontFamily: "var(--ff-sans)",
                            fontSize: isMobile ? 15 : 17,
                            fontWeight: 600,
                            letterSpacing: "-0.01em",
                            color: "var(--ink)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        Medicaid Dental Utilization
                    </h1>
                    {!isMobile && (
                        <span
                            style={{
                                fontSize: 11,
                                color: "var(--ink-dim)",
                                letterSpacing: "0.02em",
                            }}
                        >
                            United States · State, County & ZIP3 Areas
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {isMobile && (
                        <HeaderButton onClick={openFilters} ariaLabel="Open map filters">
                            <span style={{ fontSize: 13, lineHeight: 1, color: "var(--accent)" }}>
                                ☰
                            </span>
                            Filters
                        </HeaderButton>
                    )}
                    <HeaderButton onClick={openExport} ariaLabel="Export the current view">
                        <span style={{ fontSize: 13, lineHeight: 1, color: "var(--accent)" }}>
                            ↓
                        </span>
                        {!isMobile && "Export"}
                    </HeaderButton>
                </div>
            </header>

            {isMobile ? (
                <FilterSheet open={filtersOpen} onClose={closeFilters} />
            ) : (
                <>
                    <LayerControl />
                    <GeoLevelControl />
                    <MetricControl />
                    <TimeControl />
                </>
            )}
            <Legend />
            <Tooltip />
            <DetailPanel />
            <ClickHint />
            <InfoModal />
            {exportOpen && (
                <Suspense fallback={null}>
                    <ExportModal open={exportOpen} onClose={closeExport} />
                </Suspense>
            )}
        </>
    );
}

function HeaderButton({
    onClick,
    ariaLabel,
    children,
}: {
    onClick: () => void;
    ariaLabel: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={ariaLabel}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                minHeight: 34,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "var(--ff-sans)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink)",
                letterSpacing: "0.01em",
                transition: "background 0.12s, border-color 0.12s",
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface2)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
            }}
        >
            {children}
        </button>
    );
}
