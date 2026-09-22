import type { DqTopicKey, DqAssessment } from "../lib/types";

// ── DQ Atlas overlay ─────────────────────────────────────────

export const DQ_DATA_PATH = "data/dq_atlas.json";

/** Default topic on first load; also the topic re-selected when the URL asks
 * for the overlay but doesn't name a topic. Kept in one place so the store,
 * DqControl, and URL parser agree. */
export const DEFAULT_DQ_TOPIC: DqTopicKey = "claims-volume";

/** Ordered list of the 10 topics the overlay surfaces. Drives the sidebar
 * topic list, the FilterSheet chips, and the DetailPanel ribbon.
 *
 * Ordered by **how directly each check affects the numbers CHOMP displays**,
 * not by taxonomy. Outpatient claim volume leads because it's the map's
 * primary encoding — if a state's total OT volume isn't credible, every
 * other number derived from it inherits that doubt. Then the joins that
 * shape geography (provider) and the per-enrollee denominator (bene), then
 * the CDT categorization (proc-cd-prof, since dental is nearly all
 * professional), then payment-stat accuracy, then secondary/context checks.
 */
export const DQ_TOPIC_ORDER: DqTopicKey[] = [
    "claims-volume",
    "link-providers",
    "link-bene",
    "proc-cd-prof",
    "missing-pmt-ffs",
    "missing-pmt-enc",
    "pmt-consistency",
    "service-users",
    "cmc-encounters",
    "proc-cd-inst",
];

/** Human-facing labels. Deliberately un-technical: no em-dashes, and the
 * CMS abbreviations `OT` (the TAF "Other Services" file) and `CMC`
 * (Comprehensive Managed Care) are glossed as "outpatient" and "managed
 * care". `FFS` and "encounters" are Medicaid terms-of-art that every analyst
 * uses; expanding them would read more bureaucratic, not less. Kept in sync
 * with scripts/build_dq_atlas.py's TOPIC_PATTERNS titles at build time —
 * these labels are what the front end shows on top. */
export const DQ_TOPIC_LABELS: Record<DqTopicKey, string> = {
    "link-bene": "Claims-to-beneficiary linking",
    "link-providers": "Claims-to-provider linking",
    "claims-volume": "Outpatient claim volume",
    "service-users": "Outpatient service users",
    "cmc-encounters": "Managed care encounter volume",
    "missing-pmt-ffs": "Missing payment data on FFS claims",
    "missing-pmt-enc": "Missing payment data on encounters",
    "pmt-consistency": "Outpatient payment consistency",
    "proc-cd-prof": "Professional claim procedure codes",
    "proc-cd-inst": "Institutional claim procedure codes",
};

/** Traffic-light palette + neutral grey. Chosen for legibility over the teal
 * choropleth: green/amber/orange/red reads unambiguously as severity, grey
 * signals "no assessment given". */
export const DQ_ASSESSMENT_COLORS: Record<DqAssessment, string> = {
    "Low concern": "#2ca02c",
    "Medium concern": "#f0c419",
    "High concern": "#e07b00",
    Unusable: "#b3001b",
    Unclassified: "#8a8a8a",
};

/** Rendering order for the legend swatches and for the DetailPanel chips. */
export const DQ_ASSESSMENT_ORDER: DqAssessment[] = [
    "Low concern",
    "Medium concern",
    "High concern",
    "Unusable",
    "Unclassified",
];

// ── Ring layer paint ─────────────────────────────────────────
// One halo + one line layer per severity tier. Two problems this solves:
//
//   1. Bare ring vanishes against a similar-hue choropleth fill (green rings
//      on teal states) or clashes on pastel ones. The white halo gives every
//      ring the same neutral border no matter what the fill is doing — NYT/FT
//      cartographic-annotation convention.
//
//   2. Adjacent states share a border segment. With a single line layer, the
//      state drawn last paints its color over the shared segment, and a
//      Low-concern neighbor visually erases part of an Unusable state's ring.
//      Splitting into one layer per tier and adding them in ascending
//      severity means the WORST rating always paints last on any shared
//      border — the signal the reader needs is preserved.
//
// All layers share the same `dqColor` feature-state gate so they only draw on
// states with an assessment for the current (topic, year); each tier layer
// additionally gates on matching its own color, via line-opacity.
export const DQ_RING_HALO_LAYER = "dq-ring-halo";
export const DQ_RING_WIDTH = 2.5;
export const DQ_RING_HALO_WIDTH = 6;
export const DQ_RING_OPACITY = 1;
export const DQ_RING_HALO_OPACITY = 0.85;
export const DQ_RING_HALO_COLOR = "#ffffff";
export const DQ_RING_NEUTRAL_COLOR = "rgba(0,0,0,0)"; // states with no data render transparent

/** Ascending severity — worst tier last so it paints on top of shared borders. */
export const DQ_TIER_STACK_ORDER: DqAssessment[] = [
    "Unclassified",
    "Low concern",
    "Medium concern",
    "High concern",
    "Unusable",
];

/** Per-tier line-layer id. Kept as a helper (not a table) so a new tier can
 * be added just by extending DqAssessment + DQ_TIER_STACK_ORDER. */
export function dqTierLayerId(tier: DqAssessment): string {
    return `dq-ring-${tier.replace(/\s+/g, "-").toLowerCase()}`;
}
