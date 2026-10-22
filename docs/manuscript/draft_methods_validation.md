# Draft: Methods, Results, Discussion (limitations)

Citations are numbered in order of appearance within this draft and will shift once the Introduction is written. XX marks a value still to be filled in from the local reproducibility report.

## Methods

### Data Sources

We used the Medicaid Provider Spending file released by the U.S. Department of Health and Human Services (HHS) on February 8, 2026 [1]. The file reports paid Medicaid claims with dates of service from January 2018 through December 2024. Each record summarizes one combination of billing provider, servicing provider, procedure code, and month, and reports the number of claims, the number of unique beneficiaries, and the total amount paid. Records with fewer than 12 claims were suppressed by HHS before release. Provider practice locations were obtained from the National Plan and Provider Enumeration System (NPPES) through the 84 monthly snapshots archived by the National Bureau of Economic Research (NBER) [2]. Medicaid enrollment was taken from the American Community Survey (ACS) five-year table C27007 [3], and procedure categories were defined by the American Dental Association Current Dental Terminology (CDT) [4].

### Data Linkage and Aggregation

The processing steps are summarized in Fig. 1. Records with a procedure code beginning with "D," the prefix shared by all CDT codes, were retained as dental records. The servicing provider identifier on each dental record was matched to the NPPES snapshot for the month of service, and the practice location address in that snapshot was assigned to the record. Records without a match were excluded. Distinct practice addresses were geocoded in a single batch with the ArcGIS World Geocoding Service [5], which returned coordinates and a five-digit county Federal Information Processing Standards (FIPS) code for each address.

Procedure codes were assigned to the 12 CDT categories by numeric range (e.g., D1000 to D1999, preventive). Codes outside the defined ranges were classified as uncategorized and retained in all totals. Claims, beneficiaries, and amounts paid were then summed by year and by month at the state, county, and three-digit ZIP code (ZIP3) levels using DuckDB [6]. County was taken from the geocoded FIPS code, and state totals were computed as the sum of their counties. ZIP3 was defined as the first three digits of the NPPES practice ZIP code. Records lacking a county were excluded from state and county totals, and records lacking a valid ZIP code were excluded from ZIP3 totals.

Utilization rates were calculated as claims per ACS-reported Medicaid enrollee, using the five-year estimate ending in the year of service. County denominators were used as published. ZIP3 denominators were calculated by summing the ZIP Code Tabulation Areas that share the same first three digits.

### Validation

The pipeline was evaluated in three ways. First, to assess reproducibility, an independent script that shares no code with the pipeline rebuilt each processing step from the written methods and compared its output with the published aggregate files. Second, linkage accuracy was assessed by the proportion of records, claims, and dollars matched to NPPES; the distribution of geocoder match status; agreement between the state of the geocoded county and the state recorded in NPPES; and an audit of 200 servicing National Provider Identifiers (NPIs) drawn by simple random sampling from all NPIs with at least one linked dental record in 2024. For each sampled NPI, the practice ZIP code in our data was compared with the current record in the NPPES Registry [7]. Third, annual dollar totals were compared with Medicaid and Children's Health Insurance Program (CHIP) spending on dental services in the 2024 release of the National Health Expenditure Accounts (NHE) [8]. NHE estimates cover the 50 states and the District of Columbia, so territories were excluded from this comparison. Proportions from the registry audit are reported with Wilson 95% confidence intervals (CIs).

## Results

### Pipeline Output

Of 227,083,361 records in the HHS release, 24,068,574 (10.6%) were dental. Linkage to NPPES excluded 895,691 records (3.7%), leaving 23,172,883. The 69,960 distinct practice addresses were geocoded, after which 23,140,395 records were available for state and county aggregation and 23,171,904 for ZIP3 aggregation (Fig. 1).

### Reproducibility

The independent re-implementation reproduced the dental record, claim, and dollar totals of the raw release. Every linked record matched an unaltered source record, and no record eligible for linkage was missing. All records in the six published aggregate files were reproduced exactly, each state total equaled the sum of its counties, and monthly values summed to annual values (XX of XX checks passed). Uncategorized codes accounted for XX% of claims and XX% of dollars.

