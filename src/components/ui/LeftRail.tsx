import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS, LAYER_ORDER, GEO_LEVELS, METRIC_OPTIONS } from "../../constants/map";
import { AVAILABLE_YEARS, MONTH_NAMES } from "../../constants/time";
import { HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";

// Desktop control panel: one editorial card at top-left, sans-only, monochrome.
// Selection language is weight + subtle background; the accent color is
// deliberately kept out of the rail so it stays reserved for the primary CTA
// (Export) and interactive feedback (hover, focus) elsewhere in the app.
export default function LeftRail() {
    const {
        activeLayer,
        setActiveLayer,
        geoLevel,
        setGeoLevel,
        metric,
        setMetric,
        selectedMonth,
        selectedYear,
        monthlyDataLoaded,
    } = useMapStore();
    const loadingMonthly = selectedMonth !== null && !monthlyDataLoaded;
    const isAllMonths = selectedMonth === null;
    const currentMonthLabel = isAllMonths
        ? "All months"
        : MONTH_NAMES[parseInt(selectedMonth, 10) - 1];

    return (
        <aside
            className="chomp-rail-card"
            aria-label="Map controls"
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16,
                left: 16,
                width: 244,
                maxHeight: `calc(100vh - ${HEADER_HEIGHT + 32}px)`,
                zIndex: Z_INDEX.HEADER,
            }}
        >
            <div className="chomp-rail-scroll">
                <Group title="Geography">
                    <div role="radiogroup" aria-label="Geography">
                        {GEO_LEVELS.map(({ key, label }) => (
                            <RadioRow
                                key={key}
                                label={label}
                                checked={key === geoLevel}
                                onSelect={() => setGeoLevel(key)}
                            />
                        ))}
                    </div>
                </Group>

                <Group title="Metric">
                    <div role="radiogroup" aria-label="Metric">
                        {METRIC_OPTIONS.map(({ key, label }) => (
                            <RadioRow
                                key={key}
                                label={label}
                                checked={key === metric}
                                onSelect={() => setMetric(key)}
                            />
                        ))}
                    </div>
                </Group>

                <Group title="Year" trailing={<HeadingValue>{selectedYear}</HeadingValue>}>
                    <YearSlider />
                </Group>

                <Group
                    title="Month"
                    hint={loadingMonthly ? "loading…" : undefined}
                    trailing={<HeadingValue muted={isAllMonths}>{currentMonthLabel}</HeadingValue>}
                >
                    <MonthSlider />
                    <AllMonthsButton />
                </Group>

                <Group title="Procedure Category">
                    <div role="radiogroup" aria-label="Procedure Category">
                        {LAYER_ORDER.map((key) => {
                            const cfg = LAYER_CONFIGS[key];
                            return (
                                <RadioRow
                                    key={key}
                                    label={cfg.label}
                                    checked={key === activeLayer}
                                    onSelect={() => setActiveLayer(key)}
                                />
                            );
                        })}
                    </div>
                </Group>
            </div>
        </aside>
    );
}

function Group({
    title,
    hint,
    trailing,
    children,
}: {
    title: string;
    hint?: string;
    trailing?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="chomp-rail-group">
            <p className="chomp-rail-heading">
                <span>
                    {title}
                    {hint && <span className="chomp-rail-heading__value--muted"> · {hint}</span>}
                </span>
                {trailing}
            </p>
            {children}
        </div>
    );
}

function HeadingValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
    return (
        <span
            className={`chomp-rail-heading__value${muted ? " chomp-rail-heading__value--muted" : ""}`}
        >
            {children}
        </span>
    );
}

function RadioRow({
    label,
    checked,
    onSelect,
}: {
    label: string;
    checked: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={onSelect}
            className="chomp-rail-radio"
        >
            <span className="chomp-rail-radio__label">{label}</span>
        </button>
    );
}

function YearSlider() {
    const { selectedYear, setSelectedYear } = useMapStore();
    const min = parseInt(AVAILABLE_YEARS[0], 10);
    const max = parseInt(AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1], 10);
    const value = parseInt(selectedYear, 10);

    return (
        <>
            <div className="chomp-rail-slider-track">
                <input
                    type="range"
                    className="chomp-rail-slider"
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    onChange={(e) => setSelectedYear(String(e.target.valueAsNumber))}
                    aria-label="Year"
                />
            </div>
            <div className="chomp-rail-slider-endpoints">
                <span>{AVAILABLE_YEARS[0]}</span>
                <span>{AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]}</span>
            </div>
        </>
    );
}

function MonthSlider() {
    const { selectedMonth, setSelectedMonth } = useMapStore();
    // Slider is always enabled — dragging always sets a specific month, which
    // is the natural way to leave the All state. To return to All, use the
    // AllMonthsButton below the slider.
    const monthInt = selectedMonth === null ? 1 : parseInt(selectedMonth, 10);

    return (
        <>
            <div className="chomp-rail-slider-track">
                <input
                    type="range"
                    className="chomp-rail-slider"
                    min={1}
                    max={12}
                    step={1}
                    value={monthInt}
                    onChange={(e) =>
                        setSelectedMonth(String(e.target.valueAsNumber).padStart(2, "0"))
                    }
                    aria-label="Month"
                />
            </div>
            <div className="chomp-rail-slider-endpoints">
                <span>Jan</span>
                <span>Dec</span>
            </div>
        </>
    );
}

function AllMonthsButton() {
    const { selectedMonth, setSelectedMonth } = useMapStore();
    const isAll = selectedMonth === null;
    return (
        <div className="chomp-rail-reset-row">
            <button
                type="button"
                className="chomp-rail-reset"
                aria-pressed={isAll}
                onClick={() => setSelectedMonth(null)}
            >
                All months
            </button>
        </div>
    );
}
