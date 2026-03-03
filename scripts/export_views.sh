#!/usr/bin/env bash
# Export aggregate views to JSON files.
# Each file is structured as { "<geo_key>": [ ...rows ordered by year_month or year ] }
#
# Requires DATABASE_URL to be set, e.g.:
#   export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"


set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/sql"
OUT_DIR="${1:-exports}"
mkdir -p "$OUT_DIR"

psql_json() {
  local sqlfile="$1"
  local outfile="$2"
  psql "$DATABASE_URL" -t -A -f "$sqlfile" > "$outfile"
  echo "Exported: $outfile"
}

# 007 — provider_procedure_category_aggregate_monthly_state (key: state, order: year_month)
psql_json "$SQL_DIR/007_export_monthly_state.sql" \
          "$OUT_DIR/provider_procedure_category_aggregate_monthly_state.json"

# 008 — provider_procedure_category_aggregate_annual_state (key: state, order: year)
psql_json "$SQL_DIR/008_export_annual_state.sql" \
          "$OUT_DIR/provider_procedure_category_aggregate_annual_state.json"

# 009 — provider_procedure_category_aggregate_monthly_zip3 (key: zip3, order: year_month)
psql_json "$SQL_DIR/009_export_monthly_zip3.sql" \
          "$OUT_DIR/provider_procedure_category_aggregate_monthly_zip3.json"

# 010 — provider_procedure_category_aggregate_annual_zip3 (key: zip3, order: year)
psql_json "$SQL_DIR/010_export_annual_zip3.sql" \
          "$OUT_DIR/provider_procedure_category_aggregate_annual_zip3.json"
