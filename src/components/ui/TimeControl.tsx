import { useMapStore } from "../../lib/store";
import { AVAILABLE_YEARS, MONTH_OPTIONS } from "../../constants/time";
import { Z_INDEX, HEADER_HEIGHT } from "../../constants/layout";

// Sits below GeoLevelControl + MetricControl. Two stacked rows (year + month)
// so the three view controls — geography, metric, time — live together.
export default function TimeControl() {
    const { selectedYear, selectedMonth, setSelectedYear, setSelectedMonth, monthlyDataLoaded } =
        useMapStore();
    const loadingMonthly = selectedMonth !== null && !monthlyDataLoaded;

    return (
        <div
            className="chomp-segmented chomp-segmented--stack"
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16 + 80,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: Z_INDEX.HEADER,
            }}
        >
            <div style={{ display: "flex", gap: 1 }} role="group" aria-label="Year">
                {AVAILABLE_YEARS.map((year) => {
                    const isActive = year === selectedYear;
                    return (
                        <button
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            className="chomp-segmented__btn chomp-segmented__btn--compact"
                            aria-pressed={isActive}
                        >
                            {year}
                        </button>
                    );
                })}
            </div>

            <div
                style={{ display: "flex", gap: 1, alignItems: "center" }}
                role="group"
                aria-label="Month"
            >
                {MONTH_OPTIONS.map(({ value, label }) => {
                    const isActive = value === selectedMonth;
                    return (
                        <button
                            key={label}
                            onClick={() => setSelectedMonth(value)}
                            className="chomp-segmented__btn chomp-segmented__btn--compact"
                            aria-pressed={isActive}
                        >
                            {label}
                        </button>
                    );
                })}
                {loadingMonthly && (
                    <span
                        style={{
                            marginLeft: 8,
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
