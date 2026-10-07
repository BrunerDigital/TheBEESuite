# BEE Suite testing handoff - October 7, 2026

## Current live version

Canonical https://thebeesuite.io is Vercel Ready on acd607dbe916856e434c93b5ad6382ff4ab46249, deployment dpl_A8rQLehdbocpJErSkCSwsmE2LEMD. Homepage rendered in the browser; health returned HTTP200 with the database connected. Error/fatal queries for the preceding hour and the subsequent15-minute test window returned no entries. Main CI and unsigned iOS native verification passed on that exact source.

Yesterday's shipped work includes agency receivables and balance follow-up (#451), historical/withdrawn-family billing access and advance payments (#450), family/billing transfer and honest school readiness (#458/#461), direct teacher operations and mobile sizing (#455-#460), and the approved public inquiry/dependency corrections (#452-#454).

## Fresh verification and prepared release

The reviewed rollout candidate was integrated into a fresh current-base checkout without touching the dirty main checkout or the original coordinator. npm run vercel-build passed: Prisma, lint, typecheck,2655/2655 tests, Next16.3.8 production compilation and180 pages. The extra cron module-mock tests passed3/3. These mocks are not PostgreSQL concurrency proof. The code candidate prevents tuition invoicing for paused/ineligible schools and unanchored multiweek schedules, keeps same-school invoice lock order consistent, and corrects succeeded PaymentIntent metadata.

The candidate remains separate from production until the designated coordinator completes protected PR checks, merge, Ready deployment and post-release verification. No manual production billing run or financial correction was performed.

Read-only login/HTTP route checks passed existing isolated billing, executive, teacher and parent test accounts. Billing invoices, multi-location dashboard, teacher portal, parent home and parent payments each returned200 without a login redirect or server-error response. The saved director test password returned401. This is authenticated server-route evidence, not a full browser interaction test or positive acceptance at Kokomo/Centennial. Local direct-database QA configuration is stale; no password or identity was changed.

The team-share guide packet was regenerated from current committed source with an explicit October7 snapshot date.15 PDFs/103 pages; text/date/hash checks and first/last page layout inspection passed. Existing synthetic screenshot assets were retained. The generator now supports --publication-date YYYY-MM-DD and defaults to the current date instead of hard-coding September2.13 focused documentation tests passed after this artifact-only change.

## What to test

1. Teacher sign-in: confirm direct classroom operations, attendance navigation and daily-report controls on your usual phone.
2. Parent portal: check home quick actions, messages and payment navigation at normal and enlarged text sizes; check draft visibility with the keyboard open.
3. Billing: review agency claims/external receipts and reconciliation, family balance filters, historical/withdrawn-family access, statements and reminder recipient preview.
4. School setup: open the family/billing transfer workflow, check required reports, preview, correction guidance and saved readiness state. The week plan and45-school worklist are in docs/SCHOOL_IMPORT_WEEK_PLAN_2026-10-06.md and docs/SCHOOL_IMPORT_WEEK_WORKLIST_2026-10-06.csv.

## Gates still requiring exact school/account evidence

A fresh read-only operational inventory confirms45 active schools (Kid City USA and Miss Honey's, excluding demo tenants and the unassigned lead queue);16 have explicit tuitionBillingEnabled=true. Neither count is a readiness approval.

Remaining school-specific items include approved reports/director confirmation and named setup operators; Kokomo access/attendance/media acceptance and exact affected examples; Centennial staff/Auth reconciliation; confirmation of Longmont/Tyler closure authority; Granbury ACH and aged/manual-review payment reconciliation; independent Storage/key recovery custody and monitoring owners; signed native builds, physical-device acceptance and public App Store links. The prior private email tracker also retains source/access/decision requests; Audrey's requested missing-items email was sent yesterday. No new outreach was sent in this closeout.

School imports, invitations, access changes, billing activation, real messages/payments, migrations, provider changes and store submission remain their individually approved operations. User business data and unrelated dirty work were preserved.
