SELECT json_build_object(zip3, rows)
FROM (
  SELECT zip3, json_agg(
    json_build_object(
      'year_month',                 year_month,
      'category',                   category,
      'total_beneficiaries_served', total_beneficiaries_served,
      'total_claims',               total_claims,
      'total_amount_paid',          total_amount_paid
    ) ORDER BY year_month, category
  ) AS rows
  FROM medicaid.provider_procedure_category_aggregate_monthly_zip3
  WHERE zip3 IS NOT NULL
  GROUP BY zip3
) subq;
