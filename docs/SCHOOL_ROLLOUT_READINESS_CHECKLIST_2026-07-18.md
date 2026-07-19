# BEE Suite School Rollout Readiness Checklist

Audit date: July 18, 2026

Purpose: the go/no-go checklist for bringing additional schools onto The BEE Suite. Complete it separately for every school. A school remains in ProCare and does not begin live parent billing until every **GO-LIVE BLOCKER** is checked and the school, corporate, and technical owners sign off.

Status legend:

- `[ ]` Open, not yet evidenced, or requires school/vendor signoff.
- `[x]` Confirmed during the July 18 technical audit.
- **GO-LIVE BLOCKER** means the school must not cut over while the item is open.

## Current go/no-go summary

**Current decision: NO-GO for the wider school wave. Kokomo may continue normal production use.**

The platform health check, database connection, unit tests, typecheck, lint, production access redirects, core configuration, Supabase Auth, storage, and Stripe configuration passed. The current production-data readiness report found 69 of 70 active centers with one or more full-rollout gaps. Among the 13 schools in the existing corporate rollout wave, Kokomo is the only school with no core data/access gaps.

### Immediate blockers to clear first

- [ ] **GO-LIVE BLOCKER — Select the actual first wave.** Do not treat all 70 active center records as ready schools. Name the schools going live, their dates, launch owner, school owner, data owner, billing owner, and support owner.
- [ ] **GO-LIVE BLOCKER — Finish each selected school's data setup.** Required minimum: classrooms, staff, families, children, classroom assignments, guardians, director access, and reconciled balances.
- [ ] **GO-LIVE BLOCKER — Resolve Longmont's imported-data gaps.** Assign 160 children to classrooms, link parent/guardian users, and establish the approved guardian PIN rollout before parent invitations or kiosk use.
- [ ] **GO-LIVE BLOCKER — Import and validate data for the other selected schools.** The July 18 report shows no classrooms and no imported families or children for Cordera, Beach Blvd, Oakleaf, Lees Summit, Canton, Pisgah Forest, Corpus Christi, Garland, Granbury, and North Richland Hills. Holly Hill has one family/child but no classroom, one unassigned child, and no linked guardian login.
- [ ] **GO-LIVE BLOCKER — Verify Stripe Connect per school.** Platform Stripe configuration is present, but that does not prove each school's connected account can accept charges and payouts.
- [ ] **GO-LIVE BLOCKER — Complete credentialed role smoke tests.** Use real scoped accounts for corporate, director/billing, teacher, and linked parent/guardian roles at each selected school.
- [ ] **GO-LIVE BLOCKER — Approve the cutover and rollback plan.** ProCare remains the source of truth until reconciliation, billing preview, training, support coverage, and written signoff are complete.
- [x] Resolve the production smoke script's stale CRM assertion. `/crm-leads` correctly redirects to the director login, and `npm run test:smoke` passed against production after recognizing the newer role-specific login wording on July 19, 2026.

## Audited rollout-wave data snapshot

This is a point-in-time setup signal, not final school signoff. Re-run `npm run pilot:check -- --all` after every import/setup pass.

| School | Current signal | July 18 observed gaps |
| --- | --- | --- |
| Kokomo | Continue live; protect production data | No core readiness gaps in the automated report. Continue regression and operational signoff. |
| Longmont | Not ready | 160 children without classrooms; 674 guardians but 0 linked logins and 0 PINs. |
| Holly Hill | Not ready | No classrooms; 1 child unassigned; no linked guardian login. |
| Cordera | Not ready | No classrooms, families, or children. |
| Beach Blvd | Not ready | No classrooms, families, or children. |
| Oakleaf | Not ready | No classrooms, families, or children. |
| Lees Summit | Not ready | No classrooms, families, or children. |
| Canton | Not ready | No classrooms, families, or children. |
| Pisgah Forest | Not ready | No classrooms, families, or children. |
| Corpus Christi | Not ready | No classrooms, families, or children. Confirm whether this is the school previously labeled Corpus Christi 2. |
| Garland | Not ready | No classrooms, families, or children. Confirm the correct school email before invitations. |
| Granbury | Not ready | No classrooms, families, or children. |
| North Richland Hills | Not ready | No classrooms, families, or children. |

## 1. Wave ownership and cutover control

- [ ] **GO-LIVE BLOCKER** Record school name, center ID, launch date/time, and intended live modules.
- [ ] **GO-LIVE BLOCKER** Assign one named corporate launch owner and one director signoff owner.
- [ ] Assign data/import, billing/Stripe, technical release, training, and first-week support owners.
- [ ] Publish the escalation contact and expected response path for urgent school issues.
- [ ] Define stop conditions: data mismatch, unauthorized access, failed payout/payment reconciliation, missing training, unavailable support owner, or unresolved critical defect.
- [ ] Define rollback: pause invitations/billing, keep or return daily operations to ProCare, preserve new BEE Suite records, and document reconciliation ownership.
- [ ] Schedule morning readiness, midday issue review, and end-of-day reconciliation during launch week.

