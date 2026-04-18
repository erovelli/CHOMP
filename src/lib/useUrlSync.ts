import { useEffect } from "react";
import { useMapStore } from "./store";
import { readUrlState, writeUrlState } from "./urlState";

/**
 * Bidirectional sync between the Zustand store and the URL query string.
 *
 * Scope: layer, year, month. Region selection is intentionally *not* mirrored
 * yet — hydrating a region selection requires waiting for annual data to load
 * and synthesizing a `RegionDetail`, which is a follow-up in the roadmap.
 */
export function useUrlSync(): void {
    useEffect(() => {
        const initial = readUrlState();
        const store = useMapStore.getState();
        if (initial.layer) store.setActiveLayer(initial.layer);
        if (initial.year) store.setSelectedYear(initial.year);
        if (initial.month) store.setSelectedMonth(initial.month);
    }, []);

    useEffect(() => {
        let lastSerialized = "";
        return useMapStore.subscribe((state) => {
            const next = {
                layer: state.activeLayer,
                year: state.selectedYear,
                month: state.selectedMonth,
            };
            const serialized = JSON.stringify(next);
            if (serialized === lastSerialized) return;
            lastSerialized = serialized;
            writeUrlState(next);
        });
    }, []);
}
