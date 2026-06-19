import { useMemo } from "react";
import { useMapStore } from "../../../lib/store";
import type { RegionDetail, MonthlyDataRecord } from "../../../lib/types";
import { getMonthlyRecords, getEnrolleesFor } from "../../../lib/dataService";
import { formatCurrency } from "../../../lib/formatters";
import { MONTH_NAMES } from "../../../constants/time";
import StatCard from "./StatCard";
import CategoryBreakdown from "./CategoryBreakdown";

export default function PanelContent({
    detail,
    onClose,
}: {
    detail: RegionDetail;
    onClose: () => void;
}) {
    // Year + month live in the main-menu TimeControl now; the panel just reads
    // them from the store so the displayed stats follow whatever period the
    // user picked up there.
    const { selectedYear, selectedMonth, monthlyDataLoaded } = useMapStore();
    const isMonthly = selectedMonth !== null;
    const yearMonth = isMonthly ? `${selectedYear}-${selectedMonth}` : null;

    // Monthly records are a synchronous lookup from the already-loaded cache, so
    // derive them during render rather than mirroring into state via an effect.
    const monthlyRecords = useMemo<MonthlyDataRecord[]>(
        () => (isMonthly && monthlyDataLoaded ? getMonthlyRecords(detail.id, detail.level) : []),
        [detail.id, detail.level, isMonthly, monthlyDataLoaded],
    );

    const loadingMonthly = isMonthly && !monthlyDataLoaded;

    let displayRecords: {
        category: string;
        total_claims: number;
        total_amount_paid: number;
    }[];

    if (isMonthly && !loadingMonthly) {
        displayRecords = monthlyRecords
            .filter((r) => r.year_month === yearMonth)
            .map((r) => ({
                category: r.category,
                total_claims: r.total_claims,
                total_amount_paid: r.total_amount_paid,
            }));
    } else {
        displayRecords = detail.records
            .filter((r) => r.year === selectedYear)
            .map((r) => ({
                category: r.category,
                total_claims: r.total_claims,
                total_amount_paid: r.total_amount_paid,
            }));
    }

    const totalClaims = displayRecords.reduce((s, r) => s + r.total_claims, 0);
    const totalPaid = displayRecords.reduce((s, r) => s + r.total_amount_paid, 0);
    // ACS C27007 endpoint-year enrollment for this geography. Annual only —
    // monthly views reuse the year's value (matches the map). Using ACS instead
    // of SUM(total_beneficiaries_served) avoids the per-category double-count
    // that made the old "Claims / Patient" stat structurally biased low.
    const medicaidEnrollees = getEnrolleesFor(detail.level, detail.id, selectedYear);

    const periodLabel =
        isMonthly && selectedMonth
            ? `${MONTH_NAMES[Number(selectedMonth) - 1]} ${selectedYear}`
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
                    {detail.level === "state"
                        ? "State"
                        : detail.level === "county"
                          ? "County"
                          : "ZIP3 Area"}
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
                <p
                    style={{
                        fontSize: 11,
                        color: "var(--ink-mid)",
                        marginTop: 4,
                    }}
                >
                    {periodLabel}
                </p>
                <button
                    onClick={onClose}
                    aria-label="Close details"
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
                                value={
                                    medicaidEnrollees != null && medicaidEnrollees > 0
                                        ? medicaidEnrollees.toLocaleString()
                                        : "—"
                                }
                                label="Medicaid Enrollees"
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
                            <StatCard
                                value={
                                    medicaidEnrollees != null && medicaidEnrollees > 0
                                        ? (totalClaims / medicaidEnrollees).toFixed(2)
                                        : "—"
                                }
                                label="Claims / Enrollee"
                            />
                        </div>

                        <CategoryBreakdown records={displayRecords} periodLabel={periodLabel} />
                    </>
                )}
            </div>
        </>
    );
}
