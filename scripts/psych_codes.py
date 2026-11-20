"""Psychiatric code set, service categories, and setting-of-care rules.

Single source of truth for which HCPCS/CPT codes count as psychiatric care in
this project, which service category each one belongs to, and how a claim row
is assigned a setting of care. Imported by merge_hhs_nppes.py (prefilter) and
build_aggregates.py (classification). The category and setting strings here
must stay in sync with CATEGORY_TO_KEY / SETTING_TO_KEY in src/constants/map.ts.

Inclusion rule
--------------
A row is psychiatric if and only if its HCPCS/CPT code is in PSYCH_CODES.
Inclusion never depends on who billed it: general evaluation-and-management
codes (99202-99215, 99221-99239, ...) are excluded even when a psychiatrist
bills them, because the code itself is not psychiatric. Codes that exist only
for substance-use treatment (H0001, H0005-H0016, H0020-H0022, H0026-H0029,
H0033, H0047-H0050, H2034-H2036) are also excluded; see SUD_ONLY_CODES.

Setting of care
---------------
The HHS release carries no place-of-service code, bill type, or revenue code,
so setting has to be inferred. Two signals carry it, applied in this order:

1. Setting-defined codes. A handful of HCPCS Level II codes are per-diem or
   program codes that only exist in one setting (H0035 = partial
   hospitalization, H0019 = long-term residential, ...). CODE_SETTING.
2. Facility taxonomy of the billing (or servicing) NPI. Facilities usually
   bill under their own NPI, and NPPES records what kind of facility it is
   (283Q00000X psychiatric hospital, 323P00000X PRTF, ...). TAXONOMY_SETTING.
3. Office and community taxonomy. Individual clinicians, group practices and
   community mental health centers bill outpatient work. OUTPATIENT_TAXONOMY_PREFIXES.

A row matched by none of these is "Setting not identified". The common
psychotherapy and evaluation CPT codes are setting-neutral, so this bucket is
expected to be large for rows billed by general acute hospitals and
multi-setting health systems. See docs/LIMITATIONS.md.
"""

from __future__ import annotations

# ── Service categories ─────────────────────────────────────────────────────────

DIAGNOSTIC = "Diagnostic evaluation"
TESTING = "Testing and screening"
PSYCHOTHERAPY = "Psychotherapy"
CRISIS = "Crisis services"
MEDICATION = "Medication services"
NEUROMODULATION = "Neuromodulation"
COMMUNITY = "Community support and rehabilitation"
COLLAB = "Collaborative care"
PROGRAM = "Program and facility per diem"

CATEGORY_ORDER = [
    DIAGNOSTIC,
    TESTING,
    PSYCHOTHERAPY,
    CRISIS,
    MEDICATION,
    NEUROMODULATION,
    COMMUNITY,
    COLLAB,
    PROGRAM,
]


def _range(prefix: str, lo: int, hi: int, width: int = 4) -> list[str]:
    return [f"{prefix}{n:0{width}d}" for n in range(lo, hi + 1)]


CODE_CATEGORY: dict[str, str] = {}


def _add(category: str, codes: list[str]) -> None:
    for c in codes:
        if c in CODE_CATEGORY:
            raise ValueError(f"{c} assigned twice ({CODE_CATEGORY[c]} / {category})")
        CODE_CATEGORY[c] = category


# Psychiatric diagnostic evaluation, interpretation, and assessment.
_add(DIAGNOSTIC, [
    "90791", "90792",           # psychiatric diagnostic evaluation (w/o, w/ medical services)
    "90885",                    # psychiatric evaluation of records
    "90887",                    # interpretation of results to family
    "90889",                    # preparation of report
    "H0002",                    # behavioral health screening for admission to treatment program
    "H0031",                    # mental health assessment, by non-physician
    "H0032",                    # mental health service plan development, by non-physician
    "H2000",                    # comprehensive multidisciplinary evaluation
])

# Psychological / neuropsychological testing and brief standardized screening.
_add(TESTING, [
    "96127",                                    # brief emotional/behavioral assessment
    "96130", "96131", "96132", "96133",         # psych / neuropsych evaluation services (2019+)
    "96136", "96137", "96138", "96139",         # test administration and scoring (2019+)
    "96146",                                    # automated test administration (2019+)
    "96101", "96102", "96103",                  # psychological testing (deleted 2019; 2018 data)
    "96118", "96119", "96120",                  # neuropsychological testing (deleted 2019)
])

# Psychotherapy, including add-on codes billed with psychiatric E/M visits.
_add(PSYCHOTHERAPY, [
    "90785",                                    # interactive complexity add-on
    "90832", "90834", "90837",                  # psychotherapy 30/45/60 min
    "90833", "90836", "90838",                  # psychotherapy add-on with E/M
    "90845",                                    # psychoanalysis
    "90846", "90847",                           # family psychotherapy
    "90849",                                    # multiple-family group
    "90853",                                    # group psychotherapy
    "90880",                                    # hypnotherapy
    "H0004",                                    # behavioral health counseling and therapy
    "G0410", "G0411",                           # group psychotherapy in partial hospitalization
])

