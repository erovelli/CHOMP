SELECT json_build_object(zip3, rows)
FROM (
  SELECT zip3, json_agg(
    json_build_object(
      'year',                       year,
      'category',                   category,
      'total_beneficiaries_served', total_beneficiaries_served,
      'total_claims',               total_claims,
      'total_amount_paid',          total_amount_paid
    ) ORDER BY year, category
  ) AS rows
  FROM medicaid.provider_procedure_category_aggregate_annual_zip3
  WHERE zip3 IS NOT NULL
  GROUP BY zip3
) subq;
