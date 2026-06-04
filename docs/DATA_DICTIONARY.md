# Data dictionary

> **Audience:** anyone adding a new data field, debugging a value that looks wrong, or integrating these exports into another downstream tool.

This document is the single source of truth for the shape and semantics of the NDJSON files under [`public/data/`](../public/data/). These files are the contract between the [data pipeline](../scripts/build_aggregates.py) and the [frontend](../src/). Every field the UI renders traces back to one of these records.

## Contents

1. [File naming convention](#file-naming-convention)
2. [NDJSON envelope](#ndjson-envelope)
3. [Record schema](#record-schema)
4. [Field reference](#field-reference)
5. [Categories](#categories)
6. [Suppression & null handling](#suppression--null-handling)
7. [Identifier formats](#identifier-formats)
8. [Versioning](#versioning)

---

## File naming convention

```
provider_procedure_category_aggregate_{grain}_{geo}.json
```

| Slot    | Values                        | Meaning                     |
| ------- | ----------------------------- | --------------------------- |
| `grain` | `annual` \| `monthly`         | Temporal aggregation level. |
| `geo`   | `state` \| `county` \| `zip3` | Spatial aggregation level.  |

**Six numerator files total** (3 geographies × 2 grains). They are produced by
[`scripts/build_aggregates.py`](../scripts/build_aggregates.py), a DuckDB script
that reads the merged+geocoded claims CSV directly and emits all six NDJSON
files in ~10s. State is rebuilt from county sums (see
[Aggregation invariants](#aggregation-invariants)). Adding/renaming an output
requires updating [`DATA_PATHS`](../src/constants/map.ts) in the same PR.

**Plus three denominator files** for the per-enrollee rate metric:

```text
medicaid_enrollment_{state,county,zip3}.json
```

These hold ACS C27007 Medicaid enrollment by geography-year (endpoint years
2018–2024). Produced by
[`scripts/build_medicaid_enrollment.py`](../scripts/build_medicaid_enrollment.py),
which reads the two CSVs emitted by
[`scripts/fetch_acs_medicaid.py`](../scripts/fetch_acs_medicaid.py) and rolls
county → state (via FIPS→USPS, same map used by `build_aggregates.py`) and
ZCTA → ZIP3 (first 3 digits of ZCTA). Same NDJSON envelope as the numerator
files so both flow through the same `fetchNDJSON` parser.

## NDJSON envelope

Each file is **newline-delimited JSON**: one JSON object per line, no enclosing array. Each line is keyed by the region identifier and carries every record for that region:

```jsonc
{"MA": [{"year": "2023", "category": "Preventive", "total_claims": 12345, ...}, ...]}
{"NY": [...]}
{"CA": [...]}
```

Producer: [`scripts/build_aggregates.py`](../scripts/build_aggregates.py) — DuckDB `string_agg` over `json_object`, one line per region.

Consumer: [`fetchNDJSON`](../src/lib/dataService.ts) splits on `\n`, `JSON.parse`s each line, and merges into an in-memory `Record<regionId, Record[]>` cache.

**Why NDJSON, not JSON?** Gzips better than a wrapping array, and streamable if a future iteration moves to incremental load.

## Record schema

### Annual records (`annual_state`, `annual_zip3`)

```ts
interface DataRecord {
  year: string; // "2018" .. "2024"
  category: string; // see "Categories" below
  total_beneficiaries_served: number;
  total_claims: number;
  total_amount_paid: number; // USD, whole dollars
}
```

### Monthly records (`monthly_state`, `monthly_county`, `monthly_zip3`)

```ts
interface MonthlyDataRecord {
  year_month: string; // "YYYY-MM", e.g. "2023-06"
  category: string;
  total_beneficiaries_served: number;
  total_claims: number;
  total_amount_paid: number;
}
```

Types are mirrored in [`src/lib/types.ts`](../src/lib/types.ts). Changing the schema in SQL without updating the TS (and vice versa) will produce a silent runtime error, not a type error — grep for `DataRecord` before shipping schema changes.

### Denominator record schema (`medicaid_enrollment_*.json`)

```ts
interface EnrollmentRecord {
  year: string; // "2018" .. "2024" (ACS 5-year endpoint year)
  medicaid_enrollees: number; // ACS C27007 total Medicaid coverage, civilian noninstitutionalized
}
```

Same NDJSON envelope (`{"<id>": [<records>...]}`). Keys:

- `medicaid_enrollment_state.json` → USPS postal (e.g. `"MA"`), summed from county.
- `medicaid_enrollment_county.json` → 5-digit FIPS GEOID (e.g. `"25025"`).
- `medicaid_enrollment_zip3.json` → 3-digit string (e.g. `"021"`), summed from ZCTAs sharing the same first 3 digits.

The `year` is the ACS 5-year endpoint year, _not_ a single calendar year.
"2023" means the pooled 2019–2023 sample. See L22 in
[LIMITATIONS](LIMITATIONS.md).

## Field reference

| Field                        | Type     | Units                         | Source                                      | Notes                                                                         |
| ---------------------------- | -------- | ----------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `year`                       | `string` | —                             | Extracted from HHS `year_month`             | `"2018"`–`"2024"`.                                                            |
| `year_month`                 | `string` | —                             | HHS source column                           | ISO-8601 `YYYY-MM`. Missing months are absent, not zero.                      |
| `category`                   | `string` | —                             | Derived from HCPCS code in SQL view `006_…` | See categories table.                                                         |
| `total_beneficiaries_served` | `number` | unique Medicaid beneficiaries | `SUM(beneficiaries_served_count)`           | Not unique across rows — summing across categories may double-count patients. |
| `total_claims`               | `number` | individual claim lines        | `SUM(claims_count)`                         | The primary display field in the choropleth.                                  |
| `total_amount_paid`          | `number` | USD dollars                   | `SUM(total_amount_paid)`                    | Gross amount paid by Medicaid; not patient responsibility.                    |

`total_*` fields are non-negative integers; `total_amount_paid` is whole USD (not cents).

**Two color metrics (one derived).** The choropleth can encode either
`total_claims` (volume — a population/size map) or **claims per Medicaid
enrollee** (population penetration — a rate map). The rate is computed at
read time as `total_claims / medicaid_enrollees`, where the denominator is
the ACS C27007 enrollment record for the same (geography, endpoint-year)
loaded from the corresponding `medicaid_enrollment_*.json` file (see
[Denominator record schema](#denominator-record-schema-medicaid_enrollment_json)). For monthly views,
the rate reuses the endpoint-year denominator across all 12 months
(ACS is annual only).

The ACS denominator is category-independent — total Medicaid enrollees in
the geography — so the rate value at "All Categories" is `SUM(claims) /
enrollees` with no double-counting. A previous "claims per dental
beneficiary served" ratio (T-MSIS denominator) was removed: that denominator
was per-category and double-counted patients who used multiple categories,
structurally biasing the default "All Categories" rate low.

`total_beneficiaries_served` remains in the NDJSON for side-panel and future
use, but is **not** a map denominator and is not exposed in the per-region
StatCard grid.

### Aggregation invariants

- **Annual = SUM(monthly) across the same year.** If the totals disagree, the monthly file was rebuilt but the annual file wasn't.
- **State = SUM(county) within the same state.** State is built from county sums: the state USPS postal is derived from the county FIPS state prefix (`LEFT(county_fips, 2)`), so each state total equals the sum of its counties exactly, by construction. Verified at build time (0 mismatches).
- **State ≠ SUM(zip3).** The three levels do **not** share one row universe. County and state are keyed off the geocoded `county_fips`; zip3 is keyed off NPPES `practice_zip5`. The ~32k geocode-failure rows (L13/L32) have a ZIP but no county, so they appear in `zip3` but not in `county`/`state`. Concretely, `sum(zip3) − sum(state) ≈ 2.0M claims`. This is intentional ("max coverage per level") — see L33.
- **Records are one row per `(region × period × category)`.** Summing `total_claims` across categories within a region-period gives the "All Categories" total the UI shows when `activeLayer === "all"`.
- **`Uncategorized`** is retained (not dropped) for parity with the legacy views; it has no `CATEGORY_TO_KEY` entry so it contributes to the "all" total but to no specific category layer.

## Categories

The `category` field is derived from the HCPCS D-code range in [`scripts/build_aggregates.py`](../scripts/build_aggregates.py) (`CATEGORY_CASE`):

| Category (string in NDJSON)      | HCPCS range              | Example procedures                               |
| -------------------------------- | ------------------------ | ------------------------------------------------ |
| `Diagnostic`                     | D0100–D0999              | Exams, radiographs, evaluations                  |
| `Preventive`                     | D1000–D1999              | Cleanings, fluoride, sealants                    |
| `Restorative`                    | D2000–D2999              | Fillings, crowns, inlays                         |
| `Endodontics`                    | D3000–D3999              | Root canals, pulp therapy                        |
| `Periodontics`                   | D4000–D4999              | Gum disease treatment                            |
| `Prosthodontics (removable)`     | D5000–D5899              | Dentures, partials                               |
| `Maxillofacial Prosthetics`      | D5900–D5999              | Surgical obturators, implants for facial defects |
| `Implant Services`               | D6000–D6199              | Surgical implants                                |
| `Prosthodontics (fixed)`         | D6200–D6999              | Fixed bridges                                    |
| `Oral and Maxillofacial Surgery` | D7000–D7999              | Extractions, surgical procedures                 |
| `Orthodontics`                   | D8000–D8999              | Braces, retainers                                |
| `Adjunctive General Services`    | D9000–D9999              | Anesthesia, drug administration, palliative care |
| `Uncategorized`                  | non-D codes or malformed | Dropped by the UI.                               |

Frontend mapping from these category strings to `LayerKey` values is in [`CATEGORY_TO_KEY`](../src/constants/map.ts). Each of the 12 CDT/ADA divisions has its own selectable UI layer (plus the `all` aggregate, for 13 buttons total) — `Prosthodontics (removable)` and `Prosthodontics (fixed)` are split into separate layers, and `Maxillofacial Prosthetics` and `Implant Services` have their own buttons. `Uncategorized` (non-D HCPCS, e.g. cross-walked medical codes that slip through) is not in `CATEGORY_TO_KEY` and so contributes only to the `all` aggregate. Adding a new category is a two-place change: `CATEGORY_CASE` in [`scripts/build_aggregates.py`](../scripts/build_aggregates.py) and `CATEGORY_TO_KEY`.

## Suppression & null handling

- **HHS suppresses cells with <12 claims or <12 unique beneficiaries per provider-month.** Those rows are absent from the raw HHS release and therefore absent from every downstream aggregate. This is surfaced in the InfoModal on first visit.
- **Missing periods are absent, not zero.** A ZIP3 with no preventive claims in March 2022 has no `("2022-03", "Preventive")` record — the UI must treat missing as zero for summation but must _not_ plot a zero point on a time series.
- **Uncategorized rows are dropped at export**, not at ingest. A new HCPCS range appearing in a future HHS release will show up under `Uncategorized` until the `CASE` expression is extended.
- **`state = NULL` rows are dropped at export.** Providers whose NPI record has no practice state are omitted from the state-grain files; those records appear (when the ZIP5 is known) in the ZIP3-grain files.

## Identifier formats

- **State:** USPS two-letter postal code, uppercase. Matches the `postal` property on `states.pmtiles`. Derived from the county FIPS state prefix via the FIPS→USPS map in [`build_aggregates.py`](../scripts/build_aggregates.py) (50 states + DC + the 5 inhabited territories GU/MP/PR/VI/AS).
- **County:** five-digit county FIPS / GEOID string, zero-padded (`"01001"`, not `1001`). Source: geocoded `county_fips`. Matches the `GEOID` property on [`public/counties.geojson`](../public/counties.geojson) (regenerate with [`scripts/fetch_county_geometry.py`](../scripts/fetch_county_geometry.py)).
- **ZIP3:** three-digit string, zero-padded (`"021"`, not `21`). Derived by `LEFT(practice_zip5, 3)`. Matches the `3dig_zip` property on `zip3.pmtiles`.
- **Period:** year as `"YYYY"`; month as `"YYYY-MM"`. Always strings, never numbers — this is deliberate so downstream code can't accidentally do arithmetic on the values.

## Versioning

These files are **not versioned in the URL**. A browser cache is invalidated by the Vite build hash on the HTML document, which forces a re-fetch of all data URLs.

If the schema ever breaks backward compatibility (e.g., renaming a field, changing `total_amount_paid` to cents), bump the cache-buster by either:

1. Renaming the file (e.g., `..._annual_state_v2.json`) and updating [`DATA_PATHS`](../src/constants/map.ts) in the same PR, **or**
2. Re-deploying the site; the fresh HTML has a new bundle hash and a fresh `BASE_URL` hash key, which functions as a cache-bust for downstream consumers not hot-linking.

Option 1 is preferred for breaking schema changes because old consumers keep working until the consumer code updates.