## 2. School identity, structure, and access

- [ ] **GO-LIVE BLOCKER** Confirm official school name, address, phone, email, EIN/tax receipt details, time zone, and notification recipients.
- [ ] **GO-LIVE BLOCKER** Confirm center ID, CRM location ID, tenant, organization, owner group, active status, and public inquiry routing.
- [ ] Confirm classrooms, age groups, capacities, licensing ratios, hours, and schedules.
- [ ] Confirm director, assistant director, billing, and corporate access grants.
- [ ] **GO-LIVE BLOCKER** Test that school users cannot see another school's families, children, staff, billing, documents, messages, reports, or integrations.
- [ ] Record who may add/remove locations, create users, reset passwords, import data, edit FTE reports, issue refunds, and manage billing.
- [ ] Decide and communicate the executive/admin MFA policy.

## 3. ProCare export, import, and reconciliation

- [ ] **GO-LIVE BLOCKER** Obtain unencrypted ProCare CSV exports through the approved secure handoff; never collect bank credentials or full payment details by email or text.
- [ ] Archive untouched source exports with school, export date, source, and retention owner.
- [ ] Import families, guardians, children, pickups, emergency contacts, classrooms, staff, schedules, tuition, discounts/subsidies, balances, credits, invoices, payments, documents, attendance history if required, and 2026 inactive records required for retention.
- [ ] Preview the import and review mappings, duplicates, exclusions, counts, and balance effects before applying it.
- [ ] Resolve duplicate people, test records, centerless families, cross-center classroom links, and children without classrooms.
- [ ] **GO-LIVE BLOCKER** Compare ProCare and BEE Suite totals for families, children, guardians, staff, classrooms, balances, credits, and open invoices.
- [ ] Spot-check at least 10 families or all families when the school has fewer than 10.
- [ ] Director verifies rosters, schedules, allergies/medical notes, custody warnings, pickups, documents, tuition, discounts, balances, and history.
- [ ] Save the import batch ID, comparison evidence, exceptions, corrections, and director/corporate signoff.
- [ ] Keep ProCare as source of truth until the school passes every cutover check.

## 4. Accounts, parent invitations, and kiosk readiness

- [ ] **GO-LIVE BLOCKER** Create and test the director/billing accounts that will be used on launch day.
- [ ] Create and test teacher accounts against the final staff/classroom roster.
- [ ] Link at least one test guardian to a real test family and verify parent setup, password creation/reset, and correct child visibility.
- [ ] Confirm guardian contact details, billing responsibility, custody restrictions, authorized pickups, and communication preferences.
- [ ] Decide whether guardian PINs are imported, generated, or reset by directors; communicate the process before kiosk launch.
- [ ] Test valid PIN check-in/out, invalid PIN handling, pickup authorization, custody warning, child location/classroom state, and audit trail.
- [ ] **GO-LIVE BLOCKER** Send broad parent invitations only after family data, tuition, balance, connected payments, support coverage, and director signoff are complete.
- [ ] Track invitation delivered, setup complete, payment method verified, PIN ready, bounced/failed, and needs follow-up counts.

## 5. Billing, Stripe, and accounting

- [ ] **GO-LIVE BLOCKER** Confirm the school's Stripe connected account shows charges enabled, payouts enabled, no outstanding requirements, and the intended payout schedule.
- [ ] Confirm legal business name, EIN, support contact, address, statement descriptor, receipt details, and bank payout ownership.
- [ ] Confirm tuition rates, billing cadence, discounts, subsidies, sibling/staff rates, deposits, registration fees, uniforms/products, credits, and starting balances.
- [ ] Verify recurring tuition is recurring and registration, uniforms, deposits, and adjustments remain one-time unless explicitly intended.
- [ ] Review the first billing preview family by family before creating live charges.
- [ ] Test approved payment methods, payment-method setup, webhook reconciliation, receipt, ledger update, failed-payment status, reminder/dunning path, and payout visibility.
- [ ] Test a void/correction and an approved partial refund; document who owns disputes and refunds.
- [ ] Confirm parent-facing fee/disclosure language and legal/accounting approval before enabling parent-paid processing recovery.
- [ ] Reconcile the first live billing batch and payout against Stripe and the BEE Suite before the next batch.

## 6. Role-by-role workflow smoke

- [ ] **Corporate/executive:** school filtering, KPIs, CRM, FTE submission visibility, billing oversight, reports, imports, users/grants, readiness, and audit logs.
- [ ] **Director/billing:** dashboard, leads/tours, family records, classrooms/ratios, staff, attendance, incidents, documents, messages, tuition/invoices, payments/refunds, FTE, reports, and notifications.
- [ ] **Teacher:** roster, check-in state, health check, child location, daily report, incident draft/submission, photo/media permission path, messages, and poor-connectivity recovery.
- [ ] **Parent/guardian:** setup/reset, correct child/family scope, balances/statements, payment method, payment, receipts, documents, incident acknowledgement, daily reports/media, preferences, and support request.
- [ ] **Kiosk:** center selection, guardian/staff credential handling, check-in/out, authorization warnings, duplicate action protection, and visible audit history.
- [ ] **Public/CRM:** inquiry form, correct school routing, confirmation, lead visibility, follow-up, tour, application, and enrollment handoff.
- [ ] Test desktop and mobile layouts on the devices the school will actually use.
- [ ] Record every defect with severity, owner, workaround, retest evidence, and whether it blocks launch.

