export const HEADER_HEIGHT = 52;
export const DETAIL_PANEL_WIDTH = 360;

// At or below this width the floating control chrome (category list, centered
// geo/metric/time controls) collapses into the Filters bottom sheet and the
// detail panel becomes a bottom sheet. 900 keeps iPad portrait (≤834px) on the
// touch layout — the centered TimeControl (~380px wide) collides with the
// 220px category panel below ~850px — while iPad landscape (1024px) gets the
// full desktop chrome.
export const MOBILE_BREAKPOINT = 900;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;
// Touch-first devices (no hover) — used to suppress hover-only affordances
// like the cursor tooltip and the zoom-button control.
export const COARSE_POINTER_QUERY = "(hover: none)";

// Bottom sheets (filters, mobile detail panel) span the viewport on phones but
// cap out centered on tablet-portrait widths so they don't stretch edge-to-edge.
export const SHEET_MAX_WIDTH = 560;

// Drag-resize bounds for bottom sheets: never shorter than the grab handle
// plus the footer strip, never taller than most of the viewport.
export const SHEET_MIN_HEIGHT = 140;
export const SHEET_MAX_VIEWPORT_FRACTION = 0.92;

export const Z_INDEX = {
    HEADER: 50,
    PANEL: 60,
    // Filter sheet sits above the detail panel but below tooltip/modals.
    SHEET: 90,
    TOOLTIP: 200,
    MODAL: 300,
} as const;

export const PANEL_TRANSITION = "0.3s cubic-bezier(0.22, 1, 0.36, 1)";
export const PANEL_SHADOW = "0 2px 12px rgba(0,0,0,0.08)";