### Linkage Accuracy

Overall, 96.3% of dental records, 96.0% of claims, and 95.5% of dollars were linked to NPPES. The proportion of linked records increased from 94.3% in 2018 to 99.1% in 2024. Of the 895,691 unlinked records, 685,886 (76.6%) lacked a servicing provider identifier, 207,059 (23.1%) carried a state-assigned or malformed identifier, and 2,746 (0.3%) carried a valid NPI that was absent from the NPPES snapshot for that month. Of the 69,960 addresses, 69,384 (99.2%) were matched by the geocoder, 490 (0.7%) received a tied match, and 86 (0.1%) could not be located; the unlocated addresses accounted for 0.16% of claims. The state of the geocoded county agreed with the NPPES state for 99.98% of claims. In the registry audit, the five-digit ZIP code agreed for 185 of 200 NPIs (92.5%; 95% CI 88.0–95.4%), and either the ZIP code or the state agreed for 192 (96.0%; 95% CI 92.3–98.0%).

### Comparison With National Health Expenditure Estimates

From 2018 through 2024, dental payments in the HHS release totaled $44.2 billion, or 44.0% of the $100.6 billion in Medicaid and CHIP dental spending estimated by NHE (Fig. 2). After linkage and geocoding, payments attributed to the 50 states and the District of Columbia totaled $41.8 billion (41.6% of NHE). The pipeline retained 94.6% of dental dollars in the release overall and between 92.2% and 98.6% in individual years. Annual coverage of NHE ranged from 36.3% in 2020 to 44.8% in 2023. Payments of $0 were recorded for 7.5% of dental claims in the release.

## Discussion (limitations paragraph)

These findings should be interpreted in light of several limitations. Because HHS suppressed records with fewer than 12 claims, low-volume providers and infrequent procedures are underrepresented, and the extent of this loss cannot be estimated from the released data. Claims from late 2024 were likely incomplete at the time of release. Excluded records lacking a valid NPI are unlikely to be missing at random and may disproportionately represent school-based programs, mobile clinics, and other providers billing under state-assigned identifiers. Claims were assigned to the servicing provider's practice address, which may differ from both the patient's residence and the site of care; rates may therefore be overstated in areas containing large clinics and understated in the surrounding areas their patients come from. The ACS undercounts Medicaid enrollment relative to administrative records, and the magnitude of the undercount varies by state [9, 10]; consecutive five-year estimates also share most of their underlying sample. Beneficiary counts summed across records count a patient once for each provider and procedure code and do not represent unique individuals. State and ZIP3 totals are drawn from slightly different sets of records and do not reconcile exactly. The difference from NHE estimates largely originates in the release itself and likely reflects differences in scope: NHE dental services represent revenue of dentists' offices, so procedures billed by health centers and other facilities may be classified elsewhere [8], and missing payment amounts are recorded as $0 in the release. Finally, adult dental benefits differ across state Medicaid programs, so differences between states partly reflect policy, and the aggregated data support descriptive rather than causal inference.

## References used in this draft

1. HHS. Medicaid Provider Spending. HHS Open Data Platform. 2026.
2. National Bureau of Economic Research. NPPES monthly data archive, 2018–2024.
3. U.S. Census Bureau. American Community Survey 5-year estimates, table C27007.
4. American Dental Association. Current Dental Terminology (CDT).
5. Esri. ArcGIS World Geocoding Service.
6. DuckDB Foundation. DuckDB.
7. Centers for Medicare & Medicaid Services. NPPES NPI Registry API, version 2.1.
8. Centers for Medicare & Medicaid Services, Office of the Actuary. National Health Expenditure Accounts: type of service and source of funds, CY 1960–2024; and Definitions, Sources, and Methods, 2024 edition.
9. Medicaid expansion and the Medicaid undercount in the American Community Survey. Health Serv Res. 2019. doi:10.1111/1475-6773.13213
10. Survey-reported coverage in 2019–2022 and implications for unwinding Medicaid continuous eligibility. JAMA Health Forum. 2024. doi:10.1001/jamahealthforum.2024.0430
