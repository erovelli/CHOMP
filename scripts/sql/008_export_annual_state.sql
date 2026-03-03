SELECT json_build_object(state, rows)
FROM (
  SELECT state, json_agg(
    json_build_object(
      'year',                       year,
      'category',                   category,
      'total_beneficiaries_served', total_beneficiaries_served,
      'total_claims',               total_claims,
      'total_amount_paid',          total_amount_paid
    ) ORDER BY year, category
  ) AS rows
  FROM medicaid.provider_procedure_category_aggregate_annual_state
  WHERE state IS NOT NULL
  GROUP BY state
) subq;
