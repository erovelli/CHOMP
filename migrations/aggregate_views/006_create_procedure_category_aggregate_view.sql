-- aggregate combined table by zip5, billing code, and year_month
-- cast hcpcs_code to category based on below range
-- Category | Code Range

-- Diagnostic | D0100–D0999
-- Preventive | D1000–D1999
-- Restorative | D2000–D2999
-- Endodontics | D3000–D3999
-- Periodontics | D4000–D4999
-- Prosthodontics (removable) | D5000–D5899
-- Maxillofacial Prosthetics | D5900–D5999
-- Implant Services | D6000–D6199
-- Prosthodontics (fixed) | D6200–D6999
-- Oral and Maxillofacial Surgery | D7000–D7999
-- Orthodontics | D8000–D8999
-- Adjunctive General Services | D9000–D9999
CREATE OR REPLACE VIEW medicaid.provider_procedure_category_aggregate AS
WITH cleaned AS (
    SELECT
        LEFT(NULLIF(TRIM(zip_code_5), ''), 5) AS zip5,
        state,
        year_month,
        beneficiaries_served_count,
        claims_count,
        total_amount_paid,

        -- Extract numeric portion safely (handles codes like D1234)
        CASE
            WHEN hcpcs_code ~ '^D[0-9]{4}$'
            THEN SUBSTRING(hcpcs_code FROM 2 FOR 4)::int
            ELSE NULL
        END AS hcpcs_numeric
    FROM medicaid.provider_procedure_monthly_geo
),
categorized AS (
    SELECT
        zip5,
        state,
        year_month,
        beneficiaries_served_count,
        claims_count,
        total_amount_paid,

        CASE
            WHEN hcpcs_numeric BETWEEN 100 AND 999   THEN 'Diagnostic'
            WHEN hcpcs_numeric BETWEEN 1000 AND 1999 THEN 'Preventive'
            WHEN hcpcs_numeric BETWEEN 2000 AND 2999 THEN 'Restorative'
            WHEN hcpcs_numeric BETWEEN 3000 AND 3999 THEN 'Endodontics'
            WHEN hcpcs_numeric BETWEEN 4000 AND 4999 THEN 'Periodontics'
            WHEN hcpcs_numeric BETWEEN 5000 AND 5899 THEN 'Prosthodontics (removable)'
            WHEN hcpcs_numeric BETWEEN 5900 AND 5999 THEN 'Maxillofacial Prosthetics'
            WHEN hcpcs_numeric BETWEEN 6000 AND 6199 THEN 'Implant Services'
            WHEN hcpcs_numeric BETWEEN 6200 AND 6999 THEN 'Prosthodontics (fixed)'
            WHEN hcpcs_numeric BETWEEN 7000 AND 7999 THEN 'Oral and Maxillofacial Surgery'
            WHEN hcpcs_numeric BETWEEN 8000 AND 8999 THEN 'Orthodontics'
            WHEN hcpcs_numeric BETWEEN 9000 AND 9999 THEN 'Adjunctive General Services'
            ELSE 'Uncategorized'
        END AS category
    FROM cleaned
)

SELECT
    zip5,
    state,
    year_month,
    category,
    SUM(beneficiaries_served_count) AS total_beneficiaries_served,
    SUM(claims_count) AS total_claims,
    SUM(total_amount_paid) AS total_amount_paid
FROM categorized
GROUP BY
    zip5,
    state,
    year_month,
    category
ORDER BY
    zip5,
    state,
    year_month,
    category;