import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../lib/types";
import type { LayerKey, ZCTADetail } from "../../lib/types";

const PROC_LAYERS: { key: LayerKey; color: string }[] = [
    { key: "preventive", color: "#4a7fcb" },
    { key: "restorative", color: "#c87d2a" },
    { key: "extractions", color: "#b03a3a" },
    { key: "ortho", color: "#7a5cb8" },
];

const NATIONAL_AVG: Record<LayerKey, number> = {
    all: 92,
    preventive: 54,
    restorative: 31,
    extractions: 19,
    ortho: 11,
};

const STATE_AVG: Record<LayerKey, number> = {
    all: 88,
    preventive: 51,
    restorative: 29,
    extractions: 21,
    ortho: 10,
};

export default function DetailPanel() {
    const { panelOpen, selectedDetail, setSelectedZCTA } = useMapStore();

    const close = () => setSelectedZCTA(null, null);

    return (
        <div
            style={{
                position: "absolute",
                top: 52,
                right: 0,
                bottom: 0,
                width: 340,
                background: "var(--surface)",
                borderLeft: "1px solid var(--border)",
                zIndex: 60,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                transform: panelOpen ? "translateX(0)" : "translateX(100%)",
                transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
        >
            {selectedDetail && <PanelContent detail={selectedDetail} onClose={close} />}
        </div>
    );
}

function PanelContent({ detail, onClose }: { detail: ZCTADetail; onClose: () => void }) {
    const maxProc = Math.max(...PROC_LAYERS.map((p) => detail[p.key]));
    const nationalAll = NATIONAL_AVG.all;
    const stateAll = STATE_AVG.all;

    return (
        <>
            {/* Header */}
            <div
                style={{
                    padding: "20px 20px 16px",
                    borderBottom: "1px solid var(--border)",
                    flexShrink: 0,
                    position: "relative",
                }}
            >
                <p
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--ink-dim)",
                        marginBottom: 4,
                    }}
                >
                    ZIP Code Area
                </p>
                <h2
                    style={{
                        fontFamily: "var(--ff-sans)",
                        fontSize: 22,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        color: "var(--ink)",
                        marginBottom: 2,
                    }}
                >
                    ZCTA {detail.zcta}
                </h2>
                <p style={{ fontSize: 12, color: "var(--ink-mid)" }}>
                    {detail.stateName} · {detail.beneficiaries.toLocaleString()} est. beneficiaries
                </p>
                <button
                    onClick={onClose}
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

            {/* Body */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: 20,
                }}
            >
                {/* Stat grid */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginBottom: 24,
                    }}
                >
                    <StatCard
                        value={detail.all.toLocaleString()}
                        label="Total Claims / 1k"
                        delta={detail.all - nationalAll}
                        deltaLabel="vs national avg"
                    />
                    <StatCard value={String(detail.providers)} label="Active Providers" note="Medicaid-enrolled" />
                    <StatCard
                        value={`$${detail.avgPaymentPerClaim.toLocaleString()}`}
                        label="Avg Payment / Claim"
                        note="2022 data"
                    />
                    <StatCard
                        value={`$${(detail.totalPayment / 1000).toFixed(0)}k`}
                        label="Total Payments"
                        note="Annual"
                    />
                </div>

                {/* Procedure breakdown */}
                <p
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--ink-dim)",
                        marginBottom: 12,
                    }}
                >
                    Breakdown by Procedure
                </p>
                <div style={{ marginBottom: 24 }}>
                    {PROC_LAYERS.map(({ key, color }) => {
                        const cfg = LAYER_CONFIGS[key];
                        const val = detail[key];
                        const pct = maxProc > 0 ? (val / maxProc) * 100 : 0;
                        return (
                            <div key={key} style={{ marginBottom: 10 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "baseline",
                                        marginBottom: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 500,
                                            color: "var(--ink)",
                                        }}
                                    >
                                        {cfg.label}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontFamily: "var(--ff-serif)",
                                            color: "var(--ink-mid)",
                                        }}
                                    >
                                        {val} / 1,000
                                    </span>
                                </div>
                                <div
                                    style={{
                                        height: 4,
                                        background: "var(--border)",
                                        borderRadius: 2,
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            width: `${pct}%`,
                                            background: color,
                                            borderRadius: 2,
                                            transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)",
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Divider */}
                <div
                    style={{
                        height: 1,
                        background: "var(--border)",
                        margin: "0 0 20px",
                    }}
                />

                {/* Comparison */}
                <p
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--ink-dim)",
                        marginBottom: 12,
                    }}
                >
                    Compare · All Procedures
                </p>
                <div>
                    {[
                        {
                            label: "This ZCTA",
                            val: detail.all,
                            color: "#1e8a7e",
                        },
                        {
                            label: "State avg",
                            val: stateAll,
                            color: "#9a948d",
                        },
                        {
                            label: "National",
                            val: nationalAll,
                            color: "#c4bfb8",
                        },
                    ].map(({ label, val, color }) => {
                        const pct = (val / 200) * 100;
                        const natPct = (nationalAll / 200) * 100;
                        return (
                            <div
                                key={label}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    marginBottom: 8,
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--ink-mid)",
                                        width: 72,
                                        flexShrink: 0,
                                    }}
                                >
                                    {label}
                                </span>
                                <div
                                    style={{
                                        flex: 1,
                                        height: 6,
                                        background: "var(--border)",
                                        borderRadius: 3,
                                        position: "relative",
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            top: 0,
                                            height: "100%",
                                            width: `${pct}%`,
                                            background: color,
                                            borderRadius: 3,
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: -3,
                                            left: `${natPct}%`,
                                            width: 1,
                                            height: 12,
                                            background: "rgba(90,80,70,0.4)",
                                            borderRadius: 1,
                                        }}
                                    />
                                </div>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontFamily: "var(--ff-serif)",
                                        fontWeight: 600,
                                        color: "var(--ink)",
                                        width: 32,
                                        textAlign: "right",
                                        flexShrink: 0,
                                    }}
                                >
                                    {val}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <p
                    style={{
                        fontSize: 10,
                        color: "var(--ink-dim)",
                        lineHeight: 1.5,
                        marginTop: 24,
                        paddingTop: 16,
                        borderTop: "1px solid var(--border)",
                    }}
                >
                    Dummy data for demonstration. In production: HHS Medicaid claims joined to NPI registry, aggregated
                    per ZCTA. CDT codes D0100–D9999. 2022 calendar year.
                </p>
            </div>
        </>
    );
}

function StatCard({
    value,
    label,
    delta,
    deltaLabel,
    note,
}: {
    value: string;
    label: string;
    delta?: number;
    deltaLabel?: string;
    note?: string;
}) {
    return (
        <div
            style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 12,
            }}
        >
            <div
                style={{
                    fontFamily: "var(--ff-serif)",
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: "var(--ink)",
                    lineHeight: 1,
                    marginBottom: 3,
                }}
            >
                {value}
            </div>
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--ink-dim)",
                }}
            >
                {label}
            </div>
            {delta !== undefined && (
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 500,
                        marginTop: 4,
                        color: delta > 0 ? "#16a34a" : "#dc2626",
                    }}
                >
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} {deltaLabel}
                </div>
            )}
            {note && (
                <div
                    style={{
                        fontSize: 11,
                        color: "var(--ink-dim)",
                        marginTop: 4,
                    }}
                >
                    {note}
                </div>
            )}
        </div>
    );
}
