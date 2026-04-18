import { useState, useCallback, useEffect } from "react";
import { useMapStore } from "../../../lib/store";
import type { RegionDetail, MonthlyDataRecord } from "../../../lib/types";
import { loadMonthlyData, getMonthlyRecords } from "../../../lib/dataService";
import { formatCurrency } from "../../../lib/formatters";
import { AVAILABLE_YEARS, MONTH_NAMES } from "../../../constants/time";
import StatCard from "./StatCard";
import CategoryBreakdown from "./CategoryBreakdown";

export default function PanelContent({
    detail,
    onClose,
}: {
    detail: RegionDetail;
    onClose: () => void;
}) {
    const { selectedYear, setSelectedYear, monthlyDataLoaded, setMonthlyDataLoaded } =
        useMapStore();
    const [monthSlider, setMonthSlider] = useState(0);
    const [loadingMonthly, setLoadingMonthly] = useState(false);
    const [monthlyRecords, setMonthlyRecords] = useState<MonthlyDataRecord[]>([]);

    const isMonthly = monthSlider > 0;
    const yearMonth = isMonthly ? `${selectedYear}-${String(monthSlider).padStart(2, "0")}` : null;

    // Re-fetch monthly records when the selected region changes while in monthly view
    useEffect(() => {
        if (monthSlider > 0 && monthlyDataLoaded) {
            setMonthlyRecords(getMonthlyRecords(detail.id, detail.level));
        }
    }, [detail.id, detail.level, monthSlider, monthlyDataLoaded]);

    const handleYearChange = useCallback(
        (year: string) => {
            setSelectedYear(year);
            setMonthSlider(0);
        },
        [setSelectedYear],
    );

    const handleSliderChange = useCallback(
        async (value: number) => {
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
        },
        [monthlyDataLoaded, setMonthlyDataLoaded, detail.id, detail.level],
    );

    // Compute display records
    let displayRecords: {
        category: string;
        total_claims: number;
        total_beneficiaries_served: number;
        total_amount_paid: number;
    }[];

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
                                    background:
                                        year === selectedYear
                                            ? "var(--accent-light)"
                                            : "var(--surface2)",
                                    color:
                                        year === selectedYear ? "var(--accent)" : "var(--ink-mid)",
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

                {/* Stats + breakdown */}
                {!loadingMonthly && (
                    <>
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
                            <StatCard value={formatCurrency(totalPaid)} label="Total Paid" />
                            <StatCard
                                value={
                                    totalClaims > 0
                                        ? `$${(totalPaid / totalClaims).toFixed(0)}`
                                        : "—"
                                }
                                label="Avg Paid / Claim"
                            />
                        </div>

                        <CategoryBreakdown records={displayRecords} periodLabel={periodLabel} />
                    </>
                )}
            </div>
        </>
    );
}
