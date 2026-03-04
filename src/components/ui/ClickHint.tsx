import { useMapStore } from "../../lib/store";
import { DETAIL_PANEL_WIDTH, Z_INDEX } from "../../constants/layout";

export default function ClickHint() {
    const { hintVisible, panelOpen } = useMapStore();

    return (
        <div
            style={{
                position: "absolute",
                bottom: 36,
                right: panelOpen ? 16 : DETAIL_PANEL_WIDTH - 4,
                zIndex: Z_INDEX.HEADER,
                background: "var(--ink)",
                color: "#fff",
                fontSize: 11,
                padding: "8px 12px",
                borderRadius: 3,
                pointerEvents: "none",
                opacity: hintVisible ? 0.8 : 0,
                transition: "opacity 0.3s, right 0.3s cubic-bezier(0.22,1,0.36,1)",
            }}
        >
            Click any region to see details
        </div>
    );
}
