import { INFO_MODAL_BODY, INFO_MODAL_NOTES } from "./infoModal";

export const NAV_PAGES = ["project", "data", "team", "credits", "contact"] as const;
export type NavPage = (typeof NAV_PAGES)[number];

export const NAV_LABELS: Record<NavPage, string> = {
    project: "Project",
    data: "Data",
    team: "Team",
    credits: "Credits",
    contact: "Contact",
};

export const REPO_URL = "https://github.com/erovelli/medicaid-dent-policy";

export type PageSection =
    | { kind: "paragraph"; body: string }
    | { kind: "list"; heading?: string; items: readonly string[] }
    | { kind: "links"; items: readonly { label: string; href: string }[] }
    | { kind: "rule" }
    | {
          kind: "people";
          items: readonly { name: string; photo?: string }[];
      };

export interface PageContent {
    title: string;
    lede?: string;
    sections: readonly PageSection[];
}

export const PAGE_CONTENT: Record<NavPage, PageContent> = {
    project: {
        title: "About the project",
        sections: [
            { kind: "paragraph", body: INFO_MODAL_BODY },
            { kind: "list", heading: "Important notes", items: INFO_MODAL_NOTES },
        ],
    },
    data: {
        title: "Data & methodology",
        sections: [
            {
                kind: "links",
                items: [
                    {
                        label: "Data dictionary",
                        href: `${REPO_URL}/blob/main/docs/DATA_DICTIONARY.md`,
                    },
                    {
                        label: "Known limitations",
                        href: `${REPO_URL}/blob/main/docs/LIMITATIONS.md`,
                    },
                    {
                        label: "Architecture notes",
                        href: `${REPO_URL}/blob/main/docs/ARCHITECTURE.md`,
                    },
                ],
            },
        ],
    },
    team: {
        title: "Team",
        sections: [
            {
                kind: "people",
                items: [
                    { name: "Kenneth Liu" },
                    { name: "Clark Morgan" },
                    { name: "Samat Borbiev" },
                    { name: "Ningsheng Zhao" },
                    { name: "Md Shahinoor Rahman" },
                    { name: "Evan Rovelli" },
                    { name: "Matt Ngaw" },
                    { name: "Jake Gilbert" },
                    { name: "Hawazin Elani" },
                ],
            },
        ],
    },
    credits: {
        title: "Credits & acknowledgments",
        sections: [
            {
                kind: "links",
                items: [
                    {
                        label: "HHS Open Data — Medicaid Dental Claims, 2018–2024",
                        href: "https://data.cms.gov/",
                    },
                    {
                        label: "CMS NPPES — National Plan & Provider Enumeration System",
                        href: "https://download.cms.gov/nppes/NPI_Files.html",
                    },
                    {
                        label: "U.S. Census — ACS C27007 Medicaid enrollment",
                        href: "https://www.census.gov/programs-surveys/acs",
                    },
                    {
                        label: "U.S. Census TIGER/Line — state and ZCTA boundaries",
                        href: "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
                    },
                    {
                        label: "U.S. Department of State — LSIB / World Polygons",
                        href: "https://geodata.state.gov/",
                    },
                    {
                        label: "American Dental Association — CDT category conventions",
                        href: "https://www.ada.org/publications/cdt",
                    },
                ],
            },
            { kind: "rule" },
            {
                kind: "links",
                items: [
                    { label: "MapLibre GL JS", href: "https://maplibre.org/" },
                    { label: "PMTiles by Protomaps", href: "https://protomaps.com/docs/pmtiles" },
                    { label: "d3-geo", href: "https://github.com/d3/d3-geo" },
                ],
            },
        ],
    },
    contact: {
        title: "Get in touch",
        sections: [
            {
                kind: "links",
                items: [
                    { label: "Report a bug or data issue", href: `${REPO_URL}/issues/new` },
                    { label: "Suggest a feature", href: `${REPO_URL}/issues/new` },
                    { label: "Browse the source", href: REPO_URL },
                ],
            },
            {
                kind: "paragraph",
                body: "For research collaborations, methodology questions, or partnerships that don't fit the issue tracker, reach any team member directly via GitHub.",
            },
        ],
    },
};
