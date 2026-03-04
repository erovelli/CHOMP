import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../constants/map";
import { CHOROPLETH_COLORS, CHOROPLETH_STOPS } from "../../lib/mapStyles";
import { formatStop } from "../../lib/formatters";
import { Z_INDEX, PANEL_SHADOW } from "../../constants/layout";

export default function Legend() {
    const { activeLayer } = useMapStore();
    const cfg = LAYER_CONFIGS[activeLayer];

    return (
        <div
            style={{
                position: "absolute",
                bottom: 36,
                left: 16,
                zIndex: Z_INDEX.HEADER,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "12px 14px",
                minWidth: 200,
                boxShadow: PANEL_SHADOW,
            }}
        >
            <p
                style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ink-dim)",
                    marginBottom: 10,
                }}
            >
                {cfg.label} — {cfg.unit}
            </p>
            <div
                style={{
                    display: "flex",
                    height: 8,
                    borderRadius: 2,
                    overflow: "hidden",
                    marginBottom: 6,
                }}
            >
                {CHOROPLETH_COLORS.map((color) => (
                    <div key={color} style={{ flex: 1, background: color }} />
                ))}
            </div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                }}
            >
                <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                    {formatStop(CHOROPLETH_STOPS[0])}
                </span>
                <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                    {formatStop(CHOROPLETH_STOPS[CHOROPLETH_STOPS.length - 1])}+
                </span>
            </div>
        </div>
    );
}
