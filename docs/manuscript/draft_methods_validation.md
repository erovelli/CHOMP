# Draft: Methods, Results, Discussion (limitations)

Citations are numbered in order of appearance within this draft and will shift once the Introduction is written. XX marks a value still to be filled in from the local reproducibility report. Text in [square brackets] needs checking before submission.

## Methods

### Data Sources

We used the Medicaid Provider Spending file released by the U.S. Department of Health and Human Services (HHS) on February 8, 2026 [1]. The file reports paid claims [verify: Medicaid only, or Medicaid and the Children's Health Insurance Program (CHIP)] with dates of service from January 2018 through December 2024. Each record summarizes one combination of billing provider, servicing provider, procedure code, and month, and reports the number of claims, the number of unique beneficiaries, and the total amount paid. HHS suppressed records with fewer than 12 claims before release. Provider practice locations were obtained from the National Plan and Provider Enumeration System (NPPES) through the 84 monthly snapshots archived by the National Bureau of Economic Research (NBER) [2]. Procedure categories were defined by the American Dental Association Current Dental Terminology (CDT) [3].

### Data Linkage and Aggregation

The processing steps are summarized in Fig. 1. Records with a procedure code beginning with "D," the prefix shared by all CDT codes, were retained as dental records. The servicing provider identifier on each dental record was linked to the NPPES snapshot for the month of service, and the practice location address in that snapshot was assigned to the record. Unlinked records were excluded. Distinct practice addresses were geocoded in a single batch with the ArcGIS World Geocoding Service [4], which returned coordinates, a five-digit county Federal Information Processing Standards (FIPS) code, and a match status for each address: matched, tied (several candidate locations scored equally), or unmatched.

Procedure codes were assigned to the 12 CDT categories by numeric range (e.g., D1000 to D1999, preventive). Codes outside the defined ranges were classified as uncategorized and retained in all totals. Claims and payments were summed by year and by month at the state, county, and three-digit ZIP code (ZIP3) levels using DuckDB [5]. Beneficiary counts were summed in the same way; because a patient is counted once for each provider, procedure code, and month, these sums are not counts of unique individuals. County was taken from the geocoded FIPS code, and state totals were computed as the sum of their counties. ZIP3 was defined as the first three digits of the NPPES practice ZIP code. Records lacking a county were excluded from state and county totals, and records lacking a valid ZIP code were excluded from ZIP3 totals.

### Validation

The pipeline was evaluated in three ways. Proportions other than those from the registry audit describe all records and are reported without confidence intervals.

First, reproducibility was assessed with a second script, written by the study team, that imports no pipeline code and re-implements each step from the written methods. Starting from the raw release, it repeated the dental filter, the NPPES linkage, the CDT categorization, and the aggregation, and compared the results with the pipeline's intermediate and published files. Geocoding was not repeated; the geocoder output was used as delivered, and its attachment to records was checked by reconciling record counts for every address.

Second, linkage was assessed for completeness and agreement. Completeness was measured as the proportion of dental records, claims, and payments linked to NPPES. Unlinked records were classified by the servicing provider identifier as missing, a valid 10-digit NPI absent from that month's NPPES snapshot, or another identifier (state-assigned or malformed). Geocoding completeness was summarized by match status. For records whose NPPES address was in the United States or a U.S. territory, the state of the geocoded county was compared with the state recorded in NPPES. Finally, 200 servicing National Provider Identifiers (NPIs) were drawn by simple random sampling from all NPIs with at least one linked dental record in 2024. For each, the practice address assigned in the most recent 2024 month was compared with the current NPPES Registry record [6], retrieved in October 2026, and agreement was reported with Wilson 95% confidence intervals (CIs).

Third, payments (TOTAL_PAID, which includes federal and state shares) were summed by calendar year of service for all dental records in the release, for records linked and geocoded to any location, and for records linked and geocoded to the 50 states and the District of Columbia. The ratio of the second total to the first measured payments retained by the pipeline. The first and third totals were compared with the sum of Medicaid and CHIP spending on dental services in the National Health Expenditure Accounts (NHE; 2024 edition, accessed October 12, 2026) [7], which covers the same geography and also combines federal and state shares. The release-level total could not be restricted by geography because unlinked records have no location. NHE dental services measures the revenue of dentists' offices [7], so the comparison was treated as an estimate of the share of national spending present in the release, without expecting the totals to match. The share of claims in records reporting $0 in payments was also calculated. Because claims for late 2024 were incomplete at release, 2024 was included in pooled totals, reported separately, and excluded in a sensitivity analysis. Its completeness was assessed by comparing November and December claims with the January to October monthly mean, using 2023 as a reference for seasonal variation.

## Results

### Pipeline Output

Of 227,083,361 records in the HHS release, 24,068,574 (10.6%) were dental, representing 1.28 billion claims and $44.2 billion in payments. Linkage to NPPES excluded 895,691 records (3.7%), leaving 23,172,883. After geocoding of the 69,960 distinct practice addresses, 23,140,395 records were available for state and county aggregation and 23,171,904 for ZIP3 aggregation (Fig. 1).

### Reproducibility

The re-implementation reproduced the dental record, claim, and payment totals of the raw release. Every linked record matched an unaltered source record, and no record eligible for linkage was missing. All records in the six published aggregate files were reproduced exactly, each state total equaled the sum of its counties, and monthly values summed to annual values (XX of XX checks passed). Record counts reconciled for all 69,960 geocoded addresses. Uncategorized codes accounted for XX% of claims and XX% of payments.

### Linkage Completeness and Agreement

Overall, 96.3% of dental records, 96.0% of claims, and 95.5% of payments were linked to NPPES. The proportion of linked records increased from 94.3% in 2018 to 99.1% in 2024 (Supplementary Table S1). The 895,691 unlinked records accounted for $1.98 billion in payments; 685,886 (76.6%; $1.49 billion) lacked a servicing provider identifier, 207,059 (23.1%; $0.49 billion) carried a state-assigned or malformed identifier, and 2,746 (0.3%; $2.4 million) carried a valid NPI absent from that month's snapshot. Of the 69,960 addresses, 69,384 (99.2%) were matched, 490 (0.7%) were tied, and 86 (0.1%) were unmatched; unmatched addresses accounted for 0.2% of claims. The state of the geocoded county agreed with the NPPES state for 99.98% of 1.23 billion claims. In the registry audit, the five-digit ZIP code agreed for 185 of 200 NPIs (92.5%; 95% CI 88.0–95.4%), and the ZIP code or state agreed for 192 (96.0%; 95% CI 92.3–98.0%).

### Comparison With National Health Expenditure Estimates

From 2018 through 2024, dental payments in the release totaled $44.2 billion, equal to 44.0% of the $100.6 billion in Medicaid and CHIP dental spending estimated by NHE; this total includes territories and unlinked records. Linkage and geocoding together retained 95.4% of payments in the release. Payments linked and geocoded to the 50 states and the District of Columbia totaled $41.8 billion (41.6% of NHE); territories accounted for a further $0.35 billion. Excluding 2024, the corresponding proportions were 44.2% and 41.5%. In 2024, the release and mapped totals were $8.05 billion and $7.87 billion, or 43.0% and 42.0% of NHE. Claims in November and December 2024 were 21.5% and 61.5% below the January to October 2024 monthly mean, compared with 6.6% and 21.4% below for the same months of 2023. Records reporting $0 in payments contained 7.5% of dental claims. Annual values are shown in Fig. 2 and Supplementary Table S1.

## Discussion (limitations paragraph)

These findings should be interpreted in light of several limitations. Records without a valid NPI, 3.7% of dental records and 4.5% of payments, were excluded. These records are unlikely to be missing at random and may disproportionately represent school-based programs, mobile clinics, and other providers billing under state-assigned identifiers, so totals are understated most in states and years where such billing is common. Because linkage improved from 94.3% of records in 2018 to 99.1% in 2024, part of the apparent growth in payments over the study period reflects better identifier reporting. Suppression of records with fewer than 12 claims further understates care from low-volume providers and for infrequent procedures, by an amount that cannot be estimated from the released data. Claims were assigned to the servicing provider's practice address, which may differ from both the patient's residence and the site of care, so sub-state totals describe where providers practice. The registry audit covered only 2024 and compared addresses with records retrieved nearly two years later, which is expected to understate agreement for earlier years and for providers who have since moved; the reproducibility audit was written by the same team that built the pipeline. Claims for November and December 2024 were incomplete at release, and 2024 totals should be treated as preliminary. The difference from NHE estimates largely originates in the release itself and likely reflects differences in scope, since NHE dental services represents the revenue of dentists' offices and procedures billed by health centers and other facilities may be classified elsewhere [7]. State and ZIP3 totals are drawn from slightly different sets of records and do not reconcile exactly. Finally, adult dental benefits differ across state Medicaid programs, so differences between states partly reflect policy, and the aggregated data support descriptive rather than causal inference.

## Supplementary Table S1

Annual NPPES linkage and comparison with National Health Expenditure (NHE) estimates of Medicaid and CHIP dental spending. Payments are in billions of dollars. Linked proportions refer to all dental records in the release; the mapped total is restricted to records linked and geocoded to the 50 states and the District of Columbia; payments retained by the pipeline are payments linked and geocoded to any location as a percentage of all dental payments in the release.

| Year | Records linked (%) | Claims linked (%) | Payments linked (%) | NHE Medicaid + CHIP ($) | HHS release ($) | Mapped total ($) | Release, % of NHE | Mapped, % of NHE | Payments retained by pipeline (%) | Claims in $0 records (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| 2018 | 94.3 | 93.9 | 97.0 | 11.72 | 4.76 | 4.58 | 40.7 | 39.0 | 96.9 | 6.9 |
| 2019 | 95.2 | 94.7 | 93.5 | 12.17 | 5.21 | 4.83 | 42.8 | 39.7 | 93.4 | 5.8 |
| 2020 | 94.7 | 94.2 | 92.7 | 10.82 | 4.28 | 3.93 | 39.6 | 36.3 | 92.5 | 7.1 |
| 2021 | 94.8 | 94.1 | 92.4 | 13.87 | 6.45 | 5.90 | 46.5 | 42.6 | 92.2 | 7.2 |
| 2022 | 96.8 | 96.6 | 95.3 | 15.85 | 7.32 | 6.91 | 46.2 | 43.6 | 95.1 | 8.2 |
| 2023 | 97.7 | 97.4 | 96.9 | 17.45 | 8.14 | 7.81 | 46.7 | 44.8 | 96.8 | 8.7 |
| 2024ᵃ | 99.1 | 99.0 | 98.7 | 18.72 | 8.05 | 7.87 | 43.0 | 42.0 | 98.6 | 7.7 |
| Total | 96.3 | 96.0 | 95.5 | 100.59 | 44.22 | 41.82 | 44.0 | 41.6 | 95.4 | 7.5 |

ᵃ Claims for November and December 2024 were incomplete at release.

## References used in this draft

1. HHS. Medicaid Provider Spending. HHS Open Data Platform. 2026.
2. National Bureau of Economic Research. NPPES monthly data archive, 2018–2024.
3. American Dental Association. Current Dental Terminology (CDT).
4. Esri. ArcGIS World Geocoding Service.
5. DuckDB Foundation. DuckDB.
6. Centers for Medicare & Medicaid Services. NPPES NPI Registry API, version 2.1.
7. Centers for Medicare & Medicaid Services, Office of the Actuary. National Health Expenditure Accounts: type of service and source of funds, CY 1960–2024; and Definitions, Sources, and Methods, 2024 edition.
