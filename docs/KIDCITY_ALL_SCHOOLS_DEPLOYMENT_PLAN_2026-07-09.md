# Kid City USA All-Schools Deployment Readiness Plan

Date: July 9, 2026

Audience: Product, engineering, QA, customer success, operations, Kid City USA corporate leadership

Decision: The Bee Suite is technically deployable for controlled parallel rollout. It is not ready for every remaining Kid City USA school to cut over from ProCare as the sole operating system. Kokomo can remain live. All other schools must pass the readiness gates in this plan before parent payments, parent portal access, kiosk operation, or ProCare retirement are enabled.

## Evidence Reviewed

Local validation on July 9, 2026:

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: pass, 392 tests.
- `npm run build`: pass, Next.js 16.2.6 production build.
- `npm audit --omit=dev`: pass, 0 vulnerabilities.
- `npm run test:api`: pass, 126 method checks across 112 routes.
- `npm run pilot:check`: ready with warnings, 0 failures, 7 warnings.
- `npm run test:smoke` with local production build: fail on `/check-in` smoke expectation. The route now redirects unauthenticated users to the director login copy, so this appears to be stale smoke coverage, not a kiosk product failure.

Current production data snapshot:

- Active rollout schools in readiness check: 70.
- Rollout centers with setup gaps: 70.
- Active rollout centers with no classrooms: 68.
- Active rollout centers with no imported families: 67.
- Active rollout centers with no imported children: 67.
- Longmont has 349 families and 514 children but 160 children lack classroom assignments, and no guardian login users or guardian PINs are linked.
- Kokomo has 7 families, 8 children, 12 classrooms, 6 staff profiles, 11 guardian logins, and 12 guardian PINs, with 1 child still missing classroom assignment.
- Only 1 center has a Stripe connected account recorded and marked ready.
- There are 60 open invoices totaling $21,074.00.
- There are 22 processed Stripe webhook events.
- There are 4,399 integration delivery records, with 792 still pending.
- There are 10,180 notifications, with 10,124 unread.
- There are 0 calendar events, 0 emergency drill logs, 0 medication logs, and 0 compliance tasks.
- There are 0 message templates, despite communications and delivery infrastructure being present.
- There is 1 ProCare import batch marked `processing`.

External references checked:

- Supabase changelog: https://supabase.com/changelog
- Stripe Dahlia changelog: https://docs.stripe.com/changelog/dahlia
- Stripe go-live checklist: https://docs.stripe.com/get-started/checklist/go-live
- Stripe Accounts v2 documentation: https://docs.stripe.com/connect/accounts-v2

## Executive Readiness Summary

The app foundation is strong. Core code, schema, route coverage, RBAC, billing guardrails, Stripe foundations, Supabase storage/auth, public inquiry routing, parent/teacher/director/executive portals, reports, documents, and operational modules exist and pass automated validation.

The rollout is blocked by operational readiness, not by the main build. Most remaining schools are currently shell centers with director access grants, but without rooms, children, guardians, parent accounts, tuition setup, payment setup, messaging templates, calendar/compliance setup, or validated imports.

Recommended rollout mode:

1. Keep Kokomo live.
2. Use Longmont as the next controlled data/payment/import validation school.
3. Run the next 12-school wave in parallel with ProCare only after school setup, Stripe readiness, import validation, and role smoke credentials are complete.
4. Do not retire ProCare for any additional school until that school has 10 operating days of clean attendance reconciliation, 100% billing balance validation, payment routing approval, and no P0/P1 issue.

## P0/P1 Loose Ends Before Scale

P0 rollout blockers:

- All-school data readiness is not present: 67 of 70 rollout centers have no imported families or children.
- Classroom readiness is not present: 68 active rollout centers have no classrooms.
- Stripe readiness is not present: only 1 center is marked ready for parent payment routing.
- Parent access is not ready: Longmont and Holly Hill have guardians but no linked parent/guardian login users; Longmont also has no guardian PINs.
- ProCare import validation is not complete for each school; one import batch is currently marked `processing`.
- Compliance/calendar operating data is empty for launch-critical use: no calendar events, drills, medication logs, or compliance tasks.

P1 pre-scale blockers:

- Message templates are empty; directors will have no standardized launch, billing, parent, staff, FTE, or incident communication templates.
- Notification backlog is high; unread counts need cleanup, archiving, or a first-launch reset strategy.
- Local browser smoke test has stale `/check-in` assertion and must be updated before it can be trusted as a release gate.
- Production smoke-test credentials and linked parent/guardian test accounts are still required for each rollout role.
- Staging, uptime/error monitoring, Supabase advisor review, and backup restore drill are documented as required but not verified as complete.
- MFA for executive/admin users remains undecided or unimplemented.
- Public/sensitive mutation route rate limiting is not universal.

