import { useMapStore } from "../../lib/store";
import { Z_INDEX, HEADER_HEIGHT } from "../../constants/layout";
import { METRIC_OPTIONS } from "../../constants/map";

// Sits directly under the geography toggle (GeoLevelControl) at top-center.
export default function MetricControl() {
    const { metric, setMetric } = useMapStore();

    return (
        <div
            className="chomp-segmented chomp-segmented--row"
            role="group"
            aria-label="Metric"
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16 + 40,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: Z_INDEX.HEADER,
            }}
        >
            {METRIC_OPTIONS.map(({ key, label }) => {
                const isActive = key === metric;
                return (
                    <button
                        key={key}
                        onClick={() => setMetric(key)}
                        className="chomp-segmented__btn"
                        aria-pressed={isActive}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
