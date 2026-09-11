# Home accessibility follow-up - September 10, 2026

## Current-state evidence

This isolated worktree starts at production commit `45c0ce35` (PR #341). The previous release's responsive, interaction, production and static native checks remain valid evidence for that commit, but did not cover every rendered color or ARIA combination.

An axe-core 4.11.4 audit of the real synthetic parent/teacher/director/executive components at 390 and 1024px, in light and dark themes, found:

- Director light-mode as-of text: 2.03:1 contrast; View all link: 1.97:1. Executive as-of text: 2.40:1. These are ordinary-size text and require 4.5:1 under the chosen AA check.
- The parent child-status container and dashboard primary-action container carry accessible names on generic divs without a naming role.
- Mobile scope-label contrast needs manual completion because axe cannot parse an interpolated OKLCH color containing `none`. Browser-rendered RGB/compositing is used to verify these instead of disabling the rule.
- The full Notifications bottom-navigation label wraps with an orphaned final letter at 390px; the label remains hittable but is visually awkward.

The audit was local, synthetic-only, and recorded zero API requests. Evidence is retained in the shared repository under `output/playwright/parent-mobile-refinement-2026-09-10/home-accessibility-audit.json`.

## Scope

Use existing foreground/muted text tokens for dashboard text, retaining gold as a decorative accent. Give named containers a group role. Use a concise Alerts label for the existing director/executive notifications destination. Add repeatable rendered accessibility checks and focused source regressions. No identities, access grants, data, billing, recipients, provider settings, or native capabilities change.

## Verification boundary

Automatic checks do not certify complete accessibility or replace screen-reader/device testing. Any incomplete results require documented manual evidence. The available director/executive demo credentials are still rejected and no new authenticated Chrome session is present; their live dashboard checks remain an explicit human gate, not a reason to reset credentials.

## Repeatable checks and results

With the isolated development server on port 3210:

```text
npm run qa:home-accessibility -- --browser chromium
npm run qa:home-accessibility -- --browser webkit
node --import tsx scripts/qa-role-home-refinement.ts --browser chromium
node --import tsx scripts/qa-role-home-refinement.ts --browser webkit
npm run qa:ui-preview -- --route parent-home,parent-home-long-content,director,executive --full-matrix
node --import tsx --test tests/ui-home-accessibility.test.ts tests/ui-home-refinement.test.ts tests/parent-portal-dashboard-design.test.ts tests/ui-accessibility-regressions.test.ts tests/staff-application-copy.test.ts
```

- Rendered accessibility: 16 cases per engine (four roles, two widths, two themes), zero violations, zero unresolved incomplete findings, zero API requests. WebKit directly evaluates all colors. Chromium needs six supplemental checks for the OKLCH parser limitation: actual browser color conversion/compositing gives 18.56:1 and 6.41:1, both above 4.5:1. Original incomplete findings remain in the report; the rule is not disabled. The supplemental reader rejects unsupported paint effects and is calibrated against black/white, gray/white and the original failing gold.
- Interaction/200% text: nine cases per engine across teacher/director/executive at 390, 768 and 1024px; zero overflow, page errors or unsafe requests. Includes roster disclosure and selection, inert attendance feedback, deep-link clearance, dashboard priorities, scoped FTE links and empty states.
- Responsive matrix: 28 cases across seven viewports (360-1440px), zero clipping, unnamed or undersized controls, heading jumps, escaping links, console errors or unsafe requests.
- Focused regressions: 44 passed. The older copy regression now requires the exact concise Alerts label and unchanged notifications route/permission key for both roles. Static parent/teacher mobile store checks passed. No native project settings changed and no signed/device evidence is implied.

One WebKit run exposed a screenshot-induced hydration mismatch: Playwright's default caret hiding inserted `style="caret-color: transparent"` on inputs before React finished hydrating them. Captures now use `caret: "initial"`; request/error assertions remain strict. The subsequent Chromium and WebKit interaction runs pass. No production UI suppression or hydration workaround was added.

Evidence: shared repository `output/playwright/home-accessibility-followup-20260910/`, with final accessibility results in `final/`, final interactions in `interactions-final/`, and responsive results in `responsive/`. The full production gate, protected PR, exact deployment and live verification are recorded separately in the release evidence; these local results are not a claim of live director/executive verification.

Rollback: revert the scoped commit through the protected release workflow. No migration, identity repair or preference reset is needed.
