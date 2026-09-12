# School UI and workflow readiness — September 12, 2026

## Current verified release — refreshed September 12, 20:55 UTC

- Latest verified release is protected PR #368, main `8ee717d5df8b66a0d0dfec7c3925d57717b44fc3`, Vercel `dpl_9FQkjXB12hyBHrHBzy3MgNXtns23` Ready on all five canonical aliases. Health/database connected and post-ready build/error/fatal/5xx checks clear. Fresh guarded fake-account verification passed at 20:54:58 UTC, including 16 new individual-selector checks and all previous report-target, route, shell and parent-fit checks. Local full production gate: 2,169 passing tests. Detailed current evidence is in `TEACHER_INDIVIDUAL_TARGETS_2026-09-12.md`.
- Active wave #16 finishes Parent daily report/photo history, compact date navigation and care details, full-day pagination, safe retry and school-day correctness. Product-order retry integrity, legacy family-payment finalization and wider management-role verification remain actionable. No claim of complete school activation, signed native readiness or human-only remaining work is made.

### Previous verified release #367 — historical

- Latest verified release is protected PR #367, main `8687feaf040718af614496e1dbc7aa460901a31c`, Vercel `dpl_F9T8mLieVBcqDjiuBDMz7JvpNUhq` Ready on all five canonical aliases. Health/database connected at 20:23:34 UTC; build and post-ready error/fatal/5xx checks clear. Fresh fake-account production verification completed at 20:25:50 UTC with all existing route/layout/scope checks plus 12 new report-recipient checks passed. Zero product writes or client/HTTP errors. Full corrected production gate: 2,161 tests passed. Evidence: `TEACHER_REPORT_TARGETS_2026-09-12.md` and `output/playwright/app-review-production-after-teacher-report-targets/results.json`.
- Current in-progress wave adds shared guarded child pickers to Teacher Photo, Incident and Location, including short-screen arrival and post-selection keyboard visibility fixes. Older Parent report/photo history, product-order retry integrity, legacy family-payment finalization and broader management-role verification remain actionable, not human-only gates. The refreshed 12-page PR #367 browser PDF is a fake-data production snapshot; it is not native/device evidence.

### Previous verified release #366 — historical

