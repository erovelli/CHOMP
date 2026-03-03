# Export Aggregate Views to JSON

Set `DATABASE_URL` before running:

```sh
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
```

Run the script from the repo root. Output defaults to `exports/`:

```sh
bash scripts/export_views.sh [output_dir]
```

Each output file is structured as `{ "<geo_key>": [ ...rows ] }`.

---

## SQL files (`scripts/sql/`)

| File | View | Key | Order |
|------|------|-----|-------|
| `007_export_monthly_state.sql` | `provider_procedure_category_aggregate_monthly_state` | `state` | `year_month, category` |
| `008_export_annual_state.sql` | `provider_procedure_category_aggregate_annual_state` | `state` | `year, category` |
| `009_export_monthly_zip3.sql` | `provider_procedure_category_aggregate_monthly_zip3` | `zip3` | `year_month, category` |
| `010_export_annual_zip3.sql` | `provider_procedure_category_aggregate_annual_zip3` | `zip3` | `year, category` |
