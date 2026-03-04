import MapContainer from "./components/map/MapContainer";
import Header from "./components/ui/Header";
import { HEADER_HEIGHT } from "./constants/layout";

export default function App() {
    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
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
