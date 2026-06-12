import { useState, useEffect, useCallback } from "react";
import { Z_INDEX } from "../../constants/layout";
import { INFO_MODAL_TITLE, INFO_MODAL_BODY, INFO_MODAL_NOTES } from "../../constants/infoModal";
import { useIsMobile } from "../../lib/useMediaQuery";

export default function InfoModal() {
    const isMobile = useIsMobile();
    const [visible, setVisible] = useState(true);

    const close = useCallback(() => setVisible(false), []);

    useEffect(() => {
        if (!visible) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [visible, close]);

    if (!visible) return null;

    return (
        <div
            onClick={close}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: Z_INDEX.MODAL,
                background: "rgba(26,25,23,0.55)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: isMobile ? 12 : 24,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="modal-card"
                style={{
                    position: "relative",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                    width: "100%",
                    maxWidth: 580,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: isMobile ? "18px 16px 14px" : "24px 24px 18px",
                        borderBottom: "1px solid var(--border)",
                        flexShrink: 0,
                    }}
                >
                    <p
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "var(--ink-dim)",
                            marginBottom: 6,
                        }}
                    >
                        About This Site
                    </p>
                    <h2
                        style={{
                            fontFamily: "var(--ff-sans)",
                            fontSize: 20,
                            fontWeight: 600,
                            letterSpacing: "-0.02em",
                            color: "var(--ink)",
                            lineHeight: 1.25,
                        }}
                    >
                        {INFO_MODAL_TITLE}
                    </h2>

                    <button
                        onClick={close}
                        aria-label="Close"
                        style={{
                            position: "absolute",
                            top: 16,
                            right: 16,
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "var(--surface2)",
                            border: "1px solid var(--border)",
                            borderRadius: "50%",
                            cursor: "pointer",
                            fontSize: 14,
                            color: "var(--ink-mid)",
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: isMobile ? "16px 16px 20px" : "20px 24px 28px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 20,
                    }}
                >
                    <p
                        style={{
                            fontFamily: "var(--ff-serif)",
                            fontSize: 14,
                            lineHeight: 1.7,
                            color: "var(--ink-mid)",
                        }}
                    >
                        {INFO_MODAL_BODY}
                    </p>

                    {/* Important Notes */}
                    <div>
                        <p
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                color: "var(--ink-dim)",
                                marginBottom: 10,
                            }}
                        >
                            Important Notes
                        </p>
                        <ul
                            style={{
                                listStyle: "none",
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            {INFO_MODAL_NOTES.map((note, i) => (
                                <li
                                    key={i}
                                    style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "flex-start",
                                    }}
                                >
                                    <span
                                        style={{
                                            flexShrink: 0,
                                            marginTop: 5,
                                            width: 5,
                                            height: 5,
                                            borderRadius: "50%",
                                            background: "var(--accent)",
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontFamily: "var(--ff-serif)",
                                            fontSize: 13,
                                            lineHeight: 1.65,
                                            color: note.startsWith("[")
                                                ? "var(--ink-dim)"
                                                : "var(--ink-mid)",
                                            fontStyle: note.startsWith("[") ? "italic" : "normal",
                                        }}
                                    >
                                        {note}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: isMobile ? "12px 16px" : "14px 24px",
                        paddingBottom: isMobile
                            ? "calc(12px + env(safe-area-inset-bottom, 0px))"
                            : undefined,
                        borderTop: "1px solid var(--border)",
                        flexShrink: 0,
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <button
                        onClick={close}
                        style={{
                            padding: isMobile ? "10px 20px" : "7px 20px",
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "var(--ff-sans)",
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 3,
                            cursor: "pointer",
                            letterSpacing: "0.01em",
                        }}
                    >
                        Get Started
                    </button>
                </div>
            </div>
        </div>
    );
}
