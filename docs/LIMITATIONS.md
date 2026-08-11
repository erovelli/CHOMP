# Known data limitations

> **Living document.** Add an entry here every time we discover a new data-quality issue, a structural exclusion, or a methodological caveat. Future analyses (and reviewers) should be able to look at this file once and understand the universe of caveats. See [Adding to this doc](#adding-to-this-doc) at the bottom.

This is a comprehensive list of limitations that affect the merged and geocoded dataset used by CHOMP (Claims History of Oral Healthcare Medicaid Procedures). Each entry has a short ID for cross-reference in code comments, methods sections, and reviewer responses.

**Severity legend:**

- 🟥 **Material** — meaningfully affects interpretation; must be disclosed in any publication.
- 🟨 **Moderate** — affects edge cases or specific cohorts; disclose if those cohorts matter.
- ⬜ **Minor** — known but small; mention in technical appendix only.

---

## Data-loss summary (HHS source → mapped dataset)

Cumulative accounting of how many rows we lose at each stage of the pipeline, and the limit ID that explains each loss. "Rows in" of each stage equals "rows remaining" from the previous stage; numbers come from `data/MergedHHS-NPI/coverage_report.csv`, `geocode_failures.csv`, and the HHS source CSV.

| #   | Stage                                                                  | Reason for exclusion                                                                                  |     Rows in |               Rows dropped | Rows remaining | Limit ID   |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------: | -------------------------: | -------------: | ---------- |
| 0   | HHS source CSV                                                         | — (raw release, 7 columns, 2018-01 → 2024-12)                                                         |           — |                          — |    227,083,361 | —          |
| 1   | Phase A filter ([`merge_hhs_nppes.py`](../scripts/merge_hhs_nppes.py)) | HCPCS code not D-prefixed (non-dental — medical, behavioral, etc.)                                    | 227,083,361 |                203,014,787 |     24,068,574 | structural |
| 2   | Phase B NPPES inner join                                               | `SERVICING_PROVIDER_NPI_NUM` not found in same-month NPPES (all causes combined)                      |  24,068,574 |            895,691 (3.72%) |     23,172,883 | L07        |
| 2a  | ↳ sub-cause                                                            | Non-NPI servicing identifier (NULL, A-prefix Atypical, M-prefix Medicaid, sentinels, other malformed) |           — | ~895,083 (~99.9% of drops) |              — | L08        |
| 2b  | ↳ sub-cause                                                            | Real 10-digit NPI but registered after the NBER monthly snapshot (recoverable with ±1-month window)   |           — |      608 (~0.07% of drops) |              — | L04        |
| 3   | Geocoding (ArcGIS, collaborator handoff)                               | Address could not be geocoded (`geocode_status == 'U'`; 86 of 69,960 unique addresses)                |  23,172,883 |             32,488 (0.14%) |     23,140,395 | L13 / L32  |
| —   | **Final mapped dataset**                                               | —                                                                                                     |           — |                          — | **23,140,395** | —          |

**Cumulative loss from raw HHS:** 203,942,966 rows (89.81%) — almost entirely the non-dental filter at stage 1. From the dental-only universe of 24,068,574 rows, total downstream loss is 928,179 rows (3.86%).

**Not counted here** (invisible upstream losses): HHS cell-suppression of small (provider × HCPCS × month) cells (L03), and claims-processing lag in 2024-11/2024-12 (L02). These never enter our row counts.

**Sub-cause 2a is not yet broken out by bucket.** [`scripts/categorize_servicing_ids.py`](../scripts/categorize_servicing_ids.py) produces the exact NULL / A-prefix / M-prefix / sentinel / other split into `data/MergedHHS-NPI/servicing_id_categories.csv` — run it to fill in the row-level breakdown.

---

## 1. Source-data limitations (inherent to HHS / NPPES / NBER releases)

### L01 🟥 Date range bounded by HHS release

**Issue.** The HHS Medicaid dental claims release covers `2018-01` through `2024-12` only. Earlier claims pre-date the federal data-sharing rule that triggered this dataset; later claims await the next HHS release.
**Impact.** No pre-2018 trend baseline. Late-2024 months have partial coverage (see L02).
**Status.** Structural — wait for next release.

### L02 🟥 Claims-processing lag in trailing months

**Issue.** Medicaid administrative data takes 6–18 months to fully reconcile. `2024-11` and `2024-12` show ~30–50% fewer rows than the 7-year monthly average (`202411 = 285,566 rows`; `202412 = 167,727 rows`; vs. `~340,000 rows/month` average).
**Impact.** Cross-sectional totals for late 2024 systematically understate utilization. Year-over-year growth comparisons against 2024 are biased.
**Mitigation.** For temporal analyses, treat anything from `2024-Q4` onward as preliminary. Document in methods footnote.
**Status.** Structural — improves with next data release.

### L03 🟥 HHS cell-suppression (small-cell censoring)

**Issue.** HHS suppresses any (provider × HCPCS × month) cell with fewer than 12 claims **or** fewer than 12 unique beneficiaries.
**Impact.** Rural and low-volume providers are disproportionately suppressed. Pediatric subspecialties with rare procedure codes (e.g., D-prefix orthodontic) are suppressed more often than common preventive codes.
**Mitigation.** Disclose suppression rule in methods. Suppressed rows are absent from the data; the absence is invisible in our dataset — we never see them.
**Status.** Permanent feature of HHS release.

### L04 🟨 NBER NPPES snapshots are dated mid-month, not end-of-month

**Issue.** NBER's monthly NPPES archive is a snapshot taken on a specific date (e.g., `npi_raw_201801.zip` contains `npidata_20050523-20180107.csv`, meaning data current through 2018-01-07). Providers registering between the snapshot date and end-of-month appear only in the _following_ month's archive.
**Impact.** ~0.1% of HHS claims fail the same-month NPPES inner join because the servicing provider's NPI was registered after the snapshot was taken (see L08). Almost all of these are recoverable with a `±1` month window, but the current pipeline doesn't fall back.
**Mitigation.** None implemented. `scripts/analyze_coverage.py --window 1` quantifies the recoverable share.
**Status.** Known; recovery code drafted but not yet integrated.

### L05 🟨 NPPES coverage limited to NBER's monthly cadence

**Issue.** CMS updates NPPES daily; NBER snapshots monthly. There's typically a ~30-day window where a freshly-registered NPI exists at CMS but hasn't appeared in any NBER archive yet.
**Impact.** Very recent providers may be missing from all 84 NBER archives even if they billed Medicaid in the dataset window.
**Mitigation.** None feasible without switching to CMS's daily feed.
**Status.** Structural.

### L06 ⬜ Replacement NPIs not followed

**Issue.** NPPES tracks NPI replacements via a `replacement_npi` field. When CMS administratively replaces an NPI, the old one is deactivated and points to the new one. Our merge ignores this chain.
**Impact.** A small (<0.1%) number of historical claims keyed to a since-replaced NPI fail the merge even though the provider's address is recoverable via the successor NPI.
**Mitigation.** None implemented. ~30-line script change would chase the chain.
**Status.** Known; deferred.

---

## 2. Merge-pipeline limitations (caused by our `merge_hhs_nppes.py`)

### L07 🟥 3.2% inner-join drop rate

**Issue.** ~3.2% of HHS dental rows are dropped because the `SERVICING_PROVIDER_NPI_NUM` value isn't found in the same-month NPPES file. Of these dropped rows:

- 99.9% have a `SERVICING_PROVIDER_NPI_NUM` that **isn't a real NPI** (see L08–L11).
- 0.1% are real NPIs that _would_ be found in an adjacent NPPES month (see L04).

**Impact.** The merged dataset excludes ~740,000 of ~23.9M dental claim-rows from any geography-attached analysis. The exclusion is non-random — it disproportionately removes care delivered by atypical providers (school-based dental, mobile units, FQHC satellite operations under aggregator IDs).
**Mitigation.** Disclose as methodological exclusion. Quantified per-month in `data/MergedHHS-NPI/coverage_report.csv`.

### L08 🟥 Non-NPI servicing identifiers (A-prefix, M-prefix, sentinels, nulls)

**Issue.** ~99.9% of dropped HHS rows have non-NPI servicing identifiers. Breakdown (run `scripts/categorize_servicing_ids.py` for current numbers):

- **NULL** — claim submitted without populating the servicing-NPI column (state submission gap).
- **A-prefix** (e.g., `A875718600`) — state-assigned Atypical Provider IDs. Used for Medicaid-billing entities that don't qualify for NPIs: school-based dental programs, group-home dental services, transportation-services entities, some HCBS dental hygiene programs.
- **M-prefix** (e.g., `M447402100`) — state Medicaid IDs (legacy / pre-NPI, dental therapists, hygienists with independent practice authority in some states).
- **Sentinels** (`0000000000`, `1999999992`, etc.) — placeholders used when the submitting state couldn't identify the provider.
- **Other malformed** — typos (e.g., `110141879A`), foreign IDs.

**Impact.** These rows have no NPI → cannot be matched against NPPES → cannot be geocoded. They represent a real Medicaid dental population but are absent from the spatial analysis.
**Mitigation.** Disclose as exclusion. State Medicaid offices publish their own provider directories; for a future iteration, state-level joins could partially fill the gap. Out of scope for current release.

### L09 🟨 Inner-join semantics (not left-join)

**Issue.** `merge_hhs_nppes.py` does an inner join on `servicing_npi`. Dropped rows are silently excluded from the merged output — they don't appear with NULL geography fields.
**Impact.** Downstream code can't distinguish "no claims at this address" from "claims existed but lost in merge." The total claim count in the merged file is 23,172,883 vs. ~23.9M in pre-merge HHS dental.
**Mitigation.** Pre-merge per-month counts are preserved in `data/MergedHHS-NPI/hhs_dental/*.parquet` for sanity-checking. `analyze_coverage.py` produces the count differential per month.

### L10 🟨 Servicing NPI used as join key, not billing NPI

**Issue.** [`scripts/merge_hhs_nppes.py`](../scripts/merge_hhs_nppes.py) joins on `SERVICING_PROVIDER_NPI_NUM`. The billing NPI is preserved as a column but not used to attribute geography.
**Impact.** For claims where servicing = NPI but billing = non-NPI organization (or vice versa), we attribute geography to the dentist's practice address, which is usually correct for utilization mapping. But high-volume DSO (Dental Support Organization) claims may have the dentist's address point to the chain's central office rather than where the patient actually went.
**Mitigation.** Documented choice. Servicing-NPI attribution matches CMS convention and is correct for "where dental care happens" questions.

### L11 ⬜ Primary taxonomy resolution picks the first `Switch_N == 'Y'`

**Issue.** NPPES allows up to 15 taxonomy slots per provider, with a primary flag per slot. Our code picks the lowest-numbered slot where `Switch_N == 'Y'`. NPPES rules require exactly one primary switch, but ~0.01% of records have data anomalies (multiple Y values or none).
**Impact.** Negligible. Affects taxonomy assignment, not address.
**Mitigation.** None needed.

### L12 ⬜ ZIP+4 truncated to ZIP5

**Issue.** NPPES stores 9-digit ZIP+4 (no hyphen); we truncate to 5 digits. ZIP5 is the project's chosen geographic grain.
**Impact.** Intentional; not a limitation per se. Disclosed for clarity.

---

## 3. Geocoding limitations (from collaborator's geocoded output)

> Per collaborator (Md Shahinoor Rahman, Harvard Dental Medicine), the unique-addresses file was geocoded with ArcGIS and returned as `Dental_Provider_Locations.csv`. [`scripts/join_geocoded.py`](../scripts/join_geocoded.py) keeps five of its columns — `latitude`, `longitude`, `county_fips`, `county_name`, `geocode_status` — and joins them onto the claims table by `address_id`. The points below are issues he flagged or that arose from his handoff.

### L13 🟥 86 unique addresses failed to geocode

**Issue.** 86 of 69,960 unique addresses (~0.1%) returned NULL `latitude`/`longitude` (geocoder `geocode_status == 'U'`) because the input address was incomplete or malformed. (The handoff email cited 87; the delivered file has 86.)
**Impact.** Claims attributed to these addresses cannot be placed on the map. By `n_rows` weighting, this is a tiny share of total claims, but specific providers may be entirely lost.
**Mitigation.** Re-attempt with a different geocoder or fix the addresses manually in a follow-up pass. Affected addresses are identifiable by `address_id` where `latitude IS NULL` after the join.
**Status.** Known; documented.

### L14 🟨 Some geocoded points marked `geocode_status == 'T'` (unreliable)

**Issue.** The geocoder flagged 490 of 69,960 addresses with a `geocode_status` of `'T'` (tentative / unreliable). Most are nearly correct, with a few exceptions where the address lacks a valid street and the geocoder fell back to ZIP-centroid or city-centroid placement.
**Impact.** A small fraction of points may sit in the wrong census tract or even the wrong county. For state/ZIP3-level aggregation this is usually invisible (centroid is still in the right state and ZIP3), but parcel- or tract-level analyses should exclude or flag these.
**Mitigation.** Filter on `geocode_status != 'T'` for fine-grained spatial work. Inspection note: collaborator suggested manual review of `geocode_status == 'T'` addresses lacking a valid street.

### L15 🟨 Territory addresses (Guam, USVI, Puerto Rico, etc.) have NULL county FIPS / names

**Issue.** US territories aren't in the standard county FIPS system; the geocoder returned NULL for `county_fips` and `county_name`. Some territory addresses also fail geocoding entirely.
**Impact.** Any claims from territory providers are excluded from any county-level analysis. State-level analysis (using `practice_state` from the merge) still works for these rows.
**Mitigation.** Decide explicitly whether to include territories in the analysis. The collaborator recommended dropping Puerto Rico for US-mainland-focused analyses, in addition to Guam and USVI which are NULL anyway.

### L16 🟨 County FIPS 4-digit leading-zero handling

**Issue.** Standard county FIPS codes are 5 digits (`SSCCC`: 2-digit state, 3-digit county). Some downstream tools (Excel, default-dtype pandas) strip leading zeros when reading the geocoded CSV, producing 4-digit values.
**Impact.** Any join keyed on FIPS will silently miss the ~10% of counties whose FIPS starts with `0` (Alabama, Alaska, Arizona, Arkansas, California with FIPS `0XXXX`).
**Mitigation.** [`scripts/join_geocoded.py`](../scripts/join_geocoded.py) reads `county_fips` as a string and re-pads it to 5 digits, so `merged_hhs_nppes_geo.csv` is safe. Downstream readers of that file should still pass `dtype={'county_fips': 'string'}` to pandas.

### L17 🟨 Address normalization gaps cause over-splitting (false unique-address inflation)

**Issue.** Our `_normalize` collapses case and whitespace but doesn't normalize abbreviations (`STREET` vs `ST`, `SUITE` vs `STE`, periods, etc.). The same physical building can appear as multiple "unique" addresses in `unique_addresses.csv`.
**Impact.** Inflates the 69,960 unique-address count by some unknown small percentage. The geocoder typically maps near-duplicates to identical lat/lon, so post-geocoding the effective unique-location count drops 5–15%.
**Mitigation.** Post-geocoding, addresses with identical (or near-identical) lat/lon can be re-merged as a follow-up cleanup pass if needed.

### L32 ⬜ Geocoding failures are attributed by cause (geocoder vs. join)

**Issue.** A claim row can end up without coordinates for two unrelated reasons, and from `merged_hhs_nppes_geo.csv` alone they are indistinguishable: the geocoder could not place the address, or [`scripts/join_geocoded.py`](../scripts/join_geocoded.py) failed to match it back.
**Impact.** Conflated, the two hide each other — a join bug or a stale geocoded file would masquerade as ordinary geocoder loss and silently, non-randomly understate utilization.
**Mitigation.** `join_geocoded.py` sorts every unplaced claim row (either lat or lon missing) into one of three buckets and writes a per-address ledger to `data/MergedHHS-NPI/geocode_failures.csv`:

- `geocoder_unmatched` — the `address_id` joined, Status is `'U'`, and lat/lon are absent. The collaborator's geocoder could not locate it; expected loss, see L13.
- `join_miss` — the `address_id` matched no row in the geocoded file at all. A join-side problem: a stale geocoded file, or `_normalize` drift between the extract and join steps.
- `unexpected_missing_coords` — the `address_id` joined and the geocoded row's Status is NOT `'U'`, yet lat/lon are missing. Should be impossible; flags a malformed delivery and fails QC.

The script also runs integrity checks — no unused geocoded addresses, and per-address claim-row counts reconcile against the `n_rows` the extract step recorded — and exits non-zero on any `join_miss`, `unexpected_missing_coords`, unused address, or count mismatch. On the current dataset all 69,960 geocoded addresses are used, all counts reconcile, and every one of the 32,488 unplaced rows (0.14%) is `geocoder_unmatched` with zero `join_miss` and zero `unexpected_missing_coords`.
**Status.** Implemented.

---

## 4. Geographic-attribution caveats (interpretive)

### L18 🟨 Provider practice address is where the dentist's office is, not necessarily where the care happened

**Issue.** NPPES practice location is the dentist's primary clinic address. For dentists who work at multiple locations (rotating through community clinics, school visits, satellite offices), only the primary is captured.
**Impact.** Geographic utilization is biased toward primary clinic addresses, undercounting service delivery at secondary sites.
**Mitigation.** Documented. The NPPES "Practice Location 2..N" addendum tables could be incorporated in a future iteration (separate NBER files, not currently merged).

### L19 🟨 Provider address can change mid-period

**Issue.** A provider who moves offices in, say, June 2021 has different addresses in NPPES before and after the move. Each claim is geocoded to the address current at the time of the relevant NPPES monthly snapshot — but this is a point-in-time approximation, not the address on the actual service date.
**Impact.** Intra-month address changes are blurred to the snapshot date. Small effect overall; matters only for providers who move within a month.
**Mitigation.** Documented. NPPES dates of address change are available in the NBER archives but not currently used.

### L20 🟨 Interstate variation in Medicaid dental coverage

**Issue.** Adult Medicaid dental benefits vary dramatically by state: from comprehensive (NY, CA) to emergency-only (TN, AL) to none (DE). Pediatric coverage is more uniform (federally mandated under EPSDT).
**Impact.** Raw claim counts and dollars are not comparable across states for adult dental services. A "low" map value in TN reflects benefit policy, not lack of need.
**Mitigation.** Already surfaced in the InfoModal on the Harvard production site. Worth a paragraph in any policy interpretation of the map.

### L21 ⬜ Indian Health Service / tribal dental

**Issue.** IHS and tribal dental clinics may bill Medicaid through atypical or institutional identifier conventions that don't appear in NPPES the same way as private providers. Coverage in this dataset depends on the specific state and tribal compact.
**Impact.** Tribal communities may be systematically underrepresented in some states' dental utilization data.
**Mitigation.** None feasible within scope. Document if making claims about access in tribal areas.

---

## 5. ACS Medicaid enrollment data (denominator source)

The ACS C27007 table — "Medicaid/Means-Tested Public Coverage by Sex by Age" — is fetched by [`scripts/fetch_acs_medicaid.py`](../scripts/fetch_acs_medicaid.py) and used as the **denominator** for per-enrollee utilization rates. These limitations affect every per-capita map and every comparative analysis that normalizes claim counts by Medicaid enrollment.

### ACS source quality (the survey itself)

### L22 🟥 ACS 5-year endpoint-year dating (heavy temporal overlap)

**Issue.** The ACS 5-year file labeled "2023" is a pooled estimate over 2019–2023. The "2024" file pools 2020–2024. Consecutive endpoint years share 4 of 5 sample years.
**Impact.** Year-over-year changes in `medicaid_enrollees` from ACS are **not** independent annual observations — they reflect a smoothed/lagged 5-year window. A 2018→2024 plot of ACS Medicaid coverage will look much flatter than the underlying enrollment because of this overlap. The ACS 1-year release does avoid overlap but is unavailable for geographies below 65k population (no ZCTAs, ~75% of counties), so it's not an option for this project's grain.
**Mitigation.** For trend statements, compare non-overlapping endpoint years (e.g., ACS 2018 and ACS 2023 share no underlying sample years). Document the smoothing in any temporal analysis.
**Status.** Structural to ACS.

### L23 🟥 Survey-based Medicaid undercount vs. administrative rolls

**Issue.** ACS captures respondent-reported coverage. State Medicaid administrative enrollment is consistently ~20–30% higher than ACS estimates (the documented "Medicaid undercount" phenomenon). Respondents misreport coverage type (naming their managed-care plan instead of Medicaid), miss spousal/dependent enrollment, or simply don't know.
**Impact.** Per-enrollee utilization rates that use the ACS denominator are **systematically inflated** relative to what state Medicaid offices would publish using their own rolls. Cross-state comparisons are biased to the extent undercount varies by state (it does — e.g., TX under-reports more than MA).
**Mitigation.** Disclose in methods. Where state administrative enrollment is available (CMS-64 federal financial participation reports, state-level enrollment dashboards), prefer it for the denominator. Within-state geographic comparisons remain valid because undercount is roughly stable inside a state.
**Status.** Structural.

### L24 🟨 ACS universe excludes institutionalized populations

**Issue.** C27007's universe is "civilian noninstitutionalized population." Excludes inmates of correctional facilities, residents of nursing homes / mental hospitals, persons in military barracks / ships, and similar group quarters.
**Impact.** ZIPs or counties containing federal prisons, large military installations, or significant nursing-home capacity have ACS denominators that materially undercount the population eligible for healthcare services. Per-capita rates in those geographies look artificially high.
**Mitigation.** Flag known-institutional ZIPs for separate handling. Census publishes a list of ZIPs with high group-quarters share.
**Status.** Structural.

### L25 🟨 ZCTA boundary changes between 2010 and 2020 Census frames

**Issue.** ACS 5-year files for endpoint years 2018, 2019, 2020, 2021 use 2010 ZCTA boundaries. Endpoint years 2022 and later use 2020 ZCTA boundaries. ZCTAs that were redrawn, merged, or split appear in the data with shifts that reflect boundary changes, not population changes.
**Impact.** ZCTA-level trend analysis crossing 2021→2022 will show artificial discontinuities. At ZIP3 grain (this project's chosen aggregation), the impact is muted because most boundary changes redistribute population among ZCTAs that roll up to the same ZIP3 — but watch for cases where a ZCTA was split across two ZIP3 prefixes.
**Mitigation.** Prefer ZIP3 aggregation over raw ZCTA comparisons when crossing 2021→2022. Document.
**Status.** Structural.

### L26 🟨 ZCTAs are not USPS ZIP codes (coverage gaps)

**Issue.** USPS ZIP codes include PO-box-only ZIPs, single-organization ZIPs (one building gets its own ZIP), military APO/FPO ZIPs, and ZIPs assigned only to large institutional addresses. None of these have a Census ZCTA. NPPES practice ZIPs come from USPS; some won't join to any ACS ZCTA.
**Impact.** A small fraction (typically <2%) of unique practice ZIPs cannot be matched to an ACS denominator. Disproportionately affects practices inside large institutions (hospitals, universities, military bases).
**Mitigation.** Accept NULL matches when joining HHS claims to ACS; report the unmatched share. For institutional ZIPs, fall back to the surrounding ZCTA at the same ZIP3 prefix.
**Status.** Structural — USPS and Census deliberately use different geographies.

### ACS query / fetch pipeline

### L27 ⬜ ACS "jam values" are converted to NaN

**Issue.** Census uses sentinel values (`-666666666`, `-888888888`, `-999999999`, etc.) for cells that couldn't be released — sample too small, controlled to zero, MoE not computable, not applicable. [`fetch_acs_medicaid.py`](../scripts/fetch_acs_medicaid.py) maps every known jam value to `NaN`.
**Impact.** Some county/ZCTA rows have `NaN` in one or more `C27007_*` cells. Sums that silently treat `NaN` as zero (naive `.sum()` without `min_count`) would undercount. The fetch script propagates correctly using `min_count=len(components)`, so the aggregate is `NaN` if any component is missing — but downstream code must respect this.
**Mitigation.** Handled in the script. Downstream contributors: never `.fillna(0)` on an enrollee column without a documented reason.
**Status.** Handled at fetch; downstream awareness required.

### L28 ⬜ Census API operational risks (rate limits, trailing-year availability, no retry)

**Issue.** Three small operational risks bundled:

- **Rate limit.** The Census Data API has a soft ~500 calls/day cap without an API key, and a higher but documented cap with one. [`fetch_acs_medicaid.py`](../scripts/fetch_acs_medicaid.py) makes 14 calls per full run (7 years × 2 geographies) plus a 0.5s polite delay — well below any limit.
- **Trailing-year availability.** ACS 5-year endpoint files are released in December of the _following_ year (the 2024 endpoint file was released in Dec 2025). Running the fetch before the trailing-year file is published returns 404 for that year only; the script handles 404 gracefully and skips.
- **No retry on transient errors.** A 5xx response or network drop aborts the single year/geo call. Manual re-run with `--years` is needed to backfill.

**Impact.** Operational; rarely hit. Worth knowing when running close to a Census release date or on a flaky network.
**Mitigation.** Add `tenacity`-style retries around `fetch_one()` if reliability becomes an issue. Re-run with `--years` for selective backfill.
**Status.** Acceptable for current cadence; documented for future contributors.

### L29 🟨 Margin of error fetched but not used downstream

**Issue.** [`fetch_acs_medicaid.py`](../scripts/fetch_acs_medicaid.py) computes `medicaid_enrollees_moe` using the Census-recommended formula (`sqrt` of sum of squared component MoEs) and writes it to the output CSV. Nothing downstream — choropleth, per-capita rate calc, category aggregation — currently consumes it. The map shows point estimates without uncertainty.
**Impact.** For low-population ZCTAs, MoE can exceed the point estimate (the 95% CI crosses zero), making the per-capita rate statistically indistinguishable from any value. This is invisible in the current map.
**Mitigation.** Future work — suppress, grey out, or hatched-overlay cells where `MoE > 50%` of the estimate. Estimated 5–15% of ZCTAs affected, concentrated in rural areas with small Medicaid populations.
**Status.** Known; deferred. Tracked here so reviewers don't ask why CIs are missing.

### ACS interpretation / joining HHS

### L30 🟥 ACS Medicaid enrollment is not the same as Medicaid claimants

**Issue.** ACS measures "person had Medicaid coverage during the survey window." HHS claims data measures "person filed a Medicaid dental claim during this month." Many Medicaid enrollees never use dental services in any given month (or year), and the dental-claimant subset is what HHS captures.
**Impact.** Per-enrollee utilization rates computed as `(HHS claims) / (ACS enrollees)` are a mixture of two effects: (a) how many people _used_ dental services, and (b) how many people _had_ coverage. The rate is interpretable as "claims per enrollee" but **not** as "share of enrollees who got dental care" — the numerator's unit is claims, not unique people.
**Mitigation.** State the denominator definition explicitly in any rate analysis ("dental claims per ACS-reported Medicaid enrollee, endpoint year X"). For "share who used dental care," use HHS's `beneficiaries_served_count` over ACS enrollees instead.
**Status.** Methodological — disclosure required.

### L31 ⬜ ACS endpoint-year alignment with claim period

**Issue.** An HHS claim filed in 2022 could be normalized by any of several ACS endpoint years: the 2022 file (pooled 2018–2022, centered ~2020), the 2024 file (pooled 2020–2024, centered ~2022), or an interpolation. Each choice produces materially different per-enrollee rates for trailing project years.
**Resolution.** **Same-year alignment.** For claim year Y, the front end uses ACS endpoint year Y (i.e., claim 2022 ÷ ACS 2022 pooled estimate centered ~2020). This is implemented in [`getEnrolleesFor`](../src/lib/dataService.ts) and exercised by both the map paint loop in [`MapContainer.tsx`](../src/components/map/MapContainer.tsx) and the side-panel `Medicaid Enrollees` / `Claims / Enrollee` stat cards in [`PanelContent.tsx`](../src/components/ui/DetailPanel/PanelContent.tsx). Monthly views reuse the claim year's endpoint value across all 12 months because ACS is annual only.
**Impact.** Same-year alignment understates 2023–2024 rates slightly (denominator is centered ~2021–2022), but trades off against the rate of choice noise — a Y+2 rule would require the _next_ year's ACS release at every fiscal cycle, blocking publication.
**Status.** Resolved; documented here in lieu of a standalone ADR.

---

## 6. Aggregation / map-build limitations (from `build_aggregates.py`)

> The published NDJSON files under [`public/data/`](../public/data/) are produced
> by [`scripts/build_aggregates.py`](../scripts/build_aggregates.py) (DuckDB),
> which reads `merged_hhs_nppes_geo.csv` and emits 6 files: `{annual,monthly}` ×
> `{state,county,zip3}`. These caveats are specific to that roll-up step.

### L33 🟥 State is built from county sums; the three levels do not share one universe

**Issue.** `county` and `state` are keyed off the geocoded `county_fips`; `state`
postal is derived from the county FIPS state prefix (`LEFT(county_fips, 2)`), so
`state == SUM(its counties)` exactly. But `zip3` is keyed off NPPES
`practice_zip5`. The two geographies cover **different row universes**:

- county/state universe: 23,140,395 rows (rows with a non-NULL `county_fips`).
- zip3 universe: 23,171,904 rows (rows with a non-NULL `practice_zip5`).

The ~32,488 geocode-failure rows (L13/L32) have a ZIP but no county, so they are
present in `zip3` but excluded from `county`/`state`.
**Impact.** `sum(zip3) − sum(state) ≈ 2.0M claims` (~0.16% of the 1.23B total).
Cross-level totals will not reconcile; a reviewer summing all ZIP3s and all
states will get different national totals. This is a deliberate "max coverage per
level" choice (confirmed with project owner): each level is as complete as its
own geography allows, rather than intersecting to a common universe.
**Mitigation.** Disclose in methods. If exact cross-level reconciliation is ever
needed, restrict `zip3` to rows that also have a `county_fips` (one-line `WHERE`
change in the build script) — at the cost of dropping the geocode-failure rows
from the ZIP3 map too.
**Status.** By design; documented.

### L34 🟨 Territories roll up to state postals with no map geometry

**Issue.** 316,734 rows carry territory county FIPS (PR `72`, GU `66`, VI `78`,
MP `69`). `build_aggregates.py` maps these to USPS postals (`PR/GU/VI/MP`) so they
roll into `state` and keep the `state == SUM(county)` invariant. But
`states.pmtiles` and `counties.geojson` may not include territory polygons.
**Impact.** Territory keys exist in the data files but render nowhere on the map
(the UI silently ignores keys with no matching feature). Territory claims are in
the national `state`/`county` totals but invisible spatially.
**Mitigation.** Acceptable. To surface territories, add their geometries to the
state/county sources. Note `merged_hhs_nppes_geo.csv` does have territory
`county_fips` despite L15's earlier expectation that territories geocode to NULL.
**Status.** Documented.

### L35 ⬜ Choropleth color scale is dynamic; rules differ by metric

**Issue.** Claim magnitudes differ by ~2 orders of magnitude across geography levels (2023 medians: state ~1.9M, zip3 ~98k, county ~11k). A single fixed scale washes most regions to one end of the palette. But the per-enrollee rate is unit-free — "1.32 claims per enrollee" means the same thing at any zoom level — so per-level scales would _also_ be wrong for that metric.
**Resolution.** Scale rules in `quantileStops()` / `applyActiveColors` differ by metric:

- **Volume**: per-level quantile stops. Each level gets its own 7-stop scale computed over the current (year × category) slice. Outliers clipped at p97. Color is _not_ comparable across geography levels.
- **Per Medicaid enrollee**: a single shared scale across state + county + zip3, computed over the union of all three levels' values for the current (year × category). Outliers winsorized at **p95** — standard practice for published rate choropleths, where long-tail outliers (in this dataset, provider-attribution-inflated ZIP3 hubs — see L37) would otherwise stretch the legend and wash out the rest of the country. Geos above p95 saturate to the darkest band. Color _is_ comparable across geography levels and across the country.

The Legend reads the active stops from the store (`colorStops`) and surfaces a caveat string when the metric is `enrollees` (_"Capped at 95th percentile; outliers saturate"_) versus the volume default (_"Scale adjusts to the current view"_).
**Status.** Implemented (supersedes the earlier uniform-rule approach).

### L36 ⬜ County geometry vintage differs from claims

**Issue.** Counties are served as GeoJSON (Census cartographic-boundary counties,
via [`scripts/fetch_county_geometry.py`](../scripts/fetch_county_geometry.py))
because the build environment has no tippecanoe/ogr2ogr to produce a county
`.pmtiles`. The boundary file is a fixed Census vintage; a handful of FIPS codes
that changed over 2018–2024 (e.g. Connecticut's 2022 planning-region recode) may
not match the geocoded `county_fips` exactly.
**Impact.** A small number of county keys may not join to a polygon (rendered
blank) or vice-versa. At the national choropleth scale this is negligible.
**Mitigation.** Swap in a matching-vintage county boundary set, or move counties
to PMTiles, in a follow-up. ZIP3/state are unaffected.
**Status.** Minor; documented.

### L37 🟥 Provider-attribution inflates per-enrollee rates at smaller grains

**Issue.** Claims are geocoded to the **servicing provider's** practice address
(see L10), not the patient's residence. The per-enrollee denominator from ACS
counts **enrollees who live in the geography**. Where a geography contains a
dental hub (FQHC, large group practice, school-based program, mobile-unit
billing address) serving a wider catchment, the numerator includes patients
from neighboring counties or states while the denominator does not — the rate
is inflated. The mirror effect deflates the rate in surrounding rural areas
whose enrollees travel out for care.
**Impact.** Per-enrollee values at ZIP3 and small-county grain are skewed
upward in provider-hub geographies and downward in their catchment areas. At
the state level the effect mostly cancels within a state but does not cancel
across state borders. The shared-scale, p95-winsorized color logic
([L35](#l35--choropleth-color-scale-is-dynamic-rules-differ-by-metric)) was
designed in part to keep these hubs from dominating the legend — they now
saturate to the darkest band rather than stretching the scale.

Concrete pattern noticed during review: South Dakota appears markedly lower
on the per-enrollee map than its neighbors. Three plausible drivers stack in
the same direction: limited adult Medicaid dental benefit in SD ([L20](#l20--interstate-variation-in-medicaid-dental-coverage)),
patients crossing state lines to ND/MN providers (attribution drift), and
ACS over-stating Medicaid enrollment in small-state samples ([L23](#l23--survey-based-medicaid-undercount-vs-administrative-rolls)). The
provider-attribution piece is L37 specifically.

**Mitigation.** No code-level mitigation in the map (would require a
patient-residence attribution pass not available in HHS Open Data). Disclose
in methods notes for any per-enrollee map. The InfoModal carries a one-line
caveat to that effect.
**Status.** Structural; documented and surfaced.

---

## Adding to this doc

When you find a new data limitation while working with the dataset, add an entry **here** before merging the related code change. The entry should have:

- **An ID** (`L32`, `L33`, ...) — continue the sequence; never reuse a retired ID.
- **A one-line title** stating what the limitation is.
- **A category section** (Source / Merge / Geocoding / ACS / Attribution) — add a new section if none fits.
- **A severity emoji** (🟥 🟨 ⬜) using the legend at the top.
- **Issue**, **Impact**, and **Mitigation/Status** subsections matching the style above.

If you fix a limitation, don't delete the entry — change the **Status** line to "Mitigated (see [commit/PR link])" and leave the rest as historical record. This keeps a paper trail that's auditable in a methods section.

For any limitation that affects how a number should be interpreted in a publication, also flag the relevant entry in [`docs/DATA_DICTIONARY.md`](DATA_DICTIONARY.md) so readers of that doc are pointed back here.
