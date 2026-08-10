import { useMapStore } from "../../lib/store";
import { GEO_LEVELS } from "../../constants/map";
import { Z_INDEX, HEADER_HEIGHT } from "../../constants/layout";

export default function GeoLevelControl() {
    const { geoLevel, setGeoLevel } = useMapStore();

    return (
        <div
            className="chomp-segmented chomp-segmented--row"
            role="group"
            aria-label="Geography"
            style={{
                position: "absolute",
                top: HEADER_HEIGHT + 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: Z_INDEX.HEADER,
            }}
        >
            {GEO_LEVELS.map(({ key, label }) => {
                const isActive = key === geoLevel;
                return (
                    <button
                        key={key}
                        onClick={() => setGeoLevel(key)}
                        className="chomp-segmented__btn"
                        aria-pressed={isActive}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
