import { useEffect } from "react";
import { HEADER_HEIGHT, Z_INDEX } from "../../constants/layout";
import { PAGE_CONTENT, type NavPage, type PageSection } from "../../constants/pages";
import { useIsMobile } from "../../lib/useMediaQuery";

interface AboutPageProps {
    page: NavPage | null;
    onClose: () => void;
}

// Full-viewport slide-in page. Covers the map below the header while leaving
// the header (and its nav) visible — so switching between About sub-pages is
// a single click on the primary nav, not a modal-with-sub-tabs redundancy.
// Pattern: Pearl and other editorial product sites where clicking a nav item
// swaps the whole content region rather than opening a floating dialog.
export default function AboutPage({ page, onClose }: AboutPageProps) {
    const isMobile = useIsMobile();

    useEffect(() => {
        if (!page) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [page, onClose]);

    if (!page) return null;

    const content = PAGE_CONTENT[page];

    return (
        <section
            className="chomp-about-page"
            role="region"
            aria-labelledby="about-page-title"
            style={{
                position: "fixed",
                top: HEADER_HEIGHT,
                left: 0,
                right: 0,
                bottom: 0,
                background: "var(--bg)",
                zIndex: Z_INDEX.MODAL,
                overflowY: "auto",
            }}
        >
            <button
                onClick={onClose}
                aria-label="Close and return to the map"
                className="chomp-close-btn"
                style={{
                    position: "absolute",
                    top: isMobile ? 16 : 24,
                    right: isMobile ? 16 : 32,
                    zIndex: 1,
                }}
            >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path
                        d="M1.5 1.5l7 7m0-7l-7 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                </svg>
            </button>

            <article className="chomp-about-page__content">
                <h1 id="about-page-title" className="chomp-about-page__title">
                    {content.title}
                </h1>

                {content.lede && <p className="chomp-about-page__lede">{content.lede}</p>}

                <div className="chomp-about-page__sections">
                    {content.sections.map((section, i) => (
                        <SectionView key={i} section={section} />
                    ))}
                </div>

                {page === "project" && (
                    <div className="chomp-about-page__cta">
                        <button
                            onClick={onClose}
                            className="chomp-primary-btn"
                            style={{
                                padding: isMobile ? "12px 24px" : "12px 28px",
                                fontSize: 14,
                                fontWeight: 600,
                            }}
                        >
                            Explore the atlas
                        </button>
                    </div>
                )}
            </article>
        </section>
    );
}

function SectionView({ section }: { section: PageSection }) {
    if (section.kind === "paragraph") {
        return <p className="chomp-about-page__paragraph">{section.body}</p>;
    }
    if (section.kind === "rule") {
        return <hr className="chomp-about-page__rule" />;
    }
    if (section.kind === "list") {
        return (
            <div>
                {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
                <ul className="chomp-about-page__list">
                    {section.items.map((item, i) => (
                        <li
                            key={i}
                            className="chomp-about-page__list-item"
                            style={{
                                color: item.startsWith("[") ? "var(--ink-dim)" : "var(--ink-mid)",
                                fontStyle: item.startsWith("[") ? "italic" : "normal",
                            }}
                        >
                            <span aria-hidden="true" className="chomp-about-page__list-marker" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    if (section.kind === "links") {
        return (
            <ul className="chomp-about-page__link-list">
                {section.items.map((item) => (
                    <li key={item.href + item.label}>
                        <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="chomp-link-inline"
                        >
                            <span>{item.label}</span>
                            <ExternalGlyph />
                        </a>
                    </li>
                ))}
            </ul>
        );
    }
    if (section.kind === "people") {
        return (
            <ul className="chomp-about-page__people">
                {section.items.map((person) => (
                    <li key={person.name} className="chomp-teammate">
                        <div
                            className="chomp-avatar chomp-avatar--large"
                            role="img"
                            aria-label={`${person.name} — photo forthcoming`}
                            style={
                                person.photo
                                    ? {
                                          backgroundImage: `url(${person.photo})`,
                                          backgroundSize: "cover",
                                          backgroundPosition: "center",
                                      }
                                    : undefined
                            }
                        />
                        <span className="chomp-teammate__name">{person.name}</span>
                    </li>
                ))}
            </ul>
        );
    }
    return null;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h2 className="chomp-about-page__heading">{children}</h2>;
}

function ExternalGlyph() {
    return (
        <svg
            width="11"
            height="11"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            className="chomp-link-inline__glyph"
        >
            <path
                d="M3.5 2h4.5v4.5M8 2L3 7"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
