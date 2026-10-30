# Manuscript companion

If you came here from the paper, every number it reports traces to a file in this repository. The tables below give the path for each one and the script that writes it.

## Where things are

| What                                                                       | Path                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregated data (annual and monthly; state, county, ZIP3; by CDT category) | [`public/data/provider_procedure_category_aggregate_*.json`](../../public/data/)                                                                                                   |
| Field definitions, units, suppression rules                                | [`docs/DATA_DICTIONARY.md`](../DATA_DICTIONARY.md)                                                                                                                                 |
| Validation outputs                                                         | [`docs/validation/`](../validation/)                                                                                                                                               |
| Figure 2 (NHE comparison), PDF and PNG                                     | [`docs/validation/fig_nhe_benchmark.pdf`](../validation/fig_nhe_benchmark.pdf)                                                                                                     |
| Processing pipeline                                                        | [`scripts/merge_hhs_nppes.py`](../../scripts/merge_hhs_nppes.py), [`join_geocoded.py`](../../scripts/join_geocoded.py), [`build_aggregates.py`](../../scripts/build_aggregates.py) |
| Full limitations ledger                                                    | [`docs/LIMITATIONS.md`](../LIMITATIONS.md)                                                                                                                                         |
| Interactive map                                                            | <https://chomp.share.library.harvard.edu/>                                                                                                                                         |

The aggregated files are newline-delimited JSON, one line per region. Each record carries `total_claims`, `total_beneficiaries_served`, and `total_amount_paid` for one period and CDT category.

## Numbers in the paper

| Section        | Reported value                                                                                              | Source file                                                                                                                                    | Written by                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Linked dataset | 227,083,361 release records; 24,068,574 dental; 23,172,883 linked; 23,140,395 state/county; 23,171,904 ZIP3 | [`docs/LIMITATIONS.md`](../LIMITATIONS.md#data-loss-summary-hhs-source--mapped-dataset) (data-loss table)                                      | `merge_hhs_nppes.py`, `join_geocoded.py`, `build_aggregates.py`; re-derived by `validate_reproducibility.py` |
| Linked dataset | Uncategorized codes < 0.01% of claims and payments                                                          | reproducibility report (check E)                                                                                                               | `validate_reproducibility.py`                                                                                |
| Validation     | Linkage 96.3% records / 96.0% claims / 95.5% payments; by year 94.3% to 99.1%                               | [`linkage_quality.json`](../validation/linkage_quality.json) `nppes_linkage`                                                                   | `validate_linkage.py`                                                                                        |
| Validation     | Unlinked records by cause (685,886 / 207,059 / 2,746)                                                       | `linkage_quality.json` `nppes_linkage.unmatched_by_cause`                                                                                      | `validate_linkage.py`                                                                                        |
| Validation     | Geocoding match status (69,384 M / 490 T / 86 U of 69,960)                                                  | `linkage_quality.json` `geocoding`                                                                                                             | `validate_linkage.py`                                                                                        |
| Validation     | State agreement 99.98% of 1.23 billion claims                                                               | `linkage_quality.json` `state_consistency`                                                                                                     | `validate_linkage.py`                                                                                        |
| Validation     | $44.2B release, $41.8B mapped, $100.6B NHE; 44.0% and 41.6%; 95.4% retained                                 | [`nhe_benchmark.csv`](../validation/nhe_benchmark.csv) (`release_dental`, `chomp_50dc`, `medicaid_chip`, in $ millions)                        | `validate_nhe.py`                                                                                            |
| Validation     | NHE source table (pinned by SHA-256)                                                                        | [`nhe_dental_2018_2024.csv`](../validation/nhe_dental_2018_2024.csv)                                                                           | `validate_nhe.py`                                                                                            |
| Validation     | Nov and Dec 2024 claims 21.5% and 61.5% below the Jan to Oct mean (2023: 6.6% and 21.4%)                    | [`..._monthly_state.json`](../../public/data/provider_procedure_category_aggregate_monthly_state.json) (sum of `total_claims` by `year_month`) | `build_aggregates.py`                                                                                        |
| Figure 2       | Annual release, mapped, and NHE totals                                                                      | [`fig_nhe_benchmark.pdf`](../validation/fig_nhe_benchmark.pdf)                                                                                 | `plot_nhe.py`                                                                                                |

Pooled percentages divide the summed columns of `nhe_benchmark.csv` (for example, 44,219.6 / 100,594 = 44.0%). The late-2024 completeness figures sum `total_claims` across all states and categories for each month of the monthly state file, then compare November and December with the January to October mean.

## Reproducing the validation

Figure 2 can be redrawn from a fresh clone with no raw data:

```bash
pip install -r requirements.txt
```

```bash
python scripts/plot_nhe.py
```

The rest need the raw inputs in a local `data/` directory (about 60 GB, gitignored). Download them as described under [Rebuild the dataset](../../README.md#rebuild-the-dataset), then:

```bash
python scripts/validate_linkage.py --data-dir data
```

```bash
python scripts/validate_nhe.py --data-dir data
```

```bash
python scripts/validate_reproducibility.py --data-dir data
```

`validate_reproducibility.py` re-implements each pipeline step without importing the pipeline code and checks that the shipped files in `public/data/` match exactly.

## Source data

| Source                                   | Version used                                             | Notes                                                                               |
| ---------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| HHS Medicaid Provider Spending by HCPCS  | Release of February 8, 2026; services 2018-01 to 2024-12 | Records with fewer than 12 claims suppressed by HHS before release                  |
| NPPES monthly snapshots (NBER archive)   | 84 snapshots, January 2018 to December 2024              | Linked by servicing NPI and month of service                                        |
| Esri ArcGIS geocoder                     | See paper, Technical Approach                            | Licensed software; the hand-off is described in the README                          |
| CMS National Health Expenditure Accounts | CY 1960-2024 release (2024 comprehensive revision)       | URL and SHA-256 recorded in the header of `nhe_dental_2018_2024.csv`                |
| ADA Current Dental Terminology           | CDT category ranges                                      | Category boundaries are in [`DATA_DICTIONARY.md`](../DATA_DICTIONARY.md#categories) |
