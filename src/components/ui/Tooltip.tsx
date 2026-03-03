import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../lib/types";

export default function Tooltip() {
    const { hoveredZCTA, hoveredValue, hoveredPoint, activeLayer } =
        useMapStore();
    const cfg = LAYER_CONFIGS[activeLayer];

    if (!hoveredZCTA || hoveredPoint === null) return null;

    return (
        <div
            style={{
                position: "absolute",
                zIndex: 200,
                left: hoveredPoint.x,
                top: hoveredPoint.y,
                transform: "translate(-50%, calc(-100% - 8px))",
                background: "var(--ink)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 500,
                padding: "6px 10px",
                borderRadius: 3,
                pointerEvents: "none",
                whiteSpace: "nowrap",
            }}
        >
            <span style={{ fontWeight: 600 }}>ZCTA {hoveredZCTA}</span>
            <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
            <span>
                {hoveredValue ?? "—"} {cfg.unit}
            </span>
        </div>
    );
}
