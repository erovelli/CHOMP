import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import LeftRail from "./LeftRail";
import FilterSheet from "./FilterSheet";
import DetailPanel from "./DetailPanel/index";
import Tooltip from "./Tooltip";
import Legend from "./Legend";
import ClickHint from "./ClickHint";
import AboutPage from "./AboutPage";
import { HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";
import { NAV_PAGES, NAV_LABELS, REPO_URL, type NavPage } from "../../constants/pages";
import { useIsMobile } from "../../lib/useMediaQuery";

// Export deps (d3-geo, topojson-client, papaparse) are only needed once the
// user opens the modal — load them lazily so they stay out of the critical
// path. The trade-off is a small (~200 ms on broadband) delay between clicking
// Export and the modal painting; acceptable for a save-action.
const ExportModal = lazy(() => import("./ExportModal"));

// Reserve the widest desktop breakpoint band for the full horizontal nav.
// Below this we fall back to a compact "About" button that opens the modal
// on the last-viewed page. Threshold chosen to just clear the wordmark +
// 5 nav items + Export at 13px font.
const NAV_COLLAPSE_QUERY = "(max-width: 1080px)";

export default function Header() {
    const isMobile = useIsMobile();
    const isCompact = useMediaQuery(NAV_COLLAPSE_QUERY);
    const [exportOpen, setExportOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [aboutPage, setAboutPage] = useState<NavPage | null>("project");

    const openExport = useCallback(() => setExportOpen(true), []);
    const closeExport = useCallback(() => setExportOpen(false), []);
    const openFilters = useCallback(() => setFiltersOpen(true), []);
    const closeFilters = useCallback(() => setFiltersOpen(false), []);
    const closeAbout = useCallback(() => setAboutPage(null), []);
    const openAbout = useCallback((page: NavPage) => setAboutPage(page), []);

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
                    gap: 12,
                    padding: isMobile ? "0 12px" : "0 20px",
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
                        minWidth: 0,
                        flexShrink: 0,
                    }}
                >
                    <button
                        onClick={() => setAboutPage(null)}
                        aria-label="CHOMP — return to the map"
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            fontFamily: "var(--ff-sans)",
                            fontSize: isMobile ? 15 : 17,
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            color: "var(--ink)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        CHOMP
                    </button>
                </div>

                {!isMobile && !isCompact && (
                    <nav
                        aria-label="Primary"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            flex: 1,
                            justifyContent: "center",
                            minWidth: 0,
                        }}
                    >
                        <button
                            onClick={closeAbout}
                            className="chomp-nav-link"
                            aria-current={aboutPage === null ? "page" : undefined}
                        >
                            Atlas
                        </button>
                        {NAV_PAGES.map((page) => (
                            <button
                                key={page}
                                onClick={() => openAbout(page)}
                                className="chomp-nav-link"
                                aria-current={aboutPage === page ? "page" : undefined}
                            >
                                {NAV_LABELS[page]}
                            </button>
                        ))}
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="chomp-nav-link"
                        >
                            GitHub
                            <GitHubGlyph />
                        </a>
                    </nav>
                )}

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexShrink: 0,
                    }}
                >
                    {(isMobile || isCompact) && (
                        <HeaderButton
                            onClick={() => openAbout(aboutPage ?? "project")}
                            ariaLabel="Open the About menu"
                        >
                            <MenuIcon />
                            {!isMobile && "About"}
                        </HeaderButton>
                    )}
                    {isMobile && (
                        <HeaderButton onClick={openFilters} ariaLabel="Open map filters">
                            <FiltersIcon />
                            Filters
                        </HeaderButton>
                    )}
                    <HeaderButton onClick={openExport} ariaLabel="Export the current view">
                        <ExportIcon />
                        {!isMobile && "Export"}
                    </HeaderButton>
                </div>
            </header>

            {isMobile ? <FilterSheet open={filtersOpen} onClose={closeFilters} /> : <LeftRail />}
            <Legend />
            <Tooltip />
            <DetailPanel />
            <ClickHint />
            <AboutPage page={aboutPage} onClose={closeAbout} />
            {exportOpen && (
                <Suspense fallback={null}>
                    <ExportModal open={exportOpen} onClose={closeExport} />
                </Suspense>
            )}
        </>
    );
}

function HeaderButton({
    onClick,
    ariaLabel,
    children,
}: {
    onClick: () => void;
    ariaLabel: string;
    children: React.ReactNode;
}) {
    return (
        <button className="chomp-header-btn" onClick={onClick} aria-label={ariaLabel}>
            {children}
        </button>
    );
}

function ExportIcon() {
    return (
        <svg
            className="chomp-header-btn__icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M6 1v7m0 0L3 5m3 3l3-3M2 10h8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function FiltersIcon() {
    return (
        <svg
            className="chomp-header-btn__icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M1.5 3h9M3 6h6M4.5 9h3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MenuIcon() {
    return (
        <svg
            className="chomp-header-btn__icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M1.5 2.5h9M1.5 6h9M1.5 9.5h9"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
            />
        </svg>
    );
}

function GitHubGlyph() {
    return (
        <svg
            className="chomp-nav-link__glyph"
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M4 2h5v5M9 2L4 7M2 4v5h5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Local hook — avoids re-exporting from useMediaQuery just for one call.
function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() =>
        typeof window === "undefined" ? false : window.matchMedia(query).matches,
    );
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange();
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);
    return matches;
}
