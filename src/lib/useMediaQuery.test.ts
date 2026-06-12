import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

// jsdom has no matchMedia; install a controllable stub.
function installMatchMedia(initialMatches: boolean) {
    const listeners = new Set<() => void>();
    let matches = initialMatches;
    const mql = {
        get matches() {
            return matches;
        },
        addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
    return {
        setMatches(next: boolean) {
            matches = next;
            listeners.forEach((cb) => cb());
        },
        listenerCount: () => listeners.size,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
    it("reflects the initial match state", () => {
        installMatchMedia(true);
        const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
        expect(result.current).toBe(true);
    });

    it("re-renders when the query flips", () => {
        const media = installMatchMedia(false);
        const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
        expect(result.current).toBe(false);

        act(() => media.setMatches(true));
        expect(result.current).toBe(true);

        act(() => media.setMatches(false));
        expect(result.current).toBe(false);
    });

    it("removes its listener on unmount", () => {
        const media = installMatchMedia(false);
        const { unmount } = renderHook(() => useMediaQuery("(max-width: 900px)"));
        expect(media.listenerCount()).toBe(1);
        unmount();
        expect(media.listenerCount()).toBe(0);
    });

    it("returns false when matchMedia is unavailable", () => {
        vi.stubGlobal("matchMedia", undefined);
        const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
        expect(result.current).toBe(false);
    });
});
