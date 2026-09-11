# Home-screen refinement — September 10, 2026

## Scope and baseline

Prepared in `work/parent-mobile-refinement-20260910` from `origin/main` at `b7a2cda6`.
Before release, the branch was reconciled with `300971d6` (the independently merged Stripe customer replacement fix); no UI files overlapped.
The shared checkout was dirty and behind; its dashboard/payroll work and other worktrees were preserved.
Before screenshots were captured with synthetic data before editing. This release changes presentation and preview safety only: no schema, identity, school access, billing ledger, messaging recipients, provider settings, or native entitlements change.

## User-visible changes

- Parent home: one compact attendance row per child, all siblings visible, readable long names, clearly disclosed day details, and four primary actions above the bottom navigation at normal phone text sizes. Current balance and quiet school states are concise. Attendance, review-blocked balances, and family-scoped document navigation remain authoritative.
- Parent accessibility: reflow at 200% text, darker brand text, opaque fixed navigation, and stable icon hit areas. Action tiles become a single column when enlarged text needs it.
- Teacher home: classroom counts and daily tasks precede profile/checklist setup. Shortcuts are real links and wrap without sideways scrolling. Tablet roster controls have 44px targets, selected rows expose their state, and attendance actions have child-specific labels. Empty rosters explain the director assignment dependency. Offline and queued-action warnings remain prominent.
- Teacher navigation: phone shortcuts do not occupy the screen while scrolling forms or cover the app header. Tablet shortcuts use the measured app-header height; anchored cards and the nested quick-log target clear the header and sticky tools.
- Director/executive dashboard: priorities use the existing scoped destination resolver, expose total count and View all, and show a calm empty state. Compact KPI cards preserve saved order. FTE follow-up rows are full touch/keyboard links, preserve school/week parameters, and do not turn unreported FTE into zero.

## Repeatable local evidence

Use the development server on port 3210. `/device-preview` remains development-only and must return 404 in production.

```powershell
node --import tsx scripts/qa-device-preview.ts --route teacher,director,executive,parent-home-single-review,parent-home-quiet,parent-home-long-content --viewport phone-360,phone-390,phone-430,tablet-portrait-768,tablet-landscape-1024,desktop-1440
node --import tsx scripts/qa-parent-home.ts --browser chromium
node --import tsx scripts/qa-parent-home.ts --browser webkit
node --import tsx scripts/qa-role-home-refinement.ts --browser chromium
node --import tsx scripts/qa-role-home-refinement.ts --browser webkit
node --import tsx --test tests/ui-home-refinement.test.ts
npm run mobile:store:check
npm run vercel-build
```

At preparation: 36 responsive cases passed. Parent interaction scenarios passed at 360/390/430px in both engines; teacher/director/executive interactions passed at 390/768/1024px in both engines. The focused suite passed 68 tests. No preview API calls or mutations were permitted. Lint, typecheck, and both native repository checks passed.

The final focused rerun passed 51 UI/copy/accessibility tests. Existing source assertions were scoped to the actual Updates section and shared dashboard component: complete daily reports must remain visible without expansion, while the separate Home attendance details can be disclosed.

Eight refreshed RGB screenshot drafts were captured at 1290 x 2796 using fake data. Teacher roster and quick-log captures open their actual disclosures and check that scrolled content cannot obscure the app header. These are browser drafts, not native App Store evidence.

Preview fixtures now mount the actual teacher and dashboard components. Teacher previews skip encrypted queue initialization/replay and all mutation paths. Dashboard preview links retain their real destination as test evidence but navigate only within the synthetic preview, including Open in New Tab. A capture guard blocks submissions and network writes.

Screenshots and machine-readable results are kept outside the release checkout under `output/playwright/parent-mobile-refinement-2026-09-10/` in the shared repository. They contain fake data only. The release PR and closeout evidence record the full build result, intended merge commit, Ready deployment, aliases, health, logs, and authenticated changed-flow checks; local preview results alone do not prove production verification.

## Native evidence boundary

`mobile:store:check` passes for parent and teacher identities, HTTPS/offline settings, privacy manifests, icons and launch assets. This UI release does not constitute Xcode compilation, a signed archive, simulator or physical-device verification, TestFlight processing, Apple approval, or submission.

## Preservation and recovery

No production data repair or provider action is needed for these UI changes. Revert the scoped UI commit through the protected release process if necessary; do not reset user preferences or change identities to roll back presentation. Unrelated PRs and worktrees are retained.
