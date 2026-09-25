import { useMapStore } from "../../../lib/store";
import { getDqRecord } from "../../../lib/dataService";
import { DQ_ASSESSMENT_COLORS, DQ_TOPIC_LABELS, DQ_TOPIC_ORDER } from "../../../constants/dq";
import type { DqTopicKey } from "../../../lib/types";

/**
 * Compact DQ chip row for the state DetailPanel: one swatch per topic, keyed
 * to the selected state × current year. Clicking a chip switches the map
 * overlay's active topic (and enables it if hidden). Only rendered for the
 * state view — DQ Atlas data is state-only.
 */
export default function DqRibbon({ stateUsps }: { stateUsps: string }) {
    const { dqData, dqTopic, setDqTopic, setDqOverlayVisible, selectedYear } = useMapStore();

    if (!dqData) return null;

    const onPick = (topic: DqTopicKey) => {
        setDqTopic(topic);
        setDqOverlayVisible(true);
    };

    return (
        <div style={{ marginBottom: 20 }}>
            <p
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--ink)",
                    marginBottom: 8,
                }}
            >
                Data quality · {selectedYear}
            </p>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                }}
            >
                {DQ_TOPIC_ORDER.map((topic) => {
                    const rec = getDqRecord(dqData, topic, selectedYear, stateUsps);
                    const swatch = rec ? DQ_ASSESSMENT_COLORS[rec.assessment] : "transparent";
                    const isActive = topic === dqTopic;
                    // Prefer the constants map — it holds the app's polished
                    // labels (no em-dashes, expanded abbreviations). The JSON
                    // `label` from build_dq_atlas.py mirrors the CSV titles
                    // verbatim and is kept as raw provenance.
                    const label = DQ_TOPIC_LABELS[topic];
                    const title = rec
                        ? `${label}: ${rec.assessment}${
                              rec.pct !== undefined ? ` (${rec.pct}%)` : ""
                          }`
                        : `${label}: no data for ${selectedYear}`;
                    return (
                        <button
                            key={topic}
                            onClick={() => onPick(topic)}
                            title={title}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "2px 0",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: 10,
                                fontWeight: isActive ? 600 : 400,
                                color: isActive ? "var(--accent)" : "var(--ink-mid)",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                            }}
                        >
                            <span
                                aria-hidden
                                style={{
                                    display: "inline-block",
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: swatch,
                                    border: rec ? "none" : "1px dashed var(--border)",
                                    flexShrink: 0,
                                }}
                            />
                            <span
                                style={{
                                    overflow: "hidden",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
