# School Help and secure payment UI — September 13, 2026

## Current state before changes

Clean isolated branch `work/school-help-payment-ui-20260913` starts at protected PR #372 main `136d0d60eff90dbe612e5d63fbefed712ca245cf`. Its invoice-calendar production deployment is in progress. PR #371 is deployed and guarded Parent/Teacher regression passed. Primary dirty checkout, unrelated PR #311 and prior branches/worktrees remain untouched.

Read-only findings:

- Help renders six unconditional operational links. Billing users receive five destinations they cannot open as labeled; auditors receive denied School Setup and Attendance links. The page omits the existing public Guides and Support destinations and queries/displays lead-task, message and document counts even when the role cannot open that workflow. The generic Create/Edit Record hub appears above help links under a misleading Help Announcement title. Preserve announcement management through its dedicated authorized workflow.
- Secure payment setup uses nowrap/fixed-height buttons and intrinsic mobile grid tracks; its parent Card clips overflow. At 320/390px with 200% text, action widths reach 402px and the right edge reaches x466. Optional payment buttons overlap. The outline autopay badge is near-black on the actual dark page, and preserved-consent text clips.
- Pending bank verification disables both setup buttons and the server independently rejects a duplicate setup with 409. Yet the page tells the family to select Connect bank account. A success query flag also hides the authoritative pending reason. Keep the pending protection and provide accurate status/recovery instructions.
- Reserved App Review Parent Payments deliberately disallows financial mutations but shows the ordinary red outage banner. Replace only the demo presentation with an explicit read-only billing explanation; real payment errors and every server/mutation guard remain intact.

Payment-link baseline evidence: `output/playwright/payment-link-ui-read-only-webkit`. Independent diagnostic-only CSS passed 112 state/layout cases and 496 control measurements across both engines, with no API/provider/non-GET/off-origin requests or exceptions: `output/playwright/payment-link-ui-css-proof-v2-{chromium,webkit}`. V1 mistakenly affected Alert grids and failed; do not reuse that broad selector. Diagnostic CSS is not an implemented-product pass.

## Implementation contract

Use server-derived direct module permissions for Help links; never grant access or relabel a forbidden module as an unrelated fallback. Remove redundant queue metrics instead of querying broader school-wide counts that do not match Teacher/current-family workflows. Make Guides/Support easy to reach, preserve scoped alerts/history and keep announcement edits on their dedicated page. Reuse existing components and actual-shell browser fixtures with fake data.

Scope public payment reflow to its page/form. Preserve full labels, at least 44px targets, disabled/pending rules, fee/consent boundaries and separate setup versus payment actions. Show pending status even after a submission return, suppress contradictory Connect instructions and offer read-only status refresh. Do not start setup/payment, send links, change autopay or contact providers in verification. Keep App Review billing read-only.

Add focused role, responsive, pending-state and demo-copy tests; run both browser engines and full protected production gates. Exact deployment/health/log and changed-flow evidence follows. Management-role authentication and real bank/provider handoffs remain separate from local fake-component proof.

## Implemented

- Help has direct authorized module cards after Guides and Contact Support. Its four redundant counts/queries are removed; alerts remain exact-user active notifications, bounded to 12, and support events retain their tenant/center-or-user predicate, bounded to 25. Mobile lists replace horizontal Help tables. Both limits are explicitly labeled. No role/grant/session change was made.
- The existing announcement editor now receives the already-authorized school choices. Its shared record form uses adaptive columns and bounded inputs; selecting a school is tested locally without saving or sending. The generic editor remains an existing multi-record workflow; this wave does not claim to finish its full authoring/recovery UX.
- The public payment shell and expired-link presentation are extracted without changing token, family, recipient, tenant or provider logic. Intro/identity information is compacted; full values, safe areas, instructions and 44px actions remain. The actual shell, not a lookalike, is used in fixtures.
- Setup order is DOM order (card first except explicitly bank-focused links), including keyboard traversal. Bank verification remains authoritative after a submitted return. New setup stays disabled and server 409 protection is unchanged. Check status only reloads the GET page and is disabled during another request; a held, exact fake Checkout is tested in browser memory without a network request.
- Setup/payment grids wrap full labels, outline badge/hover text and bank/error contrast are readable on the actual dark page, and expired-link icons remain inside their alert columns at enlarged text. Existing autopay consent and reauthorization/no-charge separation remain unchanged.
- Reserved Parent App Review billing shows an informative read-only notice instead of the real outage banner; ordinary outage handling and financial mutation guards remain.

