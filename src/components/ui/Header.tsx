import LayerControl from "./LayerControl";
import DetailPanel from "./DetailPanel";
import Tooltip from "./Tooltip";
import Legend from "./Legend";
import ClickHint from "./ClickHint";

export default function Header() {
    return (
        <>
            <header
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 20px",
                    height: 52,
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                    backdropFilter: "blur(8px)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 12,
                    }}
                >
                    <h1
                        style={{
                            fontFamily: "var(--ff-sans)",
                            fontSize: 17,
                            fontWeight: 600,
                            letterSpacing: "-0.01em",
                            color: "var(--ink)",
                        }}
                    >
                        Medicaid Dental Utilization
                    </h1>
                    <span
                        style={{
                            fontSize: 11,
                            color: "var(--ink-dim)",
                            letterSpacing: "0.02em",
                        }}
                    >
                        Massachusetts · ZIP Code Areas
                    </span>
                </div>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--accent)",
                        background: "var(--accent-light)",
                        padding: "2px 8px",
                        borderRadius: 2,
                        border: "1px solid rgba(200,70,10,0.2)",
                    }}
                >
                    Demo · Dummy Data
                </span>
            </header>

            <LayerControl />
            <Legend />
            <Tooltip />
            <DetailPanel />
            <ClickHint />
        </>
    );
}
