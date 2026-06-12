import { useMapStore } from "../../lib/store";
import { DETAIL_PANEL_WIDTH, HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";
import { useIsMobile } from "../../lib/useMediaQuery";

export default function ClickHint() {
    const isMobile = useIsMobile();
    const { hintVisible, panelOpen } = useMapStore();

    // Mobile: top-center under the header (the bottom strip belongs to the
    // legend and the desktop spot would collide with it).
    const position: React.CSSProperties = isMobile
        ? { top: HEADER_HEIGHT + 12, left: "50%", transform: "translateX(-50%)" }
        : { bottom: 36, right: panelOpen ? 16 : DETAIL_PANEL_WIDTH - 4 };

    return (
        <div
            style={{
                position: "absolute",
                ...position,
                zIndex: Z_INDEX.HEADER,
                background: "var(--ink)",
                color: "#fff",
                fontSize: 11,
                padding: "8px 12px",
                borderRadius: 3,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                opacity: hintVisible ? 0.8 : 0,
                transition: "opacity 0.3s, right 0.3s cubic-bezier(0.22,1,0.36,1)",
            }}
        >
            {isMobile ? "Tap" : "Click"} any region to see details
        </div>
    );
}
