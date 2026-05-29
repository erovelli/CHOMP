<!--
Thanks for the PR. Please fill every section — write "N/A" if a section does
not apply. Reviewers read top-to-bottom and skip PRs that hide the context.
-->

## Summary

<!-- One or two sentences describing what changes and why. -->

## Motivation

<!--
What prompted this change? Link the issue it closes, the ADR it implements, or
the upstream report it responds to. Without an issue, explain the trigger
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

## Alternatives considered and not picked

<!--
The single most useful section for a reviewer. Name the alternative approach,
state why it wasn't taken. If there was no real fork in the road, write
"nothing non-obvious".
-->

## Screenshots / recordings

<!-- Required for any UI change. Before/after is ideal. -->

| Before | After |
| ------ | ----- |
|        |       |

## Data-pipeline checklist

<!-- Only required for PRs that touch scripts/ or public/data/. Delete otherwise. -->

- [ ] `CATEGORY_CASE` in `scripts/build_aggregates.py` updated for any new/renamed category
- [ ] `CATEGORY_TO_KEY` + `LAYER_CONFIGS` + `LAYER_ORDER` in `src/constants/map.ts` kept in sync
- [ ] `DATA_PATHS` in `src/constants/map.ts` updated to match any new export filename
- [ ] Re-ran `python scripts/build_aggregates.py` and verified the 6 output sizes are within budget (no file > 100 MB)

## Pre-merge checklist

- [ ] `npm run build` passes locally
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Happy path clicked through in a browser (state → ZIP3 → year → month → category → close panel)
- [ ] No `console.log` debug statements in shipped code
- [ ] No unused imports, types, or dead files
- [ ] README, ARCHITECTURE, or an ADR updated if load-bearing behavior changed
- [ ] Accessibility: interactive controls reachable by keyboard; contrast meets WCAG AA
- [ ] [CONTRIBUTING.md](../CONTRIBUTING.md) has been read

## Reviewer notes

<!--
Optional. Highlight any area deserving particular scrutiny, or known
follow-ups deferred to a separate PR.
-->
