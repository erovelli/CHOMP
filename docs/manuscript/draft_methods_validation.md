# Draft: Methods, Results, Discussion (limitations), Availability

Citations are numbered in order of appearance within this draft and will shift once the Introduction is written. Before submission, confirm that the reproducibility audit passed (sentence in Availability). The release date in the first sentence of Data Sources needs checking (February 8 or 13, 2026). The ArcGIS details marked XX in Data Sources are for Md Shahinoor Rahman to fill in.

## Methods

### Data Sources

Data were obtained from the Medicaid Provider Spending file released by the U.S. Department of Health and Human Services (HHS) on February 8, 2026 [1]. The file is derived from the Transformed Medicaid Statistical Information System (T-MSIS) and covers fee-for-service, managed care, and Children's Health Insurance Program (CHIP) claims with dates of service from January 2018 through December 2024 [1]. Each record summarizes one combination of billing provider, servicing provider, procedure code, and month. It gives the number of claims, the number of unique beneficiaries, and the total amount paid by Medicaid. HHS suppressed records with fewer than 12 claims before release. Provider practice locations came from the National Plan and Provider Enumeration System (NPPES), using the 84 monthly snapshots archived by the National Bureau of Economic Research (NBER) [2]. Practice addresses were geocoded with Esri ArcGIS (XX product and version) using the XX locator, with a minimum match score of XX [3]. Procedure categories follow the American Dental Association Current Dental Terminology (CDT) [4].

### Data Linkage and Aggregation

Fig. 1 summarizes the processing steps. All CDT codes begin with "D," so records with a procedure code beginning with that letter were kept as dental records. The servicing provider identifier on each dental record, normally a National Provider Identifier (NPI), was linked to the NPPES snapshot for the month of service, and the record took the practice location address from that snapshot. Unlinked records were excluded. Distinct practice addresses were geocoded in a single batch, and the results were joined back to records by address. For each address the geocoder returned coordinates, a five-digit county Federal Information Processing Standards (FIPS) code, and a match status of matched, tied (several candidate locations scored equally), or unmatched.

Procedure codes were assigned to the 12 CDT categories by numeric range. For example, D1000 to D1999 is preventive. Codes outside the defined ranges were labeled uncategorized and kept in all totals. Claims and payments were summed by year and by month at the state, county, and three-digit ZIP code (ZIP3) levels. Beneficiary counts were summed the same way. A patient is counted once for each provider, procedure code, and month, so these sums are not counts of unique individuals. County came from the geocoded FIPS code, and each state total is the sum of its counties. ZIP3 is the first three digits of the NPPES practice ZIP code. Records without a county were left out of state and county totals, and records without a valid ZIP code were left out of ZIP3 totals.

### Validation

The data processing was evaluated in two ways. Every proportion describes all records, so no confidence intervals are given.

First, the completeness and agreement of the linkage were assessed. Completeness was the proportion of dental records, claims, and payments linked to NPPES. Each unlinked record was classified by its servicing provider identifier, which could be missing, a valid 10-digit NPI absent from that month's NPPES snapshot, or another identifier such as a state-assigned or malformed value. Geocoding completeness was summarized by match status. For records with an NPPES address in the United States or a U.S. territory, the state of the geocoded county was compared with the state recorded in NPPES.

Second, payments were compared with national spending estimates. Payments (TOTAL_PAID, the amount paid by Medicaid, including federal and state shares) were summed by calendar year of service at three stages. These were all dental records in the release, records linked and geocoded to any location, and records linked and geocoded to the 50 states and the District of Columbia. The second total divided by the first gives the share of payments retained after linkage and geocoding. The first and third totals were compared with combined Medicaid and CHIP spending on dental services in the National Health Expenditure Accounts (NHE, 2024 edition, accessed October 12, 2026) [5]. NHE covers the same geography and also combines federal and state shares. The release-level total could not be limited by geography because unlinked records have no location. NHE dental services measures the revenue of dentists' offices [6], so the comparison was treated as an estimate of how much national spending appears in the release, and the totals were not expected to match. Claims for late 2024 were incomplete at release. Data for 2024 were kept in pooled totals, reported separately, and excluded in a sensitivity analysis. To measure its completeness, November and December claims were compared with the January to October monthly mean, with 2023 as a reference for seasonal variation.

