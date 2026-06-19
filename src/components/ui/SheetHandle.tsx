import { useSheetDrag } from "../../lib/useSheetDrag";

// Grab handle for bottom sheets: dragging it resizes the sheet between
// SHEET_MIN_HEIGHT and most of the viewport. Purely a resize affordance —
// dismissing stays on the backdrop / Done / ✕ paths.
export default function SheetHandle({
    sheetRef,
}: {
    sheetRef: React.RefObject<HTMLDivElement | null>;
}) {
    const dragHandlers = useSheetDrag(sheetRef);

    return (
        <div
            {...dragHandlers}
            style={{
                display: "flex",
                justifyContent: "center",
                // Generous hit area around the 4px pill so the drag is easy
                // to start with a thumb.
                padding: "12px 0 10px",
                flexShrink: 0,
                touchAction: "none",
                cursor: "grab",
            }}
        >
            <div
                style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--border-dark)",
                }}
            />
        </div>
    );
}