- Latest verified production commit: `b6237035ffe74b3d2489684f037697fb8f706f44`, protected PR #366. Vercel `dpl_2bCYX8asgdrsS2Ft1XR3CnLXXpn5` Ready on all five canonical aliases; health/database connected at 20:00:22 UTC; build errors and scoped post-release error/fatal/5xx logs empty.
- Fresh, strictly guarded Parent/Teacher fake-account production checks completed at 20:00:04 UTC: 20 navigation cases plus profile, document, report-control, home, layout, shortcut, unsent-history and 52 parent-fit checks. Eight shared-shell and four teacher-task cases prove bounded menus, context, nested keyboard Profile, native fragments, history and enlarged-header reflow. New history checks prove Parent private/no-store 200, missing cursor 400, safe unavailable deep reply, Teacher 403 and four message-layout cases at enlarged text. The fake conversation is empty: populated continuation is proven locally in Chromium/WebKit, not live. Six empty-body payment guard probes were explicitly permitted and denied; Parent read-only payment status returned 200, Teacher 403. Zero financial/product mutations or HTTP/page errors. Evidence: `output/playwright/app-review-production-after-parent-message-history/results.json`. The ten-page printable PR #365 packet is a historical 15:03–15:05 New York snapshot; it is not native/device evidence.
- Subsequent completed waves since the original #352 baseline: directory/teacher-recipient draft safety (#355); billing editor drafts (#356); parent document history/signature safety (#357); teacher profile recovery (#358); automation draft/history safety (#359); compact quiet parent Home and wrapping family navigation (#360); semantic native private-message privacy declarations (#361). Each release has its own current evidence document.
- Exact-main unsigned native run `34705460891` succeeded for commit `04a0526d96daddb87c1d91daae7a4304e35cb474`. Detailed reviewed PR native artifacts in `IOS_PRIVACY_MANIFEST_RECONCILIATION_2026-09-12.md` prove source-matching Parent/Teacher manifests, device/simulator Release builds and public launches. This is not signing, authenticated-native, physical-device, archive, TestFlight or Store evidence.
- Shared invoice Checkout claim/retry/tenant safety (#362), parent payment-status/recovery UI (#363), teacher task navigation/compact headers (#364), shared phone navigation/menus/context/reflow (#365), and Parent message history/canonical replies/current-school send boundaries (#366) are released and verified. Active unreleased wave: teacher report-target simplification and complete read-only recipient disclosure (`TEACHER_REPORT_TARGETS_2026-09-12.md`), locally passing all 2,161 production-gate tests after the protected QA-cleanup review correction. Next actionable work includes older reports/photos, task-local teacher Incident/Location child context, dormant product-order retry integrity and separate legacy family-payment retry/finalization hardening. These are not human-only dependencies.
- Broader management-role production verification remains limited by the invalid saved credentials for the nine general synthetic QA roles. Reserved App Review Parent/Teacher accounts work. No account was reset and no school was activated.

### Earlier verified release #352 (historical)

- PR #352 merged through required checks/review conversations at `7e36706cd4526c3f656c109ab23b696f0db86a32`.
- Production deployment `dpl_HhnvhBkv2aJiAuLsXZi9dMAHNCFm` is Ready on `thebeesuite.io`, `www.thebeesuite.io`, `the-bee-suite-beta.vercel.app`, `the-bee-suite-brunerdigital.vercel.app`, and the main-branch alias. Build/deployment completed September 12 at 03:52:30 UTC.
- `/api/health` at 03:55:21 UTC returned `ok: true`, `database: connected`. Scoped error/fatal runtime counts were empty after deployment; this is an observation window, not a guarantee of no future errors.
- Fresh synthetic-scope checks and authenticated production navigation passed **20/20**: Parent Home, Updates, Messages, Documents, Payments; Teacher Home, roster, quick log, photo, protected profile. Both 390×844 and 1440×1000. Two login and twelve heartbeat requests only; zero product-write attempts, HTTP errors, uncaught client errors, or horizontal overflow. Sanitized evidence and 20 fake-data screenshots: `output/playwright/app-review-production-after-release/`.
- Final PR-head web CI, CodeQL, Vercel preview, Parent unsigned macOS checks, and Teacher unsigned macOS checks passed. No signing, archive, TestFlight, physical-device, or authenticated native verification is claimed.
- The matrix and baseline sections below are discovery/history records. The next directory/teacher draft wave is tracked in `UI_UX_DIRECTORY_DRAFT_SAFETY_2026-09-12.md`; billing, automation, older parent records, and broader role verification remain active work.

## Historical baseline (before edits)

This is an active completion record, not a claim that all schools are activated or every feature is verified.

- Clean isolated branch: `work/school-ui-flow-completion-20260912`, starting at `2cadf48c47da929bdbf596b4a9580caed5803a6c` (`origin/main`).
- Baseline production: Vercel Ready deployment `dpl_HSEAvXPmvDb9NsfB3zxj9TXhZwuy` on that commit.
- Existing dirty primary checkout, active existing-location setup work, other worktrees, and draft PR #311 are preserved.
- Dependency installation: locked `npm ci` passed; zero reported vulnerabilities. Prisma client generation passed.
- Parent/Teacher native startup and public simulator verification from PR #349 remain historical verified evidence; this web-flow work does not constitute new signing, device, authenticated native, or store evidence.
- Three independent read-only audits are rechecking current code; only the primary integrator edits or releases.

## Completion matrix

`Pending` means not yet verified in this run. Code review alone is not browser or production evidence.

| Area / role flow | Built | Correct configuration / scope | Local tests / browser | Production | iOS device | External gate |
| --- | --- | --- | --- | --- | --- | --- |
| Parent/guardian home and compact primary navigation | Yes; #360 | Preserved scoped Family/Payments destinations | Chromium/WebKit, 320/390/768 and 100/200% text | Guarded fake Home/fit verified #361 | Pending | Signed device |
| Teacher roster and daily task navigation | Yes; #355/#358 | Assigned-classroom and report-recipient safeguards retained | Focused tests and fake browser flows | Guarded fake navigation/controls/profile verified #361 | Pending | Signed device |
| Director / assistant / executive next-action links | Yes; #352 | Correct destinations and selected context tested | Fake-role browser flows | Management-role auth pending | N/A | Secure working QA credentials |
| FTE school/week deep links and historical review | Yes; #352 | Fail-closed readable/writable scope and exact historical targets | Focused/fake-browser checks passed | Management-role auth pending | N/A | No real report mutations performed |
| Auditor read-only reporting controls | Yes; #352 | UI matches API write restrictions | Focused/fake-browser checks passed | Auditor auth pending | N/A | Secure working QA credentials |
| Parent incident acknowledgment feedback | Yes; #352 | Family boundary preserved; successful receipt immediate | Intercepted fake write tested | Navigation only; no real acknowledgments | Pending | No real acknowledgments performed |
| Parent reply drafts and earlier announcements | Yes; #352/#359 | Recipient context and unsent navigation guarded | Fake attachment/confirmation/history tests | Unsent-message history cancellation verified #361 | Pending | No real messages performed |
| Teacher profile/photo network recovery | Yes; #358 | Uncertain result preserves draft; duplicate attempt protected | Fake transport and draft browser checks | Read-only fake profile UX verified #361 | Pending | Physical camera/upload verification |
| Older parent reports/documents/messages/media | Documents #357 and messages #366 completed; reports/photo caps still actionable | Family-scoped private document/message continuation verified; reports/media need work | Focused/actual-handler tests and both-engine fake browser checks passed | Documents and empty message endpoint/denials/layouts verified #366; populated message paging local only | Pending | None for remaining read-only code |
| Shared search and navigation state | Directory/disclosure/history fixes released | Context/later-response guards tested | Fake multi-role browser tests | Parent/Teacher links verified; management auth pending | N/A | Secure working QA credentials |
| Billing and administrative recovery/draft safety | #356/#359/#362 released; parent recovery UI active | Separate outcomes and preserve actor/school/date context | Fake Chromium/WebKit edit/history and invoice-state tests | #362 guard denials/navigation verified; management-role auth pending | N/A | No charges/refunds/provider changes performed |
| Authorized pickup and restricted/expired access | Built; guards retained | Fail-closed unit/source checks | Focused denial checks; wider fake auth pending | General pickup/inactive QA pending | Pending | Secure working QA credentials |
| School onboarding / data setup | Separate PR #351 plus active follow-up | Preserve concurrent work | Not changed here | Baseline Ready | N/A | School rollout separate |

## Verification and release contract

Use fake fixtures for screenshots and mocked writes. Production checks use only existing verified synthetic accounts, with non-read requests blocked except login and the existing session heartbeat. Do not create/reset accounts, send messages, acknowledge real incidents, change billing, migrate data, or activate schools.

For each material fix: focused regression tests, browser behavior at phone/tablet/desktop widths and enlarged text as applicable, preview no-write boundary, full `npm run vercel-build`, protected PR checks/merge, exact-commit Vercel Ready, aliases, health/log review, and changed-flow verification. Preserve failure evidence; never weaken a gate to pass it.

## Remaining external boundary

Mac/Xcode access, signing-team selection, physical-iPhone authenticated checks, final privacy/legal/store metadata approval, archive validation, and separately approved TestFlight/App Review publishing remain distinct from this web UI release. No broad school activation is implied.

## Wave 1 — implemented and under release validation

- Parent replies retain unsent text/files when changing reply context, with a cancelable confirmation. Earlier announcements are reachable in a collapsed disclosure. Incident acknowledgment updates the visible receipt immediately after a successful response. Update grouping uses the school timezone.
- Teacher profile/photo transport failures retain inputs and explain that the outcome is uncertain; no automatic retry or duplicate upload is triggered.
- Dashboard notices open their intended workflow without treating the sentence as a search query. Incident and follow-up destinations are explicit.
- FTE report links use one validated authorized-school/date target. An exact historical lookup supplements the bounded recent list; historical entries never inherit current enrollment/billing prefills. Existing report IDs, selected ranges, notes, explicit zero FTE and zero billing values remain intact.
- FTE school/week changes and ordinary page-leaving links protect drafts; failed saves keep entries. Approved director reports disable editing. Executive approval capability follows the actual role even in a single-school workspace; auditors retain history/printing without write or forbidden-export controls.
- Real components run in a localhost-only transport harness with fake props and intercepted requests (`npm run qa:ui-flow-recovery`). It has no credentials/backend access and is not an application route. Twelve workflow groups passed, including five explicitly intercepted write attempts and zero automatic retries.
- Chromium 48/48 and WebKit 48/48 homepage density cases passed (320/390/768px, 100%/200% text, eight scenarios). Every primary action retained a 44px target; no horizontal overflow, client exception, API call, off-origin call, or write occurred. These are browser captures, not native-device evidence.
- Current static Parent/Teacher `mobile:store:check` passed. It does not prove signing, archive, device, TestFlight, or App Review acceptance.
- General role-QA accounts passed fake-data/tenant/role scope verification, but the saved password failed authentication. No identities were reset. Separate reserved App Review Parent and Teacher credentials authenticated successfully; their scoped navigation-only production checks are being prepared.
- Initial full gate stopped on a stale exact-source test after adding the approved-report restriction. The assertion now requires both original restrictions and the additional lock; focused tests pass. The complete gate is being rerun, not bypassed.
- Final local production gate passed: Prisma generation, ESLint, TypeScript, all **1,967 tests**, and optimized Next.js build (166 static pages). Independent final review found no remaining blocker in this wave.
- Baseline authenticated production checks passed **Parent 10/10 and Teacher 10/10** across phone/desktop navigation with strict write blocking (only login/session heartbeat allowed). Both accounts passed the full isolated App Review runtime scope check. Deployment and post-release checks remain required.

Still actionable after this wave: older parent-record continuation, billing date/draft context safety, complete Team Permissions directory pagination, automation draft recovery, and remaining cross-screen navigation checks. These are not labeled human-only or complete.

### PR review corrections before merge

- Both unsigned Parent and Teacher macOS CI compile/public-launch checks passed on the initial PR head. Signing, archive, physical device, authenticated native behavior, and TestFlight were not performed.
- Review caught readable-versus-writable FTE school scope for directors with multiple grants. The editor now receives only schools accepted by the existing save guard, including its history and prefills. A readable secondary-school deep link stays read-only without silently opening the primary school. Executive capability remains independent of workspace layout.
- Parent date grouping and display now prefer the selected family's school timezone over the shell default. A real-component fake-data browser regression exercises two reports around midnight in New York and Tokyo.
- These corrections require fresh focused/browser and full production validation before the PR can merge. The protected review-conversation gate is not bypassed.
- Corrected code passed the full gate: lint, types, **1,968 tests**, and optimized production build. The real-component browser harness passed again, including director picker locking and selected-family timezone day counts. Independent read-only review found no blocker. Exact deployment and post-release verification are still required.
