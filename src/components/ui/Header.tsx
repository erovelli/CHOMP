import LayerControl from "./LayerControl";
import GeoLevelControl from "./GeoLevelControl";
import MetricControl from "./MetricControl";
import YearControl from "./YearControl";
import DetailPanel from "./DetailPanel/index";
import Tooltip from "./Tooltip";
import Legend from "./Legend";
import ClickHint from "./ClickHint";
import InfoModal from "./InfoModal";
import { HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";

export default function Header() {
    return (
        <>
            <header
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: Z_INDEX.HEADER,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 20px",
                    height: HEADER_HEIGHT,
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
                        United States · State, County & ZIP3 Areas
                    </span>
                </div>
            </header>

            <LayerControl />
            <GeoLevelControl />
            <MetricControl />
            <YearControl />
            <Legend />
            <Tooltip />
            <DetailPanel />
            <ClickHint />
            <InfoModal />
        </>
    );
}
