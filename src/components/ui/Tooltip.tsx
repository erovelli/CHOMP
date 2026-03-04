import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../constants/map";
import { Z_INDEX } from "../../constants/layout";

export default function Tooltip() {
    const { hoveredRegion, hoveredValue, hoveredPoint, activeLayer } =
        useMapStore();
    const cfg = LAYER_CONFIGS[activeLayer];

    if (!hoveredRegion || hoveredPoint === null) return null;

    return (
        <div
            style={{
                position: "absolute",
                zIndex: Z_INDEX.TOOLTIP,
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
            <span style={{ fontWeight: 600 }}>{hoveredRegion}</span>
            <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
            <span>
                {hoveredValue != null ? hoveredValue.toLocaleString() : "—"} {cfg.unit}
            </span>
        </div>
    );
}
