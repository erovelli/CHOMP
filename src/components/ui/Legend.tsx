import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../constants/map";
import { CHOROPLETH_COLORS } from "../../lib/mapStyles";
import { formatStop, formatRatio } from "../../lib/formatters";
import { Z_INDEX, PANEL_SHADOW } from "../../constants/layout";

export default function Legend() {
    const { activeLayer, metric, colorStops } = useMapStore();
    const cfg = LAYER_CONFIGS[activeLayer];
    const fmt = metric === "ratio" ? formatRatio : formatStop;
    const unit = metric === "ratio" ? "Claims / Patient" : cfg.unit;
    const hasStops = colorStops.length > 0;

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
                {cfg.label} — {unit}
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
                    {hasStops ? fmt(colorStops[0]) : "—"}
                </span>
                <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                    {hasStops ? `${fmt(colorStops[colorStops.length - 1])}+` : "—"}
                </span>
            </div>
            <p
                style={{
                    fontSize: 9,
                    color: "var(--ink-dim)",
                    marginTop: 8,
                }}
            >
                Scale adjusts to the current view
            </p>
        </div>
    );
}
