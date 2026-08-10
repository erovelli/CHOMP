import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS } from "../../constants/map";
import { CHOROPLETH_COLORS } from "../../lib/mapStyles";
import { formatStop, formatRatio } from "../../lib/formatters";
import { Z_INDEX, PANEL_SHADOW } from "../../constants/layout";
import { useIsMobile } from "../../lib/useMediaQuery";

export default function Legend() {
    const isMobile = useIsMobile();
    const { activeLayer, metric, colorStops } = useMapStore();
    const cfg = LAYER_CONFIGS[activeLayer];
    const fmt = metric === "enrollees" ? formatRatio : formatStop;
    const unit = metric === "enrollees" ? "Claims / Medicaid enrollee" : cfg.unit;
    const hasStops = colorStops.length > 0;

    return (
        <div
            style={{
                position: "absolute",
                bottom: isMobile ? "calc(12px + env(safe-area-inset-bottom, 0px))" : 36,
                left: isMobile ? 12 : 276,
                zIndex: Z_INDEX.HEADER,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: isMobile ? "8px 10px" : "12px 14px",
                minWidth: isMobile ? 150 : 200,
                maxWidth: isMobile ? "60vw" : undefined,
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
                <span className="tnum" style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                    {hasStops ? fmt(colorStops[0]) : "—"}
                </span>
                <span className="tnum" style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                    {hasStops ? `${fmt(colorStops[colorStops.length - 1])}+` : "—"}
                </span>
            </div>
            {!isMobile && (
                <p
                    style={{
                        fontSize: 9,
                        color: "var(--ink-dim)",
                        marginTop: 8,
                    }}
                >
                    {metric === "enrollees"
                        ? "Capped at 95th percentile; outliers saturate"
                        : "Scale adjusts to the current view"}
                </p>
            )}
        </div>
    );
}
