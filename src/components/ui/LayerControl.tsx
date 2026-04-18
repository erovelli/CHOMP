import { useMapStore } from "../../lib/store";
import { LAYER_CONFIGS, LAYER_ORDER } from "../../constants/map";
import { Z_INDEX, HEADER_HEIGHT, PANEL_SHADOW } from "../../constants/layout";

export default function LayerControl() {
    const { activeLayer, setActiveLayer } = useMapStore();

    return (
        <div
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16,
                left: 16,
                zIndex: Z_INDEX.HEADER,
                width: 220,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                boxShadow: PANEL_SHADOW,
                overflow: "hidden",
                maxHeight: "calc(100vh - 120px)",
                overflowY: "auto",
            }}
        >
            <div
                style={{
                    padding: "10px 14px 8px",
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <p
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--ink-dim)",
                    }}
                >
                    Procedure Category
                </p>
            </div>

            {LAYER_ORDER.map((key) => {
                const cfg = LAYER_CONFIGS[key];
                const isActive = key === activeLayer;

                return (
                    <button
                        key={key}
                        onClick={() => setActiveLayer(key)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            padding: "9px 14px",
                            background: isActive ? "var(--accent-light)" : "transparent",
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive)
                                (e.currentTarget as HTMLButtonElement).style.background =
                                    "var(--surface2)";
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive)
                                (e.currentTarget as HTMLButtonElement).style.background =
                                    "transparent";
                        }}
                    >
                        <div
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: cfg.accent,
                                flexShrink: 0,
                            }}
                        />
                        <div style={{ flex: 1 }}>
                            <span
                                style={{
                                    display: "block",
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: isActive ? "var(--accent)" : "var(--ink)",
                                    lineHeight: 1.2,
                                }}
                            >
                                {cfg.label}
                            </span>
                            <span
                                style={{
                                    display: "block",
                                    fontSize: 10,
                                    color: "var(--ink-dim)",
                                    marginTop: 1,
                                }}
                            >
                                {cfg.description}
                            </span>
                        </div>
                        <span
                            style={{
                                fontSize: 13,
                                color: "var(--accent)",
                                opacity: isActive ? 1 : 0,
                                transition: "opacity 0.15s",
                            }}
                        >
                            ✓
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