## Module Audit

| Module | Status | Classification | Rollout loose end |
| --- | --- | --- | --- |
| Enrollment | Needs Improvement | Operational Improvement | Pipeline exists, but most schools have not imported real enrollment data; 21,272 of 22,462 leads remain `NEW_INQUIRY`. |
| Family Management | Critical | Operational Improvement | Only 3 rollout centers have any families; parent linking and validation must be completed per school. |
| Student Profiles | Critical | Operational Improvement | Longmont has 160 children without classrooms; Kokomo has 1. Most schools have no children imported. |
| Billing | Critical | Operational Improvement | Invoices and ledgers exist, but tuition plans, balances, discounts, subsidies, and school-specific policies are not loaded broadly. |
| Payments | Critical | Operational Improvement | Checkout/webhooks pass tests, but parent payments must remain blocked until Stripe and disclosures pass per school. |
| Stripe Connect | Critical | Operational Improvement | Only 1 center is marked connected/ready. Every school needs payout onboarding and requirements check. |
| Attendance | Needs Improvement | Operational Improvement | Attendance/check logs exist, but school-by-school parallel validation is missing. |
| Check In | Needs Improvement | Bug, QA Technical Debt | Kiosk code exists; smoke test route expectation is stale; guardian PIN/QR rollout incomplete. |
| Check Out | Needs Improvement | Operational Improvement | Late pickup/signature workflows exist, but per-school tablet validation is missing. |
| Messaging | Needs Improvement | Operational Improvement | Messaging exists; message templates count is 0 and real-family delivery validation is incomplete. |
| Notifications | Needs Improvement | Technical Debt | Notification center exists; backlog/unread cleanup and role preference defaults need launch policy. |
| Calendar | Missing Data | Operational Improvement | Calendar UI/sync foundations exist; there are 0 saved calendar events. |
| Staff | Needs Improvement | Operational Improvement | Staff module exists; most rollout centers have only shell staff records, and one has no staff. |
| Classrooms | Critical | Operational Improvement | 68 rollout centers have no classrooms. |
| Ratios | Needs Improvement | Operational Improvement | Ratio engine is tested, but classroom/ratio rules are not configured for most schools. |
| Reports | Needs Improvement | Operational Improvement | Reports/FTE exist; final Google Sheet reconciliation and school validation are incomplete. |
| Licensing | Missing Data | Operational Improvement | Configuration UI exists; no compliance tasks or drill logs are present. |
| Medical | Needs Improvement | Operational Improvement | Medical/allergy models exist; ProCare medical field validation must be confirmed before cutover. |
| Documents | Needs Improvement | Operational Improvement | 180 documents exist; per-school required document checklists and upload workflows need validation. |
| Files | Needs Improvement | Operational Improvement | Supabase Storage is configured; media review queue has pending items and school file retention needs training. |
| Executive Dashboard | Needs Improvement | UX Improvement | Executive views exist; rollout scoring should surface setup gaps, payment readiness, adoption, and blockers by wave. |
| Location Dashboard | Needs Improvement | Operational Improvement | Dashboards exist but are only useful after imported school data and calendar/compliance setup. |
| Family Dashboard | Needs Improvement | Operational Improvement | Parent portal exists; only 14 active parent users are present. |
| Director Dashboard | Needs Improvement | Operational Improvement | Strong workflow surface, but directors need per-school setup and certification before scale. |
| Permissions | Needs Improvement | Technical Debt | RBAC/access grants are strong and no active non-parent users lack grants; granular editor and MFA remain. |
| Audit Logs | Complete | Needs Improvement | 1,039 logs exist; add operational review cadence and support incident linkage. |
| Imports | Critical | Operational Improvement | ProCare import flow exists; final real exports and validation are the main rollout blocker. |
| Exports | Needs Improvement | Operational Improvement | Export packages exist; licensing/accounting export acceptance must be tested by school. |
| Integrations | Needs Improvement | Operational Improvement | Integration records exist, but tenant credentials and provider-specific go-live checks are incomplete. |
| Google | Needs Improvement | Operational Improvement | Google Sheets/Calendar support exists; final FTE and calendar reconciliation are incomplete. |
| Stripe | Critical | Operational Improvement | Platform config is present; Accounts v2 readiness must be proven per school. |
| Supabase | Needs Improvement | Technical Debt | Auth/storage/database pass; run advisors and verify Data API grants after every schema change. |
| Authentication | Needs Improvement | Technical Debt | Login, reset, sessions, device sessions, and rate limit exist; MFA and full invite workflow remain. |
| Email | Needs Improvement | Operational Improvement | SendGrid deliveries exist; domain/sender authentication and real-family delivery validation remain. |
| SMS | Needs Improvement | Operational Improvement | Twilio routes and consent handling exist; compliance, approved sender, and school launch copy remain. |
| Printing | Needs Improvement | UX Improvement | Billing print actions exist; printer/browser workflow and receipt printer support must be validated. |
| Receipt Generation | Needs Improvement | Operational Improvement | Ledger/payment printouts include school EIN where saved; receipt policy and tax/EIN completeness need review. |
| Invoices | Needs Improvement | Operational Improvement | Invoice creation exists; invoice cadence, numbering, due dates, and balance reconciliation must be school-approved. |
| Recurring Billing | Critical | Operational Improvement | Scheduler exists; only 5 tuition plans are present and school tuition matrices are not loaded broadly. |
| Late Fees | Missing Setup | Operational Improvement | Late pickup exists; late payment fee policy/configuration must be loaded and approved per school. |
| Payment Plans | Needs Improvement | Operational Improvement | Registration/deposit helpers exist; installment/payment-plan policy needs product and accounting approval. |
| Online Registration | Needs Improvement | Operational Improvement | Registration page/API exists; no form submissions are present in current data snapshot. |
| Waitlists | Needs Improvement | Operational Improvement | Waitlist model/page exists with 10 entries; priority rules and school adoption need validation. |
| Tour Scheduling | Needs Improvement | Operational Improvement | Tours exist with 25 records; Google Calendar and reminder validation are incomplete. |
| Role Management | Needs Improvement | Technical Debt | Role model and access grants exist; granular permissions editor and invite approvals remain. |
| Search | Complete | UX Improvement | Scoped search exists; tune result ranking after real data import. |
| Global Search | Complete | UX Improvement | Global search route covers family, child, guardian, lead, tour, invoice, and payment. |
| Quick Actions | Needs Improvement | UX Improvement | Command menu exists; add rollout-specific quick actions for import, invite, payment readiness, and support. |
| UI | Needs Improvement | UX Improvement | Broad UI exists; continue role walkthroughs after real school data lands. |
| UX | Needs Improvement | UX Improvement | Good role separation; needs director stress testing with 20+ schools and real support load. |
| Navigation | Complete | UX Improvement | Role-aware nav exists; add launch-specific entry points for school readiness and support. |
| Mobile Experience | Needs Improvement | UX Improvement | Teacher/parent PWA flows exist; native push/offline sync are V2. |
| Desktop Experience | Complete | UX Improvement | Desktop dashboards and workbenches build successfully. |
| Performance | Needs Improvement | Technical Debt | Build passes; monitor production function latency under multi-school traffic before scale. |
| Accessibility | Needs Improvement | Technical Debt | Basic semantic controls exist; run formal keyboard/screen-reader pass on parent, kiosk, billing, and teacher flows. |
| Error Handling | Needs Improvement | Technical Debt | API logging/redaction exists; add production error monitoring and support triage dashboard. |
| Edge Cases | Needs Improvement | Technical Debt | Many guardrail tests exist; add wave-level scenario tests for wrong-school, duplicate import, failed Stripe, and custody restrictions. |
| Settings | Needs Improvement | Operational Improvement | Settings surfaces exist; per-school setup data remains incomplete. |
| School Setup | Critical | Operational Improvement | Setup command center exists; every rollout center still has setup gaps. |
| Multi-location Functionality | Needs Improvement | Operational Improvement | Corporate/rollup views exist; rollout scoring and support status need stronger operational display. |
| Corporate Functionality | Needs Improvement | Operational Improvement | Corporate billing/admin exist; corporate support SOP and readiness dashboard need completion. |