## 7. Communications, integrations, and scheduled jobs

- [ ] Verify school sender/from/reply-to details and delivery for parent invitations, password reset, daily reports, documents, billing, incidents, announcements, and CRM follow-up.
- [ ] Verify email domain authentication, bounce handling, suppression handling, and the school support reply path.
- [ ] Verify SMS consent, opt-out, inbound routing, delivery status, and school-specific sender setup if SMS is enabled.
- [ ] Verify storage upload/download permissions for child photos, family/staff documents, exports, and signed URLs.
- [ ] Verify required calendar, Google Sheets, signature, webhook, social, or other school-specific integrations.
- [ ] Confirm cron ownership and production execution for tuition billing, autopay, dunning, tuition reminders, FTE reminders, document expiration, campaign scheduling, and integration retries.
- [ ] Validate daily report delivery and recipient settings with approved real-family test addresses before wider enablement.

## 8. Security, privacy, continuity, and release gate

- [ ] **GO-LIVE BLOCKER** Rotate any production/API credentials previously shared in chat, screenshots, tickets, or plain text.
- [ ] Run the current Supabase security/advisor review and reconcile RLS/table-access documentation after the latest schema changes.
- [ ] **GO-LIVE BLOCKER** Confirm automated production backups and complete a restore drill in a safe environment before the multi-school cutover.
- [ ] Confirm privacy, terms, custody/medical-data handling, photo/media consent, payment disclosures, retention, deletion-request, and incident/document policies.
- [ ] Confirm error and uptime monitoring, alert recipients, severity definitions, and after-hours escalation.
- [ ] Validate releases in staging or an approved safe test tenant before production promotion.
- [x] `npm test` passed: 421 tests, 0 failures on July 18.
- [x] `npm run typecheck` passed on July 18.
- [x] `npm run lint` completed with 0 errors and 3 warnings on July 18.
- [ ] Run `npm run vercel-build` against the final intended release commit.
- [ ] Deploy the focused release and confirm Vercel status is Ready.
- [x] Production `/api/health` returned OK with database connected on July 18.
- [ ] Authenticated `/api/system/readiness` is healthy for an authorized launch owner.
- [x] `npm run test:smoke` passed against `https://thebeesuite.io` on July 19, 2026 after updating the director-login assertion.
- [ ] Review production logs and complete the changed live workflows after deployment.

## 9. Training and first-week support

- [ ] Train corporate users on multi-school oversight, access, imports, FTE, billing visibility, readiness, and escalation.
- [ ] Train directors on daily operations, parent support, billing exceptions, refunds, incident/document review, staff/time cards, reports, and escalation.
- [ ] Train teachers on tablet login, roster, attendance, health, location moves, daily reports, incidents, photos, messages, and offline recovery.
- [ ] Give families short setup, payment, PIN/check-in, notification, privacy, and support instructions.
- [ ] Provide role-specific quick guides and identify what remains in ProCare during parallel operation.
- [ ] Staff launch-day and first-week support; publish response targets and the issue intake method.
- [ ] Hold a director check-in after day 1, first billing, and week 1; record follow-up owners and dates.

## 10. Final per-school go-live approval

- [ ] **GO-LIVE BLOCKER** Automated readiness report has no unresolved gap for this school.
- [ ] **GO-LIVE BLOCKER** Data/import reconciliation evidence is attached and approved.
- [ ] **GO-LIVE BLOCKER** Role/access isolation and all required workflows passed.
- [ ] **GO-LIVE BLOCKER** Stripe, billing preview, payment reconciliation, refund/dispute ownership, and payout readiness passed if payments are enabled.
- [ ] **GO-LIVE BLOCKER** Training, support coverage, stop conditions, and rollback plan are acknowledged.
- [ ] Director signoff — name/date: ______________________________
- [ ] Corporate signoff — name/date: _____________________________
- [ ] Billing/accounting signoff — name/date: _____________________
- [ ] Technical/release signoff — name/date: ______________________
- [ ] ProCare cutover approval — date/time: _______________________

## Evidence captured in this audit

- `npm run pilot:check -- --all`: configuration and database passed; 69 of 70 active centers had at least one setup gap.
- `npm test`: 421 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: 0 errors, 3 warnings.
- Production `/api/health`: OK; database connected.
- Production `/crm-leads`: protected access redirected to `/directors?next=%2Fcrm-leads` and rendered the director login.
- Production smoke: passed on July 19, 2026 after the stale CRM/director-login expected-text assertion was updated.