# Crisis.
_add(CRISIS, [
    "90839", "90840",           # psychotherapy for crisis, first 60 min / add-on
    "H0030",                    # behavioral health hotline service
    "H2011",                    # crisis intervention service, per 15 min
    "S9484", "S9485",           # crisis intervention mental health services, per hour / per diem
])

# Medication services. Psychiatric E/M visits (99202-99215) are NOT here: the
# codes are not psychiatric and fall outside the inclusion rule.
_add(MEDICATION, [
    "90863",                    # pharmacologic management by non-prescribing clinician
    "H0034",                    # medication training and support
    "H2010",                    # comprehensive medication services
])

_add(NEUROMODULATION, [
    "90867", "90868", "90869",  # transcranial magnetic stimulation
    "90870",                    # electroconvulsive therapy
])

# Community-based rehabilitation and support (Medicaid rehab-option services).
_add(COMMUNITY, [
    "H0023",                    # behavioral health outreach service
    "H0036", "H0037",           # community psychiatric supportive treatment
    "H0038",                    # self-help / peer services
    "H0039", "H0040",           # assertive community treatment
    "H0043", "H0044",           # supported housing
    "H0046",                    # mental health services, not otherwise specified
    "H2014",                    # skills training and development
    "H2015", "H2016",           # comprehensive community support services
    "H2017", "H2018",           # psychosocial rehabilitation services
    "H2019", "H2020",           # therapeutic behavioral services
    "H2021", "H2022",           # community-based wraparound services
    "H2023", "H2024",           # supported employment
    "H2025", "H2026",           # ongoing support to maintain employment
    "H2027",                    # psychoeducational service
    "H2030", "H2031",           # mental health clubhouse services
    "H2032",                    # activity therapy
    "H2033",                    # multisystemic therapy for juveniles
])

_add(COLLAB, [
    "99492", "99493", "99494",  # psychiatric collaborative care management
    "99484",                    # general behavioral health integration care management
    "G0502", "G0503", "G0504",  # psychiatric collaborative care (Medicare HCPCS, pre-2018 carryover)
    "G0507",                    # behavioral health integration (pre-2018 carryover)
    "G2214",                    # psychiatric collaborative care, initial or subsequent 30 min
])

# Program and facility per-diem codes. These define the setting as well as the
# service, so they also appear in CODE_SETTING below.
_add(PROGRAM, [
    "H0035",                    # mental health partial hospitalization, under 24 hours
    "S0201",                    # partial hospitalization services, under 24 hours, per diem
    "G0129",                    # occupational therapy in partial hospitalization
    "G0176", "G0177",           # activity therapy / patient training in partial hospitalization
    "S9480",                    # intensive outpatient psychiatric services, per diem
    "H2012",                    # behavioral health day treatment, per hour
    "H2013",                    # psychiatric health facility service, per diem
    "H0017",                    # behavioral health residential (hospital residential treatment program)
    "H0018",                    # behavioral health short-term residential (non-hospital)
    "H0019",                    # behavioral health long-term residential (non-hospital)
    "T2048",                    # behavioral health long-term care residential, with room and board
])

PSYCH_CODES: frozenset[str] = frozenset(CODE_CATEGORY)

# Documented exclusions, kept here so a reviewer can see what was left out on
# purpose. Not used for classification.
SUD_ONLY_CODES: frozenset[str] = frozenset(
    ["H0001", "H0003"]
    + _range("H", 5, 16)
    + _range("H", 20, 22)
    + _range("H", 26, 29)
    + ["H0033"]
    + _range("H", 47, 50)
    + _range("H", 2034, 2036)
)
assert not (SUD_ONLY_CODES & PSYCH_CODES)

# ── Setting of care ────────────────────────────────────────────────────────────

INPATIENT = "Inpatient"
RESIDENTIAL = "Residential"
PARTIAL = "Partial hospitalization / IOP"
OUTPATIENT = "Outpatient and community"
UNIDENTIFIED = "Setting not identified"

SETTING_ORDER = [INPATIENT, RESIDENTIAL, PARTIAL, OUTPATIENT, UNIDENTIFIED]

# Tier 1: codes whose definition fixes the setting.
CODE_SETTING: dict[str, str] = {
    "H2013": INPATIENT,
    "H0017": RESIDENTIAL,
    "H0018": RESIDENTIAL,
    "H0019": RESIDENTIAL,
    "T2048": RESIDENTIAL,
    "H0035": PARTIAL,
    "S0201": PARTIAL,
    "G0129": PARTIAL,
    "G0176": PARTIAL,
    "G0177": PARTIAL,
    "G0410": PARTIAL,
    "G0411": PARTIAL,
    "S9480": PARTIAL,
    "H2012": PARTIAL,
    # Community services that by definition happen outside a facility.
    "H0039": OUTPATIENT,
    "H0040": OUTPATIENT,
    "H2021": OUTPATIENT,
    "H2022": OUTPATIENT,
    "H2033": OUTPATIENT,
}
assert set(CODE_SETTING) <= PSYCH_CODES

