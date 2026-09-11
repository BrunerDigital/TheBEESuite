# Mobile screen density — September 11, 2026

## Starting state (before changes)

- Clean isolated branch `work/mobile-screen-density-20260911`, based on `origin/main` at `9b4746a4750c948753e3cf6c8660f4eb2d21a92e` (PR #346).
- Main checkout and unrelated worktrees preserved. Unrelated draft PR #311 retained.
- Repository readiness snapshot completed; Node 24.15.0, Next 16.3.4, fresh `npm ci` (661 packages, zero vulnerabilities), Prisma client generated. Installed Next CSS and server/client guidance reviewed.
- Parent home repeats vertical spacing between identity, attendance, report link, and details. Its 9rem quick-action minimum becomes a one-column list at 320px. Greeting and separate heading/cards consume space before priorities.
- Teacher home has a large introduction, separate online row, and a separate task navigation card. The review-only profile explanation adds another large panel. All six shortcuts, operational warnings, and profile restrictions must remain available.
- Existing text-zoom, 44px controls, safe-area/footer clearance, accessible disclosures, draft-only form tests, and fail-closed preview protections are baseline requirements, not tradeoffs.

## Scope and evidence plan

Consolidate the two home screens and mobile heading spacing using existing components. Preserve all features and data boundaries. Measure first-screen action visibility at 320×568 and 390×844; capture the unchanged baseline before edits. Verify 200% text, long names, multiple children, quiet/absent states, expanded forms, light/dark themes, Chromium/WebKit, and safe authenticated production flows after protected release.

No database, identity, billing, messaging, provider, entitlement, signing, or store changes are part of this UI pass. Browser WebKit testing is not physical iOS or Xcode evidence.

## Initial density pass (PR #347)

Parent child identity, classroom and attendance now share a wrapping summary. Compact headings, spacing, icons and mobile-only action labels keep all four destinations visible. Full daily details, sibling records, report links and payment/incident/document alerts remain available.

Teacher greeting, live counts, online status and six shortcuts now share one panel. Critical custody/offline/error notices precede the action panel. The shared-review restriction notice keeps its visible title and a keyboard-expandable explanation; identity/clock restrictions are unchanged. The school/workspace remains in the global shell.

| Ordinary home, default text | Actions fully visible before | After | Last action moves up |
| --- | --- | --- | --- |
| Parent, 320×568 | 1/4 | 4/4 | 231px |
| Teacher, 320×568 | 0/6 | 6/6 | 289px |
| Parent, 390×844 | 4/4 | 4/4 | 115px |
| Teacher, 390×844 | 6/6 | 6/6 | 115px |

These are measured browser CSS pixels using identical synthetic fixtures. Safety notices, more children, long names and enlarged text can legitimately require scrolling. The 390px review-mode teacher screen also fits all six shortcuts; the smallest review-mode screen may scroll for its additional restriction notice. Text enlargement is not disabled and actions remain at least 44px high.

Validation:

- 80 focused tests, including four new density/security-boundary regressions and the existing parent dashboard contract.
- 84 density cases across Chromium and WebKit, 320/390/768px, default/200% text, single/multiple/long/absent/quiet families, regular/review teacher states. All six teacher anchors open and receive keyboard focus.
- 220 feature cases across both engines, 320/390/768/1024px and default/200% text; additional 390px dark-theme coverage. Expanded forms, unsent draft editing, selectors, help dismissal and document continuation pass without API writes.
- 32 accessibility/contrast audits across both engines, phone/desktop and light/dark: no violations or unresolved checks.
- Eight parent navigation/scenario runs and eight forward/reverse keyboard-focus runs pass.
- Both iOS static store checks pass. Simulator/device/signing/archive/TestFlight not performed in this Windows UI pass.
- The first full build exposed a nullable href in the new QA script; an explicit string guard fixed it and typecheck passed. No application or test control was weakened.
- The next full suite passed 1,910 tests and caught one old exact-spacing assertion. It now explicitly requires the new compact phone spacing and preserved wider-screen grid; all detail/navigation assertions remain. The 14-test density/dashboard subset passed after the update.

Reproduce with `npm run qa:mobile-density -- --base-url http://127.0.0.1:3216`, `node --import tsx scripts/qa-parent-home.ts`, the existing feature/accessibility scripts, `npm run mobile:store:check`, and the required `npm run vercel-build`. Supply the actual local server URL to browser scripts. Production is refused by preview-only QA scripts.

The fake-data, four-page printable comparison is generated under `output/pdf/BEE-Mobile-Density-Review-2026-09-11.pdf` (local, not committed). Evidence JSON, screenshots and the private credential-loading production verifier are under `output/playwright/mobile-density-20260911/` and are intentionally excluded from Git. No passwords or authentication state are saved in the packet.

## Release record

The associated protected PR records the final build/CI result, tested commit, merge commit, exact Vercel Ready deployment, aliases, health/log review and approved fake-account changed-flow results. A merged PR or public health response alone is not authenticated workflow verification. Native Apple submission gates remain separate from this web UI release.

## Authenticated production-fit follow-up

PR #347 reached production as `1196d3d84fd22551259a14ae2ca86e9201c83141` on `dpl_2sHUQUs9Atntmj2jUwyqw9JTLmFu`. Both main CI and the production build passed. Health was connected and public/legal routes passed, but the first authenticated 320px check found longer school/classroom labels adding 44px compared with the short fixture: the last action ended at 537px behind navigation starting at 503px. No API writes or client/server errors occurred. That first release was not treated as fully verified.

The follow-up uses a clean isolated branch from that exact `origin/main`. It keeps school, classroom and attendance labels fully visible, removes the redundant visual "Quick actions" heading on phones (retaining its accessible section name), and tightens only home spacing. Larger-screen headings and all four labeled action links remain. No control, font size or authorization rule is reduced to achieve the fit.

The new `school-context` fixture intentionally wraps both school and classroom context and is subject to the same above-navigation assertion as the short home. Density QA now requires 48 cases per browser, not 42. Final release evidence will include the authenticated recheck of this case and all changed shortcut destinations.
