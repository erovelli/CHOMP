// 2-digit Census state FIPS → USPS postal code + full state name. Used by the
// export pipeline to bridge us-atlas TopoJSON (FIPS-keyed) and the claims data
// (postal-keyed), and to give CSV/PNG output readable state names. Includes:
//   • 50 states + DC
//   • PR (rendered in a Mercator inset on the synthesized map)
//   • Pacific / Caribbean territories that appear in the claims data (GU, MP,
//     VI) and AS (in the TopoJSON but absent from the claims data). The
//     non-PR territories are present here for CSV naming only — geoAlbersUsa
//     projects them to null, so the synthesized state map drops them (see
//     TERRITORY_NON_PR_FIPS in synthesizeMap.ts).
export const STATE_FIPS_TO_USPS: Record<string, string> = {
    "01": "AL",
    "02": "AK",
    "04": "AZ",
    "05": "AR",
    "06": "CA",
    "08": "CO",
    "09": "CT",
    "10": "DE",
    "11": "DC",
    "12": "FL",
    "13": "GA",
    "15": "HI",
    "16": "ID",
    "17": "IL",
    "18": "IN",
    "19": "IA",
    "20": "KS",
    "21": "KY",
    "22": "LA",
    "23": "ME",
    "24": "MD",
    "25": "MA",
    "26": "MI",
    "27": "MN",
    "28": "MS",
    "29": "MO",
    "30": "MT",
    "31": "NE",
    "32": "NV",
    "33": "NH",
    "34": "NJ",
    "35": "NM",
    "36": "NY",
    "37": "NC",
    "38": "ND",
    "39": "OH",
    "40": "OK",
    "41": "OR",
    "42": "PA",
    "44": "RI",
    "45": "SC",
    "46": "SD",
    "47": "TN",
    "48": "TX",
    "49": "UT",
    "50": "VT",
    "51": "VA",
    "53": "WA",
    "54": "WV",
    "55": "WI",
    "56": "WY",
    "60": "AS",
    "66": "GU",
    "69": "MP",
    "72": "PR",
    "78": "VI",
};

export const STATE_USPS_TO_NAME: Record<string, string> = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    DC: "District of Columbia",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    PR: "Puerto Rico",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    AS: "American Samoa",
    GU: "Guam",
    MP: "Northern Mariana Islands",
    VI: "US Virgin Islands",
};

// Puerto Rico FIPS in 2-digit form. Surfaced as a constant because the
// synthesized map renders PR with a separate Mercator projection in a corner
// inset (d3's geoAlbersUsa returns null for PR coordinates), so the FIPS guard
// shows up in a few places.
export const PR_FIPS = "72";

// FIPS codes for the Pacific / Caribbean territories *other than PR*. The
// claims data carries GU, MP, VI (AS is included for completeness, but the
// pipeline doesn't emit AS rows). geoAlbersUsa projects all four to null, so
// the synthesized map intentionally drops them — adding inset boxes for each
// crowds the lower-right and the data slice is small. Surfaced as a constant
// so the renderer's filter is grep-able.
export const TERRITORY_NON_PR_FIPS = new Set(["60", "66", "69", "78"]);
