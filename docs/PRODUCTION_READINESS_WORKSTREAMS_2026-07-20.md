# Production Readiness Workstreams

Date: July 20, 2026

## Shared decision and ownership rule

The wider school wave is **NO-GO** until the per-school blockers in `SCHOOL_ROLLOUT_READINESS_CHECKLIST_2026-07-18.md` are evidenced and signed off. Kokomo may continue normal production use.

Every open item has one accountable human. Until Brenden delegates a workstream to a named teammate, **Brenden is the accountable owner**. The Codex thread is the execution owner, not the business signoff authority.

Each thread must:

1. Audit current code, data, documentation, and tests before changing anything.
2. Classify findings as `BLOCKER`, `REQUIRED BEFORE WAVE`, or `FOLLOW-UP`.
3. Implement safe in-scope fixes, add proportionate tests, and preserve unrelated dirty work.
4. Record evidence, unresolved external dependencies, a named owner, and the exact retest.
5. Stop at external approvals, live customer communications, production data mutation, payment enablement, credential rotation, or production deployment unless separately authorized.
6. Never declare a school ready by itself. Final readiness requires director, corporate, billing/accounting, technical/release, and ProCare cutover signoff where applicable.

## Workstream register

| # | Workstream | Accountable human | Codex execution outcome | Production-ready exit gate |
|---|---|---|---|---|
| 1 | User and role permissions | Brenden until delegated | Permissions and tenant isolation audited and fixed | Credentialed executive, director/billing, teacher, parent, kiosk, and public role tests pass with no cross-school exposure |
| 2 | User experience and flows | Brenden until delegated | Critical end-to-end flows work on real target devices | No launch-blocking dead ends; desktop/mobile workflows pass with evidence and accessible recovery states |
| 3 | School setup and onboarding | Brenden until delegated | Per-school identity, structure, access, and setup are complete | Selected wave has named owners; classrooms, staff, families, children, assignments, guardians, access, and configuration reconcile |
| 4 | ProCare migration | Brenden until delegated | Repeatable preview/import/reconcile/cutover process is proven | Secure exports, dry run, mappings, duplicates, counts, balances, spot checks, batch evidence, director/corporate approval; ProCare stays source of truth until signoff |
| 5 | Payments and Stripe Connect | Brenden until delegated | Connected-account and billing lifecycle is safe per school | Charges/payouts enabled, requirements clear, billing preview approved, payment/webhook/ledger/refund/failure/payout reconciliation tested |
| 6 | Enrollment CRM | Brenden until delegated | Inquiry-to-enrollment routing is complete and isolated | Inquiry routes to correct school, appears for correct roles, triggers approved notifications/backups, and completes tour/application/enrollment handoff |
| 7 | Parent experience | Brenden until delegated | Parent setup and daily/payment workflows are launch-safe | Linked guardian sees only correct family; setup/reset, documents, reports, incidents, preferences, support, PIN, billing, payment, and receipts pass |
| 8 | Teacher experience | Brenden until delegated | Classroom operating loop is reliable on school devices | Roster, attendance, health, location, daily reports, incidents, media permission, messages, and poor-connectivity recovery pass |
| 9 | Director experience | Brenden until delegated | Director can operate and reconcile the school | CRM, family/classroom/staff operations, attendance, incidents, documents, messaging, billing/refunds, FTE, reports, and alerts pass |
| 10 | Corporate dashboards | Brenden until delegated | Multi-school oversight is correct and actionable | School filters, KPIs, readiness, CRM, FTE, billing, imports, users/grants, reports, and audit visibility pass with correct scope |
| 11 | Communications | Brenden until delegated | Transactional email/SMS and scheduled delivery are dependable | Sender/reply path, authentication, consent/opt-out, bounce/suppression, delivery status, templates, recipients, and retry ownership are verified |
| 12 | Reporting and analytics | Brenden until delegated | Operational and corporate reports are correct and traceable | Source totals reconcile; filters/scopes/exports/FTE links pass; definitions and freshness are documented |
| 13 | Apple and Google app readiness | Brenden until delegated | Mobile distribution requirements and native workflows are release-ready | Store metadata/privacy disclosures/build/signing/deep links/push/device workflows pass; remaining store-owner actions are explicit |
| 14 | Security and compliance | Brenden until delegated | High-risk controls and policies are evidenced | Secrets rotated where needed, RLS/advisors reconciled, backup/restore drill complete, access/audit/retention/deletion/privacy/payment/custody/medical controls approved |
| 15 | Performance and QA | Brenden until delegated | Regression, load, responsiveness, and failure recovery meet launch bar | Tests/typecheck/lint/build pass; role smoke and target-device QA pass; critical defects closed; performance thresholds and evidence recorded |
| 16 | Deployment and ops | Brenden until delegated | A focused release can be promoted and operated safely | Final `vercel-build`, migrations/rollback, Ready status, health/readiness, production smoke, logs, monitoring, alerts, cron, and support escalation pass |
| 17 | Rollout and training | Brenden until delegated | Selected schools can launch with trained owners and controlled support | Wave/date/modules named; role training complete; support coverage, stop conditions, rollback, launch-week reviews, and all required signatures recorded |

## Thread execution brief

Use this prompt in each workstream chat, replacing the bracketed values:

> You own the **[WORKSTREAM]** production-readiness workstream for The BEE Suite. Brenden is the accountable human until he explicitly delegates it. Work only within this domain and avoid unrelated edits. Start from `docs/PRODUCTION_READINESS_WORKSTREAMS_2026-07-20.md`, `docs/SCHOOL_ROLLOUT_READINESS_CHECKLIST_2026-07-18.md`, and the domain-specific code/tests/docs. Audit first, then classify findings as BLOCKER, REQUIRED BEFORE WAVE, or FOLLOW-UP. Implement safe repo-scoped fixes and tests. Do not mutate production data, enable billing, rotate credentials, contact users, or deploy without separate authorization. Preserve unrelated dirty work. End with: production-ready definition, evidence completed, open items with one named owner each, external decisions required, files changed, tests run, and exact next action. The wider wave remains NO-GO unless all shared signoffs pass; Kokomo may continue normal production use.

## Today’s alignment decisions

- Select the actual first school wave, dates, and intended live modules.
- Replace “Brenden until delegated” with one named human per row; delegation must be explicit and accepted.
- Name per-school launch, director, data/import, billing/Stripe, technical release, training, and first-week support owners.
- Keep parent invitations and live billing separate from CRM/operations launch approval.
- Keep ProCare as source of truth until reconciliation, role smoke, training, rollback, support coverage, and written cutover approval are complete.
- Do not treat platform Stripe configuration as proof that a school connected account is ready for charges and payouts.
- Re-run `npm run pilot:check -- --all` after import/setup work and retain per-school evidence.
