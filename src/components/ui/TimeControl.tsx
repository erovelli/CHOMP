import { useMapStore } from "../../lib/store";
import { AVAILABLE_YEARS } from "../../constants/time";
import { Z_INDEX, HEADER_HEIGHT } from "../../constants/layout";

// "All" + 12 months. Picking a month repaints the choropleth with monthly
// values (lazy-loads the monthly NDJSON on first use). "All" reverts to the
// annual view.
const MONTHS: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    { value: "01", label: "Jan" },
    { value: "02", label: "Feb" },
    { value: "03", label: "Mar" },
    { value: "04", label: "Apr" },
    { value: "05", label: "May" },
    { value: "06", label: "Jun" },
    { value: "07", label: "Jul" },
    { value: "08", label: "Aug" },
    { value: "09", label: "Sep" },
    { value: "10", label: "Oct" },
    { value: "11", label: "Nov" },
    { value: "12", label: "Dec" },
];

// Sits below GeoLevelControl + MetricControl. Two stacked rows (year + month)
// so the three view controls — geography, metric, time — live together.
export default function TimeControl() {
    const { selectedYear, selectedMonth, setSelectedYear, setSelectedMonth, monthlyDataLoaded } =
        useMapStore();
    const loadingMonthly = selectedMonth !== null && !monthlyDataLoaded;

    return (
        <div
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16 + 80,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: Z_INDEX.HEADER,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
        >
            {/* Year row */}
            <div style={{ display: "flex", gap: 2 }}>
                {AVAILABLE_YEARS.map((year) => {
                    const isActive = year === selectedYear;
                    return (
                        <button
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            style={buttonStyle(isActive, 11)}
                        >
                            {year}
                        </button>
                    );
                })}
            </div>

            {/* Month row */}
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                {MONTHS.map(({ value, label }) => {
                    const isActive = value === selectedMonth;
                    return (
                        <button
                            key={label}
                            onClick={() => setSelectedMonth(value)}
                            style={buttonStyle(isActive, 7)}
                        >
                            {label}
                        </button>
                    );
                })}
                {loadingMonthly && (
                    <span
                        style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "var(--ink-dim)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        loading…
                    </span>
                )}
            </div>
        </div>
    );
}

function buttonStyle(isActive: boolean, padX: number): React.CSSProperties {
    return {
        padding: `4px ${padX}px`,
        fontSize: 11,
        fontWeight: isActive ? 600 : 500,
        color: isActive ? "var(--accent)" : "var(--ink-mid)",
        background: isActive ? "var(--accent-light)" : "transparent",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        transition: "background 0.12s, color 0.12s",
    };
}
