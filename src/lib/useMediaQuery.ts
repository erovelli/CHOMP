import { useCallback, useSyncExternalStore } from "react";
import { MOBILE_MEDIA_QUERY, COARSE_POINTER_QUERY } from "../constants/layout";

/**
 * Reactive media-query match. Re-renders when the query flips (rotation,
 * window resize across the breakpoint, attaching a mouse to a tablet).
 * Returns false in environments without matchMedia (jsdom).
 */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (onChange: () => void) => {
            if (typeof window.matchMedia !== "function") return () => {};
            const mql = window.matchMedia(query);
            mql.addEventListener("change", onChange);
            return () => mql.removeEventListener("change", onChange);
        },
        [query],
    );
    const getSnapshot = useCallback(
        () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
        [query],
    );
    return useSyncExternalStore(subscribe, getSnapshot);
}

/** Compact layout: floating control chrome collapses into bottom sheets. */
export function useIsMobile(): boolean {
    return useMediaQuery(MOBILE_MEDIA_QUERY);
}

/** Touch-first device (no hover) — suppress hover-only affordances. */
export function useIsCoarsePointer(): boolean {
    return useMediaQuery(COARSE_POINTER_QUERY);
}