## Results

### Linked Dataset

Of 227,083,361 records in the HHS release, 24,068,574 (10.6%) were dental. They contained 1.28 billion claims and $44.2 billion in payments. Linkage to NPPES excluded 895,691 records (3.7%) and left 23,172,883. After the 69,960 distinct practice addresses were geocoded, 23,140,395 records were available for state and county aggregation and 23,171,904 for ZIP3 aggregation (Fig. 1).

### Linkage Completeness and Agreement

NPPES linkage captured 96.3% of dental records, 96.0% of claims, and 95.5% of payments. The share of linked records rose from 94.3% in 2018 to 99.1% in 2024. The 895,691 unlinked records carried $1.98 billion in payments. Of these records, 685,886 (76.6%, $1.49 billion) had no servicing provider identifier and 207,059 (23.1%, $0.49 billion) had a state-assigned or malformed identifier. The remaining 2,746 (0.3%, $2.4 million) had a valid NPI that was missing from that month's snapshot. Of the 69,960 addresses, 69,384 (99.2%) were matched, 490 (0.7%) were tied, and 86 (0.1%) were unmatched. Unmatched addresses accounted for 0.2% of claims. Record counts reconciled for all 69,960 addresses after the geocoder output was joined back to records. The state of the geocoded county agreed with the NPPES state for 99.98% of 1.23 billion claims.

### Comparison With National Health Expenditure Estimates

Dental payments in the release totaled $44.2 billion from 2018 through 2024, which is 44.0% of the $100.6 billion in Medicaid and CHIP dental spending estimated by NHE. This total includes territories and unlinked records. Linkage and geocoding together retained 95.4% of payments in the release. Payments placed in the 50 states and the District of Columbia totaled $41.8 billion (41.6% of NHE), and territories accounted for another $0.35 billion. Without 2024, the two proportions were 44.2% and 41.5%. In 2024 the release held $8.05 billion and the mapped total was $7.87 billion, or 43.0% and 42.0% of the NHE estimate. Claims in November and December 2024 fell 21.5% and 61.5% below the January to October 2024 monthly mean. The same months of 2023 fell 6.6% and 21.4% below. Fig. 2 gives annual values.

## Discussion (limitations paragraph)

The largest source of loss was the exclusion of records without a valid NPI, which removed 3.7% of dental records and 4.5% of payments. These records are probably not missing at random. School-based programs, mobile clinics, and other providers that bill under state-assigned identifiers may be overrepresented among them, so totals are understated most in states and years where such billing is common. Linkage improved from 94.3% of records in 2018 to 99.1% in 2024, which means part of the apparent growth in mapped payments over the period comes from better identifier reporting. Suppression of records with fewer than 12 claims removes more care from low-volume providers and for infrequent procedures, and the size of that loss cannot be estimated from the released data. Each claim was placed at the servicing provider's practice address. That address may differ from both the patient's residence and the site of care, so sub-state totals show where providers practice. Claims for November and December 2024 were incomplete at release, and 2024 totals are preliminary. Most of the difference from NHE estimates is already present in the release. NHE dental services represents the revenue of dentists' offices, and procedures billed by health centers and other facilities can be counted under other service categories [6]. State and ZIP3 totals come from slightly different sets of records and do not reconcile exactly. Adult dental benefits differ across state Medicaid programs, so part of any difference between states reflects policy. The aggregated data support descriptive analysis only.

## Availability (draft sentence)

A separate script that re-implements the processing from the written methods reproduced every record of the published files and is included in the repository.

## References used in this draft

1. HHS. Medicaid Provider Spending. HHS Open Data Platform. 2026.
2. National Bureau of Economic Research. NPPES monthly data archive, 2018–2024.
3. Esri. ArcGIS (XX product, version, and locator).
4. American Dental Association. Current Dental Terminology (CDT).
5. Centers for Medicare & Medicaid Services, Office of the Actuary. National Health Expenditure Accounts: type of service and source of funds, CY 1960–2024.
6. Centers for Medicare & Medicaid Services, Office of the Actuary. National Health Expenditure Accounts: definitions, sources, and methods, 2024 edition.