The first browser pass exposed an enlarged Announcements selector overflow; later strict checks also found a hidden Base UI form input, a WebKit reload-wait race and existing public error/hover contrast defects. Hidden `aria-hidden`/type-hidden form plumbing is excluded from visible-target measurements; no visible target is exempted. The actual selector/layout and contrast defects are corrected; final evidence must come from a fresh source-stable run. Earlier failures are preserved, not presented as passes.

## Final local evidence

The production gate `npm run vercel-build` passed: Prisma generation, lint (zero errors; one pre-existing unrelated `_row` warning), TypeScript, all 2,197 tests and the optimized Next.js build. Focused regression passed 29 tests; standalone full tests, final targeted lint and `mobile:store:check` also passed. Logs: `output/wave20-vercel-build-release.log`, `output/wave20-focused-release.log`, `output/wave20-tests.log`, `output/wave20-targeted-lint-final.log` and `output/wave20-mobile-store-check.log`. Earlier lint/type failures were corrected without weakening checks; their logs remain historical failure evidence.

Final source-stable Chromium and WebKit runs each passed 116 cases and 704 visible-control measurements. Each includes 16 read-only refreshes, 12 held fake Checkout interactions entirely in browser memory and seven accessibility scans with no serious/critical WCAG A/AA/2.1AA violations. There were zero blocked requests or client exceptions. No API, non-GET, provider or off-origin request was issued. Fourteen source-file hashes are recorded per run.

- Chromium completed 23:08:50.479 UTC: `output/playwright/school-help-payment-chromium-2026-09-13T23-07-23-393Z/results.json`.
- WebKit completed 23:10:31.470 UTC: `output/playwright/school-help-payment-webkit-2026-09-13T23-08-24-133Z/results.json`.

Coverage includes 14 payment states; the actual invalid-link shell; eight Help roles and an empty state; the actual announcement editor inside AppShell; and the read-only Parent demo notice. Narrow 320/390px and wider 768/1440px layouts are checked at normal and 200% root text size, including full labels, 44px controls, clipping, contrast and disabled/pending behavior. Representative final public, Help, enlarged-text and announcement captures were visually inspected. Browser root-font enlargement is not native Dynamic Type. Actual management authentication, valid live setup/provider handoffs, native/device behavior and production release verification are not implied by these local results.

## Protected release and production verification

PR [#373](https://github.com/BrunerDigital/TheBEESuite/pull/373), candidate `a9c855896c09571c8b6affc078344d1997a33721`, merged at `a6394f8af9d7cc2bc41d5703efd5be8ecb71d79f` after CI `34789177216`, CodeQL and exact preview Ready. Production `dpl_9ihXSUEd4bPcA7bhkCeLZGgvcUqv` was Ready at 23:22:40.189 UTC on all five canonical aliases. No protection bypass or force push.

Guarded Parent/Teacher verification passed at 23:28:25.467 UTC: 20 routes, 52 Parent fit checks, eight shared-shell checks, four Teacher navigation checks, four history and four message-layout checks, 12 report-target checks, 16 picker checks, four Updates GET and four layout checks, four fake-invoice calendar checks and four read-only demo billing checks. Two matched fake logins, 95 verified heartbeats and six empty-body denials were admitted; no product, money, identity or provider writes, blocked requests or client exceptions occurred. Evidence: `output/playwright/app-review-production-after-parent-updates-pr373/results.json`.

The exact invalid public payment page passed six GET-only phone/desktop and text-size cases at 23:25:42.940 UTC (`output/playwright/public-payment-invalid-pr373/results.json`). Its expected Next prefetch and telemetry scripts were blocked by the verifier; no real payment token was opened. Earlier restrictive asset-guard failures were preserved in renamed task-owned evidence folders. Health was database-connected at 23:28:49.121 UTC; post-Ready error/fatal and 5xx queries were empty and error-filtered build logs showed only completion. Management authenticated Help/announcement authoring and valid provider handoffs remain explicitly unverified in production.