## Prioritized Engineering Roadmap

### P0 - Before Any More Cutovers

1. Fix local browser smoke test for `/check-in` director-login redirect copy.
2. Add production smoke credentials for executive, director, billing, teacher, parent, and kiosk workflows.
3. Add a rollout readiness dashboard showing each school: import status, rooms, staff, families, children, parent users, guardian PINs, Stripe account, billing validation, support blockers, and signoff status.
4. Clear or close the stuck ProCare import batch, then make import status visible to operators.
5. Add automated school readiness gates that block parent invites, checkout, and kiosk go-live when required data is missing.
6. Add universal rate-limit middleware or route wrappers for all public/sensitive mutation routes.
7. Add production error/uptime monitoring and escalation routing.
8. Run Supabase advisors and confirm Data API grants/RLS after latest migrations.
9. Complete backup restore drill in a safe environment.

### P1 - Before Parent Payments At Any New School

1. Complete Stripe Connect status refresh and requirements display for every school in the wave.
2. Add school-specific payment readiness lock: no connected account, no checkout.
3. Confirm webhook endpoint is live-mode and reconciles all payment states.
4. Finalize refund, dispute, duplicate payment, ACH return, card recovery, and parent disclosure SOPs.
5. Add payment readiness smoke test per school: setup session, checkout session, webhook, invoice status, ledger entry, receipt print.
6. Load tuition plans, recurring assignments, discounts, subsidies, late fees, and opening balances.

