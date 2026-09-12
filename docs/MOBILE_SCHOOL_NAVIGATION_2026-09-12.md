# Mobile school navigation — September 12, 2026

## Current truth before changes

This wave starts from reviewed teacher candidate `7cc701f7e159222d348f6488733a9df5350e23f5` (protected PR #364); production is verified PR #363. Reconcile with merged main before release. Preserve unrelated primary work and PR #311.

Fresh Chromium fake-only baseline covers 24 cases across director, executive, billing, auditor, teacher and parent; 320×568/390×844 at 100/200% text. Twenty cases fail layout expectations; all four parent cases pass. Evidence: `output/playwright/mobile-school-navigation-baseline/results.json` and dated fake screenshots. No API, write or off-origin requests were allowed.

Confirmed problems: enlarged non-parent navigation takes three rows on 320 px phones; school/classroom labels truncate; More links overflow and the close control overlaps the first destination (including normal text); the left drawer's narrow width and oversized heading/context hide its first destination. Short administrative screens retain a sticky header that consumes reading space. The executive long-content fixture also overflows horizontally. Source inspection additionally shows the mobile drawer does not pass its existing close callback to navigation links.

Implementation will retain every existing authorized destination and the same role filters. Apply intrinsic-width wrapping navigation, compact non-text spacing, visible wrapped context, viewport-constrained menus and a distinct mobile drawer header. Do not shrink user text or hide inaccessible content behind clipping. Test enlarged text, all destination reachability, keyboard dismissal/focus restoration, and normal/phone layouts. Add the exact assistant-director fake fixture. No authorization, data, identity, messages, billing, provider, school activation or native publishing changes.

Initial harness corrections: enumerate a stable list of neighborhood summaries instead of the shrinking closed-only list; Escape may first dismiss a focused link's tooltip before the enclosing drawer. These are test sequencing fixes, not suppressed application errors.

## Implemented and locally verified

PR #364 is now merged and verified on exact main `b8b1f7f84c767d8c91f4631571a5eb19fa4e9f40`; this branch fast-forwarded before release validation.

- Retained all quick destinations and the same authorization filters. Intrinsic-width bottom navigation uses at most two rows at doubled text. At 320 px / 200%, non-parent navigation falls from about 219 px to 139 px; compact school headers measure 166 px and classroom/portfolio headers 168 px. Short-phone headers scroll in document flow.
- More uses a side-qualified 82dvh limit, reserved close-button space, wrapping labels and bounded scrolling. The left drawer uses the available phone width, a concise header, a visible current context and the real account-footer footprint. All destinations remain keyboard reachable.
- Drawer links, fixed scope links and nested account Profile links close the enclosing drawer on an ordinary accepted same-window click. Canceled/modified navigation is not treated as accepted. Successful workspace selection closes both picker and drawer; errors/cancellation do not. Preview account footers remain upload/signout-free.
- School/company/city context remains visible. Only the exact duplicated role segment is removed visually; full context remains in the accessible name. A proven redundant `1 school` line can be omitted, not arbitrary selected-school detail.
- Current URL/query determines administrative active tabs, including direct Payments URLs and Back/Forward. Parent document links and teacher native fragments retain their existing behavior.
- Shared title wrapping fixes executive/regional 20 px page overflow and an auditor title clipped inside its own card, without hiding page overflow or shrinking text.

Browser evidence: Chromium and WebKit each pass 32 phone/enlarged-text role cases, including exact assistant-director, plus eight selected-school company/city cases. Parent Home fit passes 76 cases in each engine. Teacher draft/history/nested keyboard Profile checks pass four cases in each engine, including canceled drawer-scope navigation retaining the open modal and all drafts. All data is fake; zero API/write/off-origin attempts or client exceptions. Before/after screenshots are in ignored `output/playwright/mobile-school-navigation-*` and `wave12-school-context-*` folders, not App Store/device evidence. The WebKit harness now waits for the accepted Next route to finish before reopening and closing its drawer; no forced clicks or weakened dismissal checks were used.

Focused regression tests pass 38/38. Native store-readiness passes; no native source changed. Initial full gate reached 2,149 tests with one stale menu-class source assertion; the test now checks the corrected side-qualified height and bounded scroll container. Final `npm run vercel-build` passed Prisma generation, lint (zero errors, one pre-existing unrelated warning), types, all 2,149 tests and optimized production build. Guarded post-release checker preparations pass 24 offline safety self-tests and require exact navigation destinations, visible keyboard reachability, unclipped layouts and nested Profile disclosure. Production verification must use this wave's own exact Ready deployment.

Tablet closeout: Chromium and WebKit additionally pass 16 cases each at 768×1024 and 100/200% text across all eight roles. Together with 32 phone and eight selected-school cases, shared navigation passes 56 cases per engine. Evidence: `output/playwright/wave12-tablet-chromium/results.json` and `wave12-tablet-webkit/results.json`. No API/write/off-origin requests or client errors occurred.

Broader management-role authenticated production coverage remains limited by the previously reported general QA credential issue. Current reserved Parent/Teacher accounts work. Older parent-history continuation and the other documented school-readiness work remain actionable, not completed or human-only blocked.

## Protected release and current production evidence

PR #365 merged September 12 at 18:59:55 UTC: reviewed head `e4b389f1ee3ac08973429d02f387f23eaf1ad40c`, exact main `3f396ffcd28059bb099d6ca96163995e43f0b840`. Required validate run `34712560891` and CodeQL `34712559149` succeeded with no open review conversations. Exact-head preview `dpl_ENJKHT86F7ZjLEZnaTVxZNNGNEe6` was Ready before merge.

Production `dpl_HvJQxK67qv9gAgBaDjYTrJQSkiBX` is Ready on that exact main commit. All five aliases were verified: `thebeesuite.io`, `www.thebeesuite.io`, `the-bee-suite-beta.vercel.app`, `the-bee-suite-brunerdigital.vercel.app`, and `the-bee-suite-git-main-brunerdigital.vercel.app`. Deployment completed at 19:02:21 UTC. Health at 19:06:40 UTC returned `ok: true`, database connected; build errors and scoped post-release error/fatal/5xx counts were empty in the observed window.

Fresh strict fake-account production verification completed at 19:05:44 UTC. It passed 20 navigation, 52 Home-fit, eight shared-shell and four teacher-task cases, plus Parent home/layout/document/report/shortcut/unsent-history checks. Parent read-only payment observation returned private/no-store 200; Teacher received 403. Six explicitly permitted empty-body billing probes were denied. Only two login and 52 heartbeat POSTs accompanied those denial probes; zero product, financial, media, profile, message or identity writes, blocked requests, HTTP errors or client exceptions. Evidence: `output/playwright/app-review-production-after-mobile-school-navigation/results.json`.

The ten-page printable fake-data browser packet `output/pdf/BEE_Suite_Current_Mobile_UI_2026-09-12_PR365.pdf` uses fresh production captures from 15:03–15:05 America/New_York. All ten rendered pages were visually inspected. It identifies empty Messages, historical synthetic Updates and intentionally disabled demo Payments; it is not native, physical-device or App Store screenshot evidence.
