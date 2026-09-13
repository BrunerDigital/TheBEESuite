# School UI and release evidence — September 13, 2026

This is the current web-release evidence index. Older audit dates and completed checklist boxes are historical, not proof that every school, role or native app is ready. The overall mission is **in progress**: actionable technical work remains. Primary checkout changes, unrelated PR #311, other worktrees and recoverable history remain untouched.

## Latest protected production deployment

Office UI PR [#371](https://github.com/BrunerDigital/TheBEESuite/pull/371) is deployed at main `a942b997c4dd6b32b05c42f6064e2b28a7d322a2`. Exact production `dpl_2ssNpkh3HTr5zTWA2xt6wbiEqyzi` was Ready September 13 at 22:22:18.886 UTC on all five canonical aliases listed below. Protected CI `34786163110`, CodeQL, local 2,186-test full build, 84 two-engine office cases, 308 task-panel checks and 216 focused-control observations passed. Guarded reserved Parent/Teacher production regression passed at 22:28:57.275 UTC; health was database-connected at 22:29:50.355 UTC and post-verification error/fatal and 5xx counts were empty. No product, money, identity or provider mutation was made.

The office flow itself has **local real-component proof, not authenticated management production proof**; approved management QA access remains unavailable. Evidence and exact scope: [office billing UI](OFFICE_BILLING_MOBILE_FLOW_2026-09-13.md). This distinction prevents treating deployment health as proof of every changed office workflow.

## Previous verified release

Protected PR [#370](https://github.com/BrunerDigital/TheBEESuite/pull/370), main `f1f1ca21f8345cc73b430e3d0913a65435a37213`, closes dormant new Parent product-order creation before request parsing or billing work. Existing invoices, Payments, provider webhooks and director invoicing are unchanged. The feature was not activated and no live order/payment was attempted. It follows verified Parent Updates PR [#369](https://github.com/BrunerDigital/TheBEESuite/pull/369).

Production `dpl_GcUnHjAwDq8DFf5JJLsReNgmRycj` was Ready September 13 at 21:43:11 UTC. Confirmed aliases: `thebeesuite.io`, `www.thebeesuite.io`, `the-bee-suite-beta.vercel.app`, `the-bee-suite-brunerdigital.vercel.app`, `the-bee-suite-git-main-brunerdigital.vercel.app`. Health reported database connected at 21:53:43 UTC. Post-Ready scoped error/fatal and 5xx log queries returned no entries; error-filtered build logs showed only build completion.

Candidate gate: 2,182 tests, Prisma generation, lint, TypeScript and optimized Next.js build passed. Store/static readiness passed. Protected CI `34719845254` and CodeQL passed. No admin bypass or force push was used.

The fresh synthetic graph was verified before two exact matched logins. Guarded canonical production checks passed at 21:49:39 UTC: 20 routes, 52 Parent layout checks, eight shared-shell checks, four Teacher navigation checks, four message-history outcomes, four message-layout checks, 12 report-target checks, 16 individual child-picker checks, four Updates GET outcomes and four Updates date/layout sequences. Only verified session heartbeats and six empty-body denial probes were admitted beyond the explicitly scoped read requests. No product writes, blocked requests, HTTP errors or client exceptions. General management-role QA credentials were previously rejected; they were not retried, reset or replaced. These Parent/Teacher checks do not prove authenticated director/billing/executive production behavior.

Evidence: `output/playwright/app-review-production-after-parent-updates-pr370/results.json` and `output/wave17-production-verification.log`. Exact release details: [product-order boundary](PARENT_PRODUCT_PURCHASE_GATE_2026-09-12.md) and [Parent Updates history](PARENT_UPDATES_HISTORY_2026-09-12.md).

## Printable current mobile screens

`output/pdf/BEE_Suite_Current_Mobile_UI_2026-09-13_PR370.pdf` contains 14 fake-data live browser captures from September 13, 5:44–5:49 PM America/New_York. All 14 pages were rendered and visually inspected. It covers Parent Home, Updates, Messages, Documents and Payments; Teacher Home, roster, daily log, photo, protected profile and report recipients; plus enlarged-text examples. Preserve the earlier PR #367 packet as historical evidence.

These are 390 × 844 browser views, **not** native App Store screenshots, Dynamic Type, a signed archive or physical-device evidence. Quiet synthetic states do not prove populated histories or successful mutations. Populated history, recovery and concurrency are covered separately by local fake tests.

## Completion-driving matrix

| Area | Implemented/configured | Local evidence | Current production evidence | Native/external boundary |
| --- | --- | --- | --- | --- |
| Parent Home, navigation, document/history/message surfaces | Implemented; recent compact/recovery/history corrections retained | Focused tests and both browser engines; 101-row history continuation | Reserved fake graph, canonical role navigation and date/recovery checks | Authenticated device/offline/keyboard checks remain |
| Teacher Home, role navigation, report/individual child targets and protected profile | Implemented; exact target/draft locks retained | Focused tests and both browser engines | Reserved fake Teacher navigation, 12 report-target and 16 picker checks | Camera, interrupted upload, device session lifecycle remain |
| Office Billing, Terminal, Ledger and shared task directory reflow | Implemented and deployed in protected PR #371 | 84 actual-shell cases, 308 task panels, 216 focused controls; full 2,186-test gate | Exact Ready deployment and reserved Parent/Teacher regression; office management authentication not available | See [office UI work](OFFICE_BILLING_MOBILE_FLOW_2026-09-13.md); no money/provider changes |
| Invoice calendar-date consistency | Shared pure formatter implemented across 14 display/print sites | 130 two-engine cases, four rendered Letter PDFs and full 2,191-test gate passed | Protected release next | No stored date, payment timestamp, balance or authorization changes; [date evidence](INVOICE_CALENDAR_DATE_CONSISTENCY_2026-09-13.md) |
| Role-aware Help and complete audit history | Further technical work identified | Help has denied-role links; audit viewer only filters newest 100 events | Not yet corrected | Safe scoped implementation remains; do not reduce this to a human-only blocker |
| Legacy family-balance payment attempts | Existing path still needs target-tenant, fresh authority and durable provider-attempt recovery work | Concrete code evidence; next separate financial safety wave | Not claimed repaired by the product-order gate | No test charges/refunds; no production migration required for code preparation |
| New Parent shop orders | Closed in code; no runtime activation flag; catalog remains hidden | Actual handler: malformed, foreign and concurrent attempts touch no purchase boundary | Deployed gate; ordinary-parent denial proven locally, not by live order POST | Full order/fulfillment/refund/support approval and safe implementation required before activation |
| Director/executive/support/auditor flows | Existing implementations and earlier scoped fixes retained | Further role/scenario coverage still required | General role credentials unavailable; do not infer from health | Brenden can supply an approved synthetic session through secure sign-in, not passwords in chat |
| Parent and Teacher native apps | Only intended v1 submission set; distinct projects/assets/launch paths | Static readiness passes; unsigned native evidence is tracked separately | Remote web release does not create a signed build | [Native handoff](IOS_NATIVE_VERIFICATION_AND_HANDOFF.md); no archive/TestFlight/submission claim |
| School activation and ProCare transition | Existing guarded tools/runbooks | Per-school evidence and reconciliation still required | No cutover, source deletion, invitations or rollout activation performed | Exact school owner/launch authorization remains separate |

Do not turn the technical backlog into a human-only checklist prematurely. Finish safe implementation and tests first. When the mission is actually ready for closeout, consolidate the remaining synthetic role-session, macOS/Apple Team, physical-device, legal/privacy and exact publishing approvals once, in critical-path order. Neither app is currently claimed App Store-ready or submitted.