### P1 - Before Parent Portal At Any New School

1. Link guardian users to families.
2. Generate guardian PINs and QR cards.
3. Verify custody, medical, billing, media, and document visibility with test users.
4. Send parent invite only after director signs off on family data and balances.
5. Create standard parent welcome, ACH setup, document request, and billing support templates.

### P1 - Before Classroom/Kiosk Go-Live

1. Load classrooms, age groups, ratios, schedules, and teacher assignments.
2. Run tablet/kiosk smoke with real classroom data.
3. Validate check-in, check-out, duplicate prevention, late pickup, authorized pickup warning, and staff clock.
4. Validate end-of-day attendance reconciliation against ProCare for 10 operating days.

### P2 - Stabilization

1. Add formal accessibility pass and fixes.
2. Add notification backlog cleanup/archive controls.
3. Add better quick actions for directors and implementation specialists.
4. Add deeper report exports for licensing, payroll review, and corporate daily rollout summaries.
5. Add integration health dashboard for SendGrid, Twilio, Google, Stripe, Supabase, and OpenAI.

## Deployment Rollout Plan

### Phase 0: Freeze And Prove Foundation

Exit criteria:

- Production build pipeline passes.
- Browser smoke test is trusted and green.
- Monitoring is active.
- Supabase advisor/security review is complete.
- Backup restore drill is complete.
- Support escalation owner and incident process are assigned.
- Payment policy and SMS compliance have written approval.

### Phase 1: Longmont Controlled Validation

Exit criteria:

- ProCare export imported with evidence packet.
- Active child, family, guardian, classroom, staff, billing, and balance counts match ProCare or approved exceptions.
- All children have classroom assignment or documented reason.
- Parent users and guardian PIN/QR credentials exist.
- Stripe connected account is ready, but payments remain gated until billing signoff.
- Director, teacher, billing, parent, and kiosk smoke tests pass.

### Phase 2: First 12-School Parallel Wave

Exit criteria per school:

- School profile, license, classrooms, capacity, ratios, staff, and schedules complete.
- Families, children, guardians, emergency contacts, pickups, medical/allergy data, documents, and billing imported and validated.
- Director and staff trained.
- Parent portal held until family data is verified.
- Payments held until Stripe and billing pass.
- ProCare remains source of truth.

### Phase 3: Parent Portal And Payments By School

Exit criteria:

- Parent portal activation target: 70%+ before ProCare retirement, 85%+ by day 30.
- Payment method setup target: 75%+ of eligible paying families before autopay launch if autopay is required.
- Billing reconciliation: 100% for balances, tuition plans, credits, subsidies, and open invoices.
- Stripe readiness: account ready, charges enabled, payouts enabled, webhook tested.

### Phase 4: ProCare Retirement Decision

Mandatory criteria:

- 10 consecutive operating days with 99%+ attendance reconciliation.
- 100% billing reconciliation.
- 100% active classroom roster match.
- No unresolved P0/P1 issues.
- No critical bug for 14 calendar days.
- Director, billing/finance, operations, customer success, technical owner, and executive sponsor sign off.

## Customer Support Readiness Checklist

- Create support queue categories: login, import, roster, billing, payment, kiosk, parent portal, teacher tablet, documents, messaging, compliance, reports.
- Define P0/P1/P2/P3 response owners and SLAs.
- Prepare scripts for wrong-family, wrong-school, payment misrouting, failed login, parent invite, kiosk failure, and duplicate import.
- Create internal support macros for school name, user email, role, page URL, timestamp, screenshot, expected/actual, and severity.
- Create escalation paths for Stripe, Supabase, Vercel, SendGrid, Twilio, Google, and Kid City corporate.
- Add daily support review during each rollout wave.
- Train support to avoid pasting child, custody, medical, billing, or payment data into tickets.
- Prepare rollback/disable instructions for parent payments, parent portal invites, kiosk, public inquiry embed, and SMS.

