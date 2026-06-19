import { useCallback, useEffect, useRef } from "react";
import { SHEET_MIN_HEIGHT, SHEET_MAX_VIEWPORT_FRACTION } from "../constants/layout";

interface DragState {
    pointerId: number;
    startY: number;
    startHeight: number;
}

/**
 * Drag-to-resize for a bottom sheet. Returns pointer handlers to spread on
 * the sheet's grab handle; dragging sets an explicit inline height on
 * `sheetRef` (overriding the sheet's CSS-class default), clamped between
 * SHEET_MIN_HEIGHT and SHEET_MAX_VIEWPORT_FRACTION of the viewport. Dragging
 * never dismisses the sheet — closing stays on the backdrop/Done/Escape paths.
 */
export function useSheetDrag(sheetRef: React.RefObject<HTMLDivElement | null>) {
    const dragRef = useRef<DragState | null>(null);

    // If the viewport shrinks (rotation, split view) while a dragged height is
    // pinned, re-clamp so the sheet top can't end up above the screen.
    useEffect(() => {
        const onResize = () => {
            const el = sheetRef.current;
            if (!el || !el.style.height) return;
            const max = window.innerHeight * SHEET_MAX_VIEWPORT_FRACTION;
            if (parseFloat(el.style.height) > max) el.style.height = `${max}px`;
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [sheetRef]);

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            const el = sheetRef.current;
            if (!el) return;
            dragRef.current = {
                pointerId: e.pointerId,
                startY: e.clientY,
                startHeight: el.getBoundingClientRect().height,
            };
            try {
                // Keep receiving moves after the pointer leaves the handle.
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
                // Capture is an enhancement; synthetic events have no active
                // pointer to capture.
            }
        },
        [sheetRef],
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            const drag = dragRef.current;
            const el = sheetRef.current;
            if (!drag || !el || e.pointerId !== drag.pointerId) return;
            const max = window.innerHeight * SHEET_MAX_VIEWPORT_FRACTION;
            const next = Math.min(
                max,
                Math.max(SHEET_MIN_HEIGHT, drag.startHeight + (drag.startY - e.clientY)),
            );
            // Mutate the style directly — re-rendering the whole sheet on
            // every pointermove would jank the drag on low-end phones.
            el.style.height = `${next}px`;
            el.style.maxHeight = "none";
        },
        [sheetRef],
    );

    const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (dragRef.current?.pointerId !== e.pointerId) return;
        dragRef.current = null;
        try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } catch {
            // Mirror of the capture guard above.
        }
    }, []);

    return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
}
