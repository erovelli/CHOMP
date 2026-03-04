import { useState, useCallback } from "react";
import { useMapStore } from "../../lib/store";
import type { RegionDetail, DataRecord, MonthlyDataRecord } from "../../lib/types";
import { loadMonthlyData, getMonthlyRecords } from "../map/MapContainer";

const AVAILABLE_YEARS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024"];

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const CATEGORY_COLORS: Record<string, string> = {
    Diagnostic: "#4a7fcb",
    Preventive: "#2ca58d",
    Restorative: "#c87d2a",
    "Oral Surgery": "#b03a3a",
    Orthodontics: "#7a5cb8",
    Endodontics: "#d4694a",
    Periodontics: "#5c9e7a",
    "Adjunctive General Services": "#8c7853",
    "Prosthodontics (removable)": "#6b8cae",
    "Prosthodontics (fixed)": "#6b8cae",
};

export default function DetailPanel() {
    const { panelOpen, selectedDetail, setSelectedRegion } = useMapStore();
    const close = () => setSelectedRegion(null, null);

    return (
        <div
            style={{
                position: "absolute",
                top: 52,
                right: 0,
                bottom: 0,
                width: 360,
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

function PanelContent({ detail, onClose }: { detail: RegionDetail; onClose: () => void }) {
    const { selectedYear, setSelectedYear, monthlyDataLoaded, setMonthlyDataLoaded } = useMapStore();
    const [monthSlider, setMonthSlider] = useState(0); // 0 = annual, 1-12 = month
    const [loadingMonthly, setLoadingMonthly] = useState(false);
    const [monthlyRecords, setMonthlyRecords] = useState<MonthlyDataRecord[]>([]);

    const isMonthly = monthSlider > 0;
    const yearMonth = isMonthly
        ? `${selectedYear}-${String(monthSlider).padStart(2, "0")}`
        : null;

    const handleYearChange = useCallback((year: string) => {
        setSelectedYear(year);
        setMonthSlider(0);
    }, [setSelectedYear]);

    const handleSliderChange = useCallback(async (value: number) => {
        setMonthSlider(value);
        if (value === 0) return;

        if (!monthlyDataLoaded) {
            setLoadingMonthly(true);
            await loadMonthlyData();
            setMonthlyDataLoaded(true);
            setLoadingMonthly(false);
        }

        const records = getMonthlyRecords(detail.id, detail.level);
        setMonthlyRecords(records);
    }, [monthlyDataLoaded, setMonthlyDataLoaded, detail.id, detail.level]);

    // Compute display records
    let displayRecords: { category: string; total_claims: number; total_beneficiaries_served: number; total_amount_paid: number }[];

    if (isMonthly && !loadingMonthly) {
        displayRecords = monthlyRecords
            .filter((r) => r.year_month === yearMonth)
            .map((r) => ({
                category: r.category,
                total_claims: r.total_claims,
                total_beneficiaries_served: r.total_beneficiaries_served,
                total_amount_paid: r.total_amount_paid,
            }));
    } else {
        displayRecords = detail.records
            .filter((r) => r.year === selectedYear)
            .map((r) => ({
                category: r.category,
                total_claims: r.total_claims,
                total_beneficiaries_served: r.total_beneficiaries_served,
                total_amount_paid: r.total_amount_paid,
            }));
    }

    const totalClaims = displayRecords.reduce((s, r) => s + r.total_claims, 0);
    const totalBeneficiaries = displayRecords.reduce((s, r) => s + r.total_beneficiaries_served, 0);
    const totalPaid = displayRecords.reduce((s, r) => s + r.total_amount_paid, 0);
    const maxClaims = Math.max(...displayRecords.map((r) => r.total_claims), 1);

    const periodLabel = isMonthly
        ? `${MONTH_NAMES[monthSlider - 1]} ${selectedYear}`
        : `${selectedYear} (Annual)`;

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
                    {detail.level === "state" ? "State" : "ZIP3 Area"}
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
                    {detail.name}
                </h2>
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
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                {/* Year selector */}
                <div style={{ marginBottom: 16 }}>
                    <p
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--ink-dim)",
                            marginBottom: 8,
                        }}
                    >
                        Year
                    </p>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {AVAILABLE_YEARS.map((year) => (
                            <button
                                key={year}
                                onClick={() => handleYearChange(year)}
                                style={{
                                    padding: "4px 10px",
                                    fontSize: 12,
                                    fontWeight: year === selectedYear ? 600 : 400,
                                    background: year === selectedYear ? "var(--accent-light)" : "var(--surface2)",
                                    color: year === selectedYear ? "var(--accent)" : "var(--ink-mid)",
                                    border: `1px solid ${year === selectedYear ? "rgba(200,70,10,0.3)" : "var(--border)"}`,
                                    borderRadius: 3,
                                    cursor: "pointer",
                                }}
                            >
                                {year}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Month slider */}
                <div style={{ marginBottom: 20 }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 6,
                        }}
                    >
                        <p
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                color: "var(--ink-dim)",
                            }}
                        >
                            Month
                        </p>
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: isMonthly ? "var(--accent)" : "var(--ink-mid)",
                            }}
                        >
                            {isMonthly ? MONTH_NAMES[monthSlider - 1] : "Annual"}
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={12}
                        value={monthSlider}
                        onChange={(e) => handleSliderChange(Number(e.target.value))}
                        style={{
                            width: "100%",
                            accentColor: "var(--accent)",
                            cursor: "pointer",
                        }}
                    />
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 9,
                            color: "var(--ink-dim)",
                            marginTop: 2,
                        }}
                    >
                        <span>Annual</span>
                        <span>Dec</span>
                    </div>
                </div>

                {/* Loading indicator */}
                {loadingMonthly && (
                    <p
                        style={{
                            fontSize: 12,
                            color: "var(--ink-mid)",
                            textAlign: "center",
                            padding: "12px 0",
                        }}
                    >
                        Loading monthly data...
                    </p>
                )}

                {/* Period label */}
                {!loadingMonthly && (
                    <>
                        {/* Summary stats */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                                marginBottom: 24,
                            }}
                        >
                            <StatCard value={totalClaims.toLocaleString()} label="Total Claims" />
                            <StatCard
                                value={totalBeneficiaries.toLocaleString()}
                                label="Beneficiaries Served"
                            />
                            <StatCard
                                value={totalPaid >= 1_000_000 ? `$${(totalPaid / 1_000_000).toFixed(1)}M` : `$${(totalPaid / 1_000).toFixed(0)}k`}
                                label="Total Paid"
                            />
                            <StatCard
                                value={totalClaims > 0 ? `$${(totalPaid / totalClaims).toFixed(0)}` : "—"}
                                label="Avg Paid / Claim"
                            />
                        </div>

                        {/* Category breakdown */}
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
                            Breakdown by Category — {periodLabel}
                        </p>
                        <div style={{ marginBottom: 24 }}>
                            {displayRecords
                                .sort((a, b) => b.total_claims - a.total_claims)
                                .map((record) => {
                                    const pct = (record.total_claims / maxClaims) * 100;
                                    const color = CATEGORY_COLORS[record.category] ?? "#999";
                                    return (
                                        <div key={record.category} style={{ marginBottom: 10 }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "baseline",
                                                    marginBottom: 4,
                                                }}
                                            >
                                                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>
                                                    {record.category}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        fontFamily: "var(--ff-serif)",
                                                        color: "var(--ink-mid)",
                                                    }}
                                                >
                                                    {record.total_claims.toLocaleString()}
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
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    marginTop: 2,
                                                }}
                                            >
                                                <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                                                    {record.total_beneficiaries_served.toLocaleString()} beneficiaries
                                                </span>
                                                <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                                                    ${(record.total_amount_paid / 1000).toFixed(0)}k paid
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        {displayRecords.length === 0 && (
                            <p style={{ fontSize: 12, color: "var(--ink-dim)", textAlign: "center", padding: 20 }}>
                                No data available for {periodLabel}
                            </p>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

function StatCard({ value, label }: { value: string; label: string }) {
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
                    fontSize: 22,
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
        </div>
    );
}
