export const INFO_MODAL_TITLE = "Medicaid Dental Claim Data Visualization";

export const INFO_MODAL_BODY =
    "This site illustrates the 2018–2024 Medicaid dental claims data released by Health and Human " +
    "Services (HHS) Open Data on February 8th, 2026. We used the National Plan and Provider " +
    "Enumeration System (NPPES) to connect each claim to a ZIP3, enabling a geographical view " +
    "of the data. Medicaid dental coverage varies from state-to-state, with some states covering " +
    "different populations and different procedures. This may account for some level of the " +
    "perceived trends seen on this site. Our intention is to transform a massive dataset into " +
    "digestible, actionable insights at the local, state, and national level. We hope this tool " +
    "and the corresponding framework to organize the data can be useful for policymakers, " +
    "providers, researchers, and all others interested in improving oral and systemic health.";

export const INFO_MODAL_NOTES: string[] = [
    "HHS Open Data does not include claims if there are less than 12 of a particular code per month, or if there are less than 12 unique beneficiaries per month. This may impact accuracy, especially in less populated areas.",
    "We are displaying data at a ZIP3 level (and not finer) to purposefully avoid identifying or targeting individual providers. This data is not intended to assist in finding outlier providers.",
    "The 'Per Medicaid enrollee' metric uses ACS C27007 (5-year endpoint pooled) as the denominator. Because ACS smooths over a 5-year window and surveys typically under-report Medicaid coverage relative to administrative rolls, the resulting rate is best read as a relative within-state comparison rather than an absolute utilization rate.",
    "Claims are attributed to the servicing provider's practice address, not the patient's residence. Geographies containing a regional dental clinic, FQHC, or mobile-unit billing address will see their per-enrollee rate inflated by claims from surrounding catchment areas; the catchment areas themselves look correspondingly lower.",
    "Providers register with NPPES once per primary practice address. Mid-period moves and providers who rotate through community clinics, school visits, or satellite offices show up only at their primary clinic. NPI records that didn't appear in the same-month NPPES snapshot (~0.1% of claims) are excluded.",
    "Rows with malformed servicing identifiers (state-assigned Atypical Provider IDs, legacy Medicaid IDs, NULLs, sentinels — ~3% of dental rows), addresses that failed to geocode, and US territories without standard county FIPS are excluded from county and state maps. Full ledger in docs/LIMITATIONS.md.",
    "[Country boundaries outside the United States appear only as a neutral grey backdrop, drawn from the U.S. State Department's Large Scale International Boundaries (LSIB), Office of the Geographer.]",
];
