import { useMapStore } from "../../../lib/store";
import { HEADER_HEIGHT, Z_INDEX, DETAIL_PANEL_WIDTH, PANEL_TRANSITION } from "../../../constants/layout";
import PanelContent from "./PanelContent";

export default function DetailPanel() {
    const { panelOpen, selectedDetail, setSelectedRegion } = useMapStore();
    const close = () => setSelectedRegion(null, null);

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
