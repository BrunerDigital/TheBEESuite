# Teacher task navigation — September 12, 2026

## Current truth before changes

Development starts from parent payment-status candidate `3d376fd7b8c0ab13110a925c562bca23cf99ddd9` (protected PR #363 pending); production remains verified PR #362. This wave will be reconciled with merged main before release. Unrelated primary work and PR #311 remain preserved.

Actual-Next fake-only inspection found that Bottom Log updates the URL/highlight but leaves the nested daily-report card collapsed. Next Link prevents the ordinary click seen by the shared expansion handler and does not emit native hashchange. The same mechanism affects the account-menu Profile link. Teacher active state is local click state, so Home shortcuts and Back/Forward can leave the wrong tab highlighted. Preview URL rebuilding also drops the history-test query. Existing focused source tests passed despite these browser defects.

The shared disclosure expansion hook already guards modified/prevented clicks, repeated hashes, nested targets, persisted preferences and newer focus ownership. Preserve those guards and all teacher child/report-recipient/draft state. Use teacher-only native hash links on the same document, accurate location-derived active state and a focusable Today heading. Keep cross-page links and all other-role navigation behavior intact. Test through actual Next at phone widths/enlarged text with fake data and all API/off-origin/write requests blocked.

No teacher profile save, attendance entry, report/photo upload, message, identity change, offline credential retrieval, provider action or school activation is part of this wave. The development-only history fixture may enable the unsaved-navigation warning but must remain preview-only for every data path. Signing, authenticated native and physical-device evidence remain separate gates.

## Implementation and focused verification

PR #363 is now merged and verified; this branch fast-forwarded to exact main `bb1a023b5add91660ff9dc37acdd0c05d7d2c1c0` before release validation. Teacher task links use native fragments only on the existing teacher document; actual pathname/query/hash and native history events determine active state. Profile reuses the same link behavior and Base UI's default focus restoration. Other-role and cross-page destinations are preserved.

All eight teacher disclosure cards opt into the shared component's compact header variant: title and 44 px disclosure control share a row; auxiliary actions wrap across the full width underneath. The default header for every other workspace is unchanged. No child selection, report recipients or data-handling logic is changed.

Focused tests: 37 passed, including updated measured-header clearance and preview-only transport safeguards. An additional 22 parent-navigation/preview-safety/teacher tests passed after correcting two stale source assertions for the teacher-only link/menu branches; parent navigation remains a document anchor and the interactive teacher fixture requires the exact development-only history scenario.

Final Chromium and WebKit actual-Next checks passed four cases each at 320/390 px and 100/200% text, including normal-motion/keyboard Profile, exact recipient identity preservation, rapid Log-to-Today intent, canceled/accepted cross-page history traversal with differing hashes and compact-header geometry. Every case retained a single document navigation, with zero API/write/off-origin requests and client errors. An independent shared unsaved-history Chromium regression passed all nine checks. Capacitor store-readiness passed; no native source changed.

The measured 320 px / 200% profile header initially grew to 780 px. Full-width description/action rows, fixed 44 px disclosure controls and phone gutters reduce it to 304 px without shrinking text. Final roster/profile/photo header heights are 188/304/108 px at 320 px with doubled text. Next development-indicator overlap and a too-early menu Escape in the initial QA harness were corrected without forcing clicks or masking application errors. Failure evidence remains in ignored output; no production UI overlay behavior was changed to pass tests.

Full `npm run vercel-build` passed: Prisma generation, lint (zero errors; the existing unrelated automation `_row` warning remains), typecheck, all 2,145 tests and optimized production build. Shared unsaved-history checks also passed in WebKit (nine checks; one document navigation). Independent read-only source review found no blocker.

Production verification for this wave must wait for its own exact Ready deployment; PR #363 evidence is not proof of the new teacher behavior. The guarded checker retains strict fake-graph proof, read-only navigation and the six inherited empty-body denial probes; adds native-fragment/document-continuity, exact active-tab, keyboard Profile, repeated Log and enlarged-header checks. Its 24 offline safety self-tests pass without database or network requests.

Broader follow-ups remain actionable: focused report-recipient control consolidation, bounded older parent history, and management-menu reflow. This is not an all-product completion claim.

## Released and production verified

Protected PR #364 merged September 12 at 18:30:33 UTC: reviewed head `7cc701f7e159222d348f6488733a9df5350e23f5`, exact main `b8b1f7f84c767d8c91f4631571a5eb19fa4e9f40`. Required CI run `34711097862` and all CodeQL analyses passed; zero unresolved review threads. Vercel production `dpl_AnPYZnrSufknCDmeHyou3Az9zsBf` is Ready on all five canonical aliases. Build completed 18:32:55 UTC; health/database connected at 18:37:19 UTC; build-error and scoped post-release error/fatal/5xx logs empty.

Fresh strictly guarded Parent/Teacher fake-account production verification completed 18:36:47 UTC: all 20 navigation, 52 parent-fit and existing profile/document/report/home/layout/history checks passed. Four new teacher task cases prove literal fragments, unchanged document identity, exactly one correct active task, repeated Log expansion, Back/Forward, keyboard Profile, and no internal/header/document clipping at 320/390 px and 100/200% text. Reserved profile headers measure 126/344/126/304 px respectively; all disclosure controls are 44×44 px. Two login, 44 heartbeat, six protected empty-body denial POSTs and two read-only status GETs; zero product/financial/identity/message writes, blocked requests, HTTP errors or page errors. Evidence: `output/playwright/app-review-production-after-teacher-task-navigation/results.json`.