# Tier 2: facility taxonomies (exact NUCC codes). Checked on the billing NPI
# first, then the servicing NPI.
TAXONOMY_SETTING: dict[str, str] = {
    "283Q00000X": INPATIENT,     # psychiatric hospital
    "273R00000X": INPATIENT,     # psychiatric unit
    "323P00000X": RESIDENTIAL,   # psychiatric residential treatment facility
    "322D00000X": RESIDENTIAL,   # residential treatment facility, emotionally disturbed children
    "320800000X": RESIDENTIAL,   # community-based residential treatment facility, mental illness
}

# Tier 3: office and community taxonomies (prefix match). Individual
# behavioral-health clinicians, physician/NP practices, community mental health
# centers, and behavioral health agencies. General acute hospitals (282N...)
# and multi-specialty clinics are deliberately absent: they bill across
# settings, so their rows stay "Setting not identified".
OUTPATIENT_TAXONOMY_PREFIXES: tuple[str, ...] = (
    "2084",         # psychiatry & neurology physicians
    "363LP0808X",   # psychiatric/mental health nurse practitioner
    "364SP08",      # psychiatric/mental health clinical nurse specialist
    "103",          # behavioral health & social service providers (psychologists, ...)
    "104",          # social workers
    "101Y",         # counselors
    "106",          # behavioral health providers (MFT, behavior analysts, ...)
    "261QM0801X",   # clinic: mental health (incl. community mental health center)
    "261QM0850X",   # clinic: adult mental health
    "261QM0855X",   # clinic: adolescent and children mental health
    "251S00000X",   # agency: community/behavioral health
    "193",          # single- and multi-specialty groups
    "207Q", "208D", # family medicine, general practice (collaborative care billers)
    "207R",         # internal medicine
    "208000000X",   # pediatrics
    "363L",         # other nurse practitioners
)


def _norm(tax: str | None) -> str:
    return (tax or "").strip().upper()


def assign_setting(code: str, billing_taxonomy: str | None, servicing_taxonomy: str | None) -> str:
    """Python reference implementation of the setting rule (tests, diagnostics).

    build_aggregates.py runs the same rule as SQL via setting_case_sql().
    """
    if code in CODE_SETTING:
        return CODE_SETTING[code]
    for tax in (_norm(billing_taxonomy), _norm(servicing_taxonomy)):
        if tax in TAXONOMY_SETTING:
            return TAXONOMY_SETTING[tax]
    for tax in (_norm(billing_taxonomy), _norm(servicing_taxonomy)):
        if tax and tax.startswith(OUTPATIENT_TAXONOMY_PREFIXES):
            return OUTPATIENT
    return UNIDENTIFIED


# ── SQL builders (DuckDB) ──────────────────────────────────────────────────────

def _sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def category_case_sql(code_col: str = "hcpcs_code") -> str:
    by_cat: dict[str, list[str]] = {}
    for code, cat in CODE_CATEGORY.items():
        by_cat.setdefault(cat, []).append(code)
    whens = "\n".join(
        f"        WHEN {code_col} IN ({', '.join(_sql_str(c) for c in sorted(codes))}) THEN {_sql_str(cat)}"
        for cat, codes in by_cat.items()
    )
    return f"CASE\n{whens}\n        ELSE NULL\n    END"


def setting_case_sql(
    code_col: str = "hcpcs_code",
    billing_tax_col: str = "billing_tax",
    servicing_tax_col: str = "servicing_tax",
) -> str:
    lines: list[str] = []
    by_setting: dict[str, list[str]] = {}
    for code, setting in CODE_SETTING.items():
        by_setting.setdefault(setting, []).append(code)
    for setting, codes in by_setting.items():
        lines.append(
            f"WHEN {code_col} IN ({', '.join(_sql_str(c) for c in sorted(codes))}) "
            f"THEN {_sql_str(setting)}"
        )
    for col in (billing_tax_col, servicing_tax_col):
        for tax, setting in TAXONOMY_SETTING.items():
            lines.append(f"WHEN {col} = {_sql_str(tax)} THEN {_sql_str(setting)}")
    for col in (billing_tax_col, servicing_tax_col):
        prefixes = " OR ".join(f"starts_with({col}, {_sql_str(p)})" for p in OUTPATIENT_TAXONOMY_PREFIXES)
        lines.append(f"WHEN {prefixes} THEN {_sql_str(OUTPATIENT)}")
    body = "\n        ".join(lines)
    return f"CASE\n        {body}\n        ELSE {_sql_str(UNIDENTIFIED)}\n    END"
