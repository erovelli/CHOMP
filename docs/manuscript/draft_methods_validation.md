# Draft: Technical Approach, Validation, Limitations

Items in [brackets] need a number or decision from the team.

## Technical Approach

### Data sources

The HHS Medicaid Provider Spending release [ref] reports paid Medicaid claims from January 2018 through December 2024. Each row aggregates one billing provider, servicing provider, procedure code, and month, and gives the number of claims, the number of unique beneficiaries, and the total amount paid. HHS drops any row with fewer than 12 claims. Provider practice addresses came from the National Plan and Provider Enumeration System (NPPES), using the 84 monthly snapshots archived by the National Bureau of Economic Research (NBER) [ref]. Medicaid enrollment came from U.S. Census American Community Survey (ACS) five-year table C27007 [ref]. Procedure categories follow the American Dental Association Current Dental Terminology (CDT) [ref].

### Linkage and aggregation

The pipeline has five steps (Fig. 1). First, rows whose procedure code begins with "D" were kept, since all CDT codes carry that prefix; 24,068,574 of 227,083,361 rows were dental. Second, each row's servicing provider identifier was matched to the NPPES snapshot for the month of service, attaching the practice location address current at that time. Rows without a match (895,691; 3.72%) were dropped. Third, the 69,960 distinct practice addresses were geocoded once in a single ArcGIS batch, which returned latitude, longitude, and five-digit county FIPS code. Fourth, codes were grouped into the 12 CDT categories by numeric range (for example, D1000 to D1999, Preventive). Codes outside these ranges were labeled uncategorized and kept in all totals. Fifth, claims, beneficiaries, and dollars were summed by year and by month at three levels using DuckDB [ref]. County comes from the geocoded FIPS code and each state total is the sum of its counties. ZIP3 is the first three digits of the NPPES practice ZIP code. Rows without a county (32,488) are absent from state and county totals, and rows without a valid ZIP code (979) are absent from ZIP3 totals, leaving 23,140,395 and 23,171,904 rows.

For rates, claims were divided by the ACS Medicaid-covered population from the five-year estimate ending in the claim year. County denominators are used directly. ZIP3 denominators sum the ZIP Code Tabulation Areas sharing the same first three digits. The rate is claims per ACS-reported Medicaid enrollee and does not measure the share of enrollees who received care.

The pipeline is written in Python and SQL. It produces six aggregate files (annual and monthly by state, county, and ZIP3) in newline-delimited JSON.

## Validation

We tested the pipeline three ways: an independent re-implementation of every step, an audit of the provider linkage, and comparison with national spending estimates.

### Reproducibility

A separate script, sharing no code with the pipeline, rebuilt each step from the written methods. It reproduced the dental row, claim, and dollar totals from the raw release. It confirmed that every linked row is an unmodified source row and that no row eligible for linkage was lost. It reproduced every record of the six aggregate files exactly, and confirmed that each state equals the sum of its counties and that monthly values sum to the annual values. [All N checks passed.] Uncategorized codes accounted for [X]% of claims and [Y]% of dollars.

### Linkage accuracy

NPPES linkage captured 96.3% of dental rows, 96.0% of claims, and 95.5% of dollars, rising from 94.3% of rows in 2018 to 99.1% in 2024. Among unmatched rows, 76.6% had no servicing identifier, 23.1% carried a state-assigned or malformed identifier, and 0.3% carried a valid NPI absent from that month's snapshot. ArcGIS matched 69,384 addresses (99.2%), returned a tied match for 490 (0.7%), and failed on 86 (0.1%), which carried 0.16% of claims. The state of the geocoded county agreed with the NPPES address state for 99.98% of claims. In a random sample of 200 servicing NPIs billing in 2024, the five-digit ZIP code in our data matched the current NPPES Registry record for 185 (92.5%; 95% CI 88.0 to 95.4) and the ZIP code or state matched for 192 (96.0%; 92.3 to 98.0). The registry reports current addresses, so providers who moved after their last 2024 claim count as mismatches.

### External benchmark

We compared dollars with the Medicaid and CHIP rows of National Health Expenditure (NHE) dental services spending, 2024 release [ref] (Fig. 2). Over 2018 to 2024, dental dollars in the HHS release totaled $44.2 billion, 44.0% of the NHE estimate of $100.6 billion. After linkage and geocoding, the mapped total for the 50 states and DC was $41.8 billion (41.6%). The pipeline therefore kept 94.6% of release dollars overall (92.2% to 98.6% by year), and most of the gap with NHE originates in the release. The two sources also measure different things. NHE counts revenue of dentists' offices, so dental procedures billed by health centers and other facilities can fall outside it. HHS also records missing line-level payments as $0, which applied to 7.5% of dental claims. The benchmark shows coverage of the release and should not be read as a reconciliation.

## Limitations

The release omits rows with fewer than 12 claims, which removes low-volume providers and rare procedures, and the size of that loss cannot be measured. Claims for late 2024 were incomplete at release. Rows without a valid servicing NPI were excluded, and these are not random; they likely include school-based programs, mobile units, and clinics billing under state-assigned identifiers. Claims are placed at the servicing provider's practice address. That address is not where the patient lives and may not be where care took place, which inflates rates in areas with large clinics and deflates them in the areas their patients travel from. The ACS undercounts Medicaid enrollment relative to administrative records [ref], by amounts that differ across states, and five-year estimates overlap across years. Beneficiary counts summed across rows count a patient once per provider and code, so they are not counts of unique people. State and ZIP3 totals come from slightly different sets of rows and do not reconcile exactly. Adult dental benefits differ by state, so cross-state differences partly reflect policy. The outputs are descriptive and do not support causal claims.
