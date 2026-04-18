<!--
Thank you for the PR. Please fill every section — write "N/A" if a section does
not apply. Reviewers read top-to-bottom and skip PRs that hide their context.
-->

## Summary

<!-- One or two sentences describing what changes and why. -->

## Motivation

<!--
What prompted this change? Link the issue it closes, the ADR it implements, or
the upstream report it responds to. If there's no issue, explain the trigger
here. "Closes #123" on its own line will auto-close the issue on merge.
-->

Closes #

## Type of change

<!-- Check all that apply. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (behavior or API shape changes in a way a consumer would notice)
- [ ] Data-pipeline change (SQL migration, view, or export)
- [ ] Docs / chore / refactor (no runtime behavior change)
- [ ] CI / tooling

## What changed

<!-- Bullet the concrete changes. Skip the line-by-line — that's in the diff. -->

-
-

## What I considered and didn't pick

<!--
The single most useful section for a reviewer. Name the alternative approach,
say why you didn't take it. If there was no real fork in the road, write
"nothing non-obvious".
-->

## Screenshots / recordings

<!-- Required for any UI change. Before/after is ideal. -->

| Before | After |
| ------ | ----- |
|        |       |

## Data-pipeline checklist

<!-- Only required for PRs that touch migrations/, scripts/, or public/data/. Delete otherwise. -->

- [ ] New migration file added under `migrations/` (never edited an existing file)
- [ ] Matching aggregate view added under `migrations/aggregate_views/` (if applicable)
- [ ] `scripts/export_views.sh` updated to export any new view
- [ ] `DATA_PATHS` in `src/constants/map.ts` updated to match new export filename
- [ ] Re-exported `public/data/*.json` and verified sizes are within budget

## Pre-merge checklist

- [ ] `npm run build` passes locally
- [ ] `npx tsc --noEmit` reports no errors
- [ ] I clicked through the happy path in a browser (state → ZIP3 → year → month → category → close panel)
- [ ] No `console.log` debug statements in shipped code
- [ ] No unused imports, types, or dead files
- [ ] README, ARCHITECTURE, or an ADR updated if load-bearing behavior changed
- [ ] Accessibility: interactive controls reachable by keyboard; contrast meets WCAG AA
- [ ] I've read [CONTRIBUTING.md](../CONTRIBUTING.md)

## Reviewer notes

<!--
Optional. Highlight any area you'd like particular scrutiny on, or known
follow-ups you're deferring to a separate PR.
-->
