import { Suspense, lazy, useCallback, useState } from "react";
import LayerControl from "./LayerControl";
import GeoLevelControl from "./GeoLevelControl";
import MetricControl from "./MetricControl";
import TimeControl from "./TimeControl";
import DetailPanel from "./DetailPanel/index";
import Tooltip from "./Tooltip";
import Legend from "./Legend";
import ClickHint from "./ClickHint";
import InfoModal from "./InfoModal";
import { HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";

// Export deps (d3-geo, topojson-client, papaparse) are only needed once the
// user opens the modal — load them lazily so they stay out of the critical
// path. The trade-off is a small (~200 ms on broadband) delay between clicking
// Export and the modal painting; acceptable for a save-action.
const ExportModal = lazy(() => import("./ExportModal"));

export default function Header() {
    const [exportOpen, setExportOpen] = useState(false);
    const openExport = useCallback(() => setExportOpen(true), []);
    const closeExport = useCallback(() => setExportOpen(false), []);

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
                    padding: "0 20px",
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
                    }}
                >
                    <h1
                        style={{
                            fontFamily: "var(--ff-sans)",
                            fontSize: 17,
                            fontWeight: 600,
                            letterSpacing: "-0.01em",
                            color: "var(--ink)",
                        }}
                    >
                        Medicaid Dental Utilization
                    </h1>
                    <span
                        style={{
                            fontSize: 11,
                            color: "var(--ink-dim)",
                            letterSpacing: "0.02em",
                        }}
                    >
                        United States · State, County & ZIP3 Areas
                    </span>
                </div>
                <button
                    onClick={openExport}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
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
                    <span style={{ fontSize: 13, lineHeight: 1, color: "var(--accent)" }}>↓</span>
                    Export
                </button>
            </header>

            <LayerControl />
            <GeoLevelControl />
            <MetricControl />
            <TimeControl />
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
