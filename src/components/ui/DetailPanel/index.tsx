import { useRef } from "react";
import { useMapStore } from "../../../lib/store";
import {
    HEADER_HEIGHT,
    Z_INDEX,
    DETAIL_PANEL_WIDTH,
    SHEET_MAX_WIDTH,
    PANEL_TRANSITION,
} from "../../../constants/layout";
import { useIsMobile } from "../../../lib/useMediaQuery";
import SheetHandle from "../SheetHandle";
import PanelContent from "./PanelContent";

export default function DetailPanel() {
    const isMobile = useIsMobile();
    const sheetRef = useRef<HTMLDivElement>(null);
    const { panelOpen, selectedDetail, setSelectedRegion } = useMapStore();
    const close = () => setSelectedRegion(null, null);

    // Mobile: bottom sheet sliding up over the map (the map above it stays
    // interactive, so tapping another region swaps the content in place).
    if (isMobile) {
        return (
            <div
                ref={sheetRef}
                className="sheet-detail"
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    margin: "0 auto",
                    maxWidth: SHEET_MAX_WIDTH,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderBottom: "none",
                    borderRadius: "14px 14px 0 0",
                    boxShadow: "0 -6px 24px rgba(0,0,0,0.16)",
                    zIndex: Z_INDEX.PANEL,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)",
                    // 105% so the box shadow doesn't peek above the viewport edge.
                    transform: panelOpen ? "translateY(0)" : "translateY(105%)",
                    transition: `transform ${PANEL_TRANSITION}`,
                }}
            >
                <SheetHandle sheetRef={sheetRef} />
                {selectedDetail && <PanelContent detail={selectedDetail} onClose={close} />}
            </div>
        );
    }

    return (
        <div
            style={{
                position: "absolute",
                top: HEADER_HEIGHT,
                right: 0,
                bottom: 0,
                width: DETAIL_PANEL_WIDTH,
                background: "var(--surface)",
                borderLeft: "1px solid var(--border)",
                zIndex: Z_INDEX.PANEL,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                transform: panelOpen ? "translateX(0)" : "translateX(100%)",
                transition: `transform ${PANEL_TRANSITION}`,
            }}
        >
            {selectedDetail && <PanelContent detail={selectedDetail} onClose={close} />}
        </div>
    );
}
