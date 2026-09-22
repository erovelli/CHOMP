import type { LayerKey, DqTopicKey } from "./types";
import { LAYER_ORDER } from "../constants/map";
import { AVAILABLE_YEARS } from "../constants/time";
import { DQ_TOPIC_ORDER } from "../constants/dq";

/**
 * `dq` encodes the Data Quality overlay:
 *   - a topic key ("claims-volume", "link-bene", ...) turns the overlay ON
 *     with that topic
 *   - absent → overlay OFF (the app default; keeps shareable links short)
 * "off" is still parsed for backward-compat with earlier links but no longer
 * emitted — the default is now hidden, so absence already means off.
 */
export interface UrlState {
    layer?: LayerKey;
    year?: string;
    month?: string | null;
    dq?: DqTopicKey | "off";
}

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isLayerKey(value: string | null): value is LayerKey {
    return value !== null && (LAYER_ORDER as readonly string[]).includes(value);
}

function isYear(value: string | null): value is string {
    return value !== null && AVAILABLE_YEARS.includes(value);
}

function isYearMonth(value: string | null): value is string {
    return value !== null && YEAR_MONTH_PATTERN.test(value);
}

function isDqTopic(value: string | null): value is DqTopicKey {
    return value !== null && (DQ_TOPIC_ORDER as readonly string[]).includes(value);
}

export function parseUrlState(search: string): UrlState {
    const params = new URLSearchParams(search);
    const state: UrlState = {};

    const layer = params.get("layer");
    if (isLayerKey(layer)) state.layer = layer;

    const year = params.get("year");
    if (isYear(year)) state.year = year;

    const month = params.get("month");
    if (isYearMonth(month)) state.month = month;

    const dq = params.get("dq");
    if (dq === "off") state.dq = "off";
    else if (isDqTopic(dq)) state.dq = dq;

    return state;
}

export function serializeUrlState(state: UrlState): string {
    const params = new URLSearchParams();

    if (state.layer && state.layer !== "all") params.set("layer", state.layer);
    if (state.year) params.set("year", state.year);
    if (state.month) params.set("month", state.month);
    // Overlay is hidden by default, so we only emit `dq` when it's visible.
    // "off" is the implicit default when the param is absent; we never write
    // it (nor the default topic — a bare `?dq=claims-volume` link is short
    // and self-describing).
    if (state.dq && state.dq !== "off") params.set("dq", state.dq);

    const query = params.toString();
    return query ? `?${query}` : "";
}

/** Read URL state from `window.location.search`. SSR-safe (returns empty state server-side). */
export function readUrlState(): UrlState {
    if (typeof window === "undefined") return {};
    return parseUrlState(window.location.search);
}

/**
 * Replace the current URL's search string with the serialized state.
 * Uses `history.replaceState` so it never adds a history entry — the back
 * button still takes the user to the page they came from, not to every
 * layer/year/month they clicked through.
 */
export function writeUrlState(state: UrlState): void {
    if (typeof window === "undefined") return;
    const nextSearch = serializeUrlState(state);
    if (nextSearch === window.location.search) return;
    const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
}
