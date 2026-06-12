import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../constants/map";
import { Z_INDEX } from "../../constants/layout";
import { formatRatio } from "../../lib/formatters";
import { useIsCoarsePointer } from "../../lib/useMediaQuery";

export default function Tooltip() {
    const coarsePointer = useIsCoarsePointer();
    const { hoveredRegion, hoveredValue, hoveredPoint, activeLayer, metric } = useMapStore();
    const cfg = LAYER_CONFIGS[activeLayer];

    // Touch devices have no hover; a tap would pin the tooltip at the tap
    // point with no mouseleave to clear it. The detail sheet covers tap.
    if (coarsePointer) return null;
    if (!hoveredRegion || hoveredPoint === null) return null;

    const valueLabel =
        hoveredValue == null
            ? "—"
            : metric === "enrollees"
              ? Number.isFinite(hoveredValue)
                  ? `${formatRatio(hoveredValue)} claims / Medicaid enrollee`
                  : "no enrollment data"
              : `${hoveredValue.toLocaleString()} ${cfg.unit}`;

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
            <span>{valueLabel}</span>
        </div>
    );
}
