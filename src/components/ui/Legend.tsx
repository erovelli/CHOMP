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

    // Mirror the map's `interpolate(["linear"], value, …)` paint expression:
    // position each palette color at its stop's place on a linear value axis,
    // so the color at any point in the key is the color the map actually paints
    // for that value. The stops are quantile breaks (unevenly spaced in value),
    // so the previous even-width swatches misrepresented where each color falls.
    const lo = hasStops ? colorStops[0] : 0;
    const hi = hasStops ? colorStops[colorStops.length - 1] : 0;
    const span = hi - lo;
    const scaleGradient =
        hasStops && span > 0
            ? `linear-gradient(to right, ${CHOROPLETH_COLORS.map(
                  (c, i) => `${c} ${(((colorStops[i] - lo) / span) * 100).toFixed(2)}%`,
              ).join(", ")})`
            : `linear-gradient(to right, ${CHOROPLETH_COLORS.join(", ")})`;

    return (
        <div
            style={{
                position: "absolute",
                bottom: isMobile ? "calc(12px + env(safe-area-inset-bottom, 0px))" : 36,
                left: isMobile ? 12 : 16,
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
                    position: "relative",
                    height: 8,
                    borderRadius: 2,
                    marginBottom: 6,
                    background: scaleGradient,
                    overflow: "hidden",
                }}
            >
                {/* Hairline dividers at each interior stop. The gradient keeps
                    the value-accurate ramp; these restore the per-band
                    separators from the old discrete swatches, sitting exactly
                    at each quantile break. */}
                {hasStops &&
                    span > 0 &&
                    colorStops.slice(1, -1).map((stop, i) => (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: `${((stop - lo) / span) * 100}%`,
                                width: 1,
                                background: "var(--surface)",
                            }}
                        />
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