## Director Training Readiness Checklist

- Director can log in from `/directors`.
- Director sees only assigned school data.
- Director verifies school profile, rooms, ratios, capacity, hours, and calendar.
- Director verifies staff roster, roles, classroom assignments, credentials, and staff kiosk codes.
- Director verifies family, child, guardian, pickup, custody, medical, allergy, and document data.
- Director validates attendance, check-in, check-out, late pickup, and pickup warning workflows.
- Director validates billing preview, tuition, balances, invoices, statements, and payment disclosures.
- Director sends no parent invites until data and billing are approved.
- Director completes daily parallel-operation reconciliation.
- Director knows support escalation and stop conditions.

## Corporate Support Readiness Checklist

- Corporate dashboard tracks all schools by phase, wave, setup status, import status, payment status, training status, support status, and go/no-go.
- Corporate can see all assigned schools and no unauthorized tenants.
- Corporate can refresh Stripe account readiness and see blockers.
- Corporate can export rollout reports for leadership.
- Corporate has a daily wave meeting agenda and blocker board.
- Corporate has payment, data, support, and technical owners assigned.
- Corporate has a final ProCare retirement approval workflow.

## Documentation Still Needed

- Per-school rollout packet template with school-specific data fields.
- Payment policy and disclosure approval packet.
- Stripe payout troubleshooting guide for directors and corporate.
- Parent portal launch communication kit.
- SMS consent and opt-out launch guide.
- School-specific ProCare export checklist by region/state.
- First-week support runbook with screenshots and escalation contacts.
- Accessibility test checklist.
- Monitoring and incident response runbook with actual tool links.

## Videos Still Needed

- Director daily workflow: dashboard, family data, attendance, billing, documents, messages.
- Teacher workflow: roster, attendance, daily reports, media, incidents, offline/poor connectivity.
- Parent workflow: login, app install, messages, documents, billing, ACH setup, kiosk PIN/QR.
- Billing admin workflow: tuition plans, invoices, payment methods, dunning, reconciliation, receipts.
- Corporate workflow: rollout dashboard, Stripe status, imports, reports, support escalation.
- Front desk/kiosk workflow: guardian PIN/QR, signature, late pickup, authorized pickup warning, staff clock.
- ProCare import validation workflow.

## Help Articles Still Needed

- "Why your school still uses ProCare during parallel rollout."
- "How directors verify a roster after import."
- "How to fix a child without a classroom."
- "How to invite parents safely."
- "How to set or reset guardian kiosk PINs."
- "How to verify Stripe payout readiness."
- "How to handle a failed ACH/card payment."
- "How to print receipts and ledger statements."
- "How to report a wrong-family or wrong-school issue."
- "How to use parent portal without enabling payments."
- "How SMS opt-in and STOP/START work."

## Automation Opportunities

- Nightly school readiness scoring and email digest.
- Automatic block on parent invites when required family/child/billing fields are missing.
- Automatic block on checkout when Stripe Connect readiness is not `ready`.
- ProCare import evidence packet generation.
- Daily discrepancy queue for attendance, rosters, billing, parent activation, and support tickets.
- Stripe requirements refresh cron.
- Notification backlog archival and launch reset policy.
- Message template seeding for every school.
- Director checklist auto-completion from real app evidence.
- Parent activation and ACH setup reminders.
- Support ticket creation from P0/P1 readiness failures.

## Version 2 Deferrals

These should wait until after the Kid City USA rollout is stable:

- Native iOS/Android apps beyond current PWA/Capacitor parent shell.
- Native push notifications.
- Full no-code automation marketplace.
- Payroll-provider exports and accounting integrations.
- CACFP, meal planning, curriculum, developmental milestones, and portfolios.
- Multi-state licensing export packs beyond current configurable readiness tools.
- Public API and third-party app marketplace.
- Advanced AI forecasting, automated enrollment optimization, and parent satisfaction intelligence.
- Full custom-domain self-service activation for every franchisee.
- Support impersonation, unless a formal approval/audit workflow is built first.

## Final Go/No-Go Standard

No remaining school should leave ProCare until:

- School data is trusted.
- Staff can operate attendance and classroom workflows.
- Billing matches ProCare.
- Stripe routing is correct.
- Parents only see their own family.
- Directors can run the school without daily engineering help.
- Support is staffed and trained.
- Monitoring is active.
- P0/P1 issues are zero.
- Corporate signs off in writing.

