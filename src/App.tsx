import MapContainer from "./components/map/MapContainer";
import Header from "./components/ui/Header";
import { HEADER_HEIGHT } from "./constants/layout";
import { useUrlSync } from "./lib/useUrlSync";

export default function App() {
    useUrlSync();

    return (
        <div className="app-shell" style={{ position: "relative", width: "100%" }}>
            <Header />
            <div
                style={{
                    position: "absolute",
                    top: HEADER_HEIGHT,
                    left: 0,
                    right: 0,
                    bottom: 0,
                }}
            >
                <MapContainer />
            </div>
        </div>
    );
}
