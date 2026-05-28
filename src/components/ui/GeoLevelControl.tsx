import { useMapStore } from "../../lib/store";
import { GEO_LEVELS } from "../../constants/map";
import { Z_INDEX, HEADER_HEIGHT } from "../../constants/layout";

export default function GeoLevelControl() {
    const { geoLevel, setGeoLevel } = useMapStore();

    return (
        <div
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: Z_INDEX.HEADER,
                display: "flex",
                gap: 2,
                padding: 3,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
        >
            {GEO_LEVELS.map(({ key, label }) => {
                const isActive = key === geoLevel;
                return (
                    <button
                        key={key}
                        onClick={() => setGeoLevel(key)}
                        style={{
                            padding: "5px 14px",
                            fontSize: 12,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? "var(--accent)" : "var(--ink-mid)",
                            background: isActive ? "var(--accent-light)" : "transparent",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            transition: "background 0.12s, color 0.12s",
                        }}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
