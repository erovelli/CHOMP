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
    "We are displaying data at a ZIP3 level to purposefully avoid identifying or targeting individual providers. This data is not intended to assist in finding outlier providers.",
    "[Note about NPI changes/providers moving depending on how well we can address this]",
    "[Explanation of what we did with mislabeled/incomplete data, US territories, etc]",
];
