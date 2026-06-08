# School Full-Feature Rollout Checklist

Last updated: June 8, 2026

Purpose: track everything that must be complete before a school can use the full BEE Suite feature set live: executive/admin, director operations, CRM, enrollment, FTE, ProCare cutover, attendance/kiosk, teacher workflows, parent portal, billing/payments, documents, compliance, messaging, reporting, integrations, and support.

Status legend:
- `[x]` Built, configured, or validated enough to use as a rollout foundation.
- `[ ]` Still needs build work, real school data, vendor setup, legal/accounting approval, production validation, or school signoff.

Source references:
- `docs/UPDATED_COMPLETION_CHECKLIST_2026-06-04.md`
- `docs/APP_COMPLETION_CHECKLIST.md`
- `docs/ROLE_SMOKE_TEST_REPORT_2026-06-05.md`
- `docs/OWNER_ACTION_ITEMS.md`
- `docs/KIDCITY_CUTOVER_OWNER_CHECKLIST.md`
- `docs/in-school-testing-runbook.md`
- `docs/user-feature-access-map.md`

## Definition Of All Features Live

A school is not considered fully live until all of these are true:

- [ ] Real school data is imported or manually loaded for families, guardians, children, classrooms, staff, schedules, balances, invoices, documents, and operational settings.
- [ ] Executive, director, billing, teacher, and parent/guardian users can log in with their own accounts and only see their authorized scope.
- [ ] Public inquiry, CRM, tours, enrollment, FTE, attendance, kiosk, classroom daily reports, incidents, media, messages, documents, billing, payments, notifications, and reporting have each passed a real workflow test for that school.
- [ ] Stripe connected payout onboarding, payment disclosures, refund/dispute handling, and legal/accounting approval are complete before live parent payments are enabled.
- [ ] Email, SMS, storage, calendar, sheets, webhooks, and any tenant-specific integrations needed by that school are configured and tested.
- [ ] Directors, teachers, billing staff, and families have been trained on the workflows they will use.
- [ ] Support owners, escalation paths, rollback steps, and stop conditions are documented for the school.

## Critical Path Before Any Full-Feature School Launch

- [ ] Rotate any production secrets, Supabase tokens, GitHub tokens, payment keys, email keys, SMS keys, or API credentials that were shared in chat or plain text.
- [ ] Add a staging environment separate from production for release validation and school pilot testing.
- [ ] Create dedicated smoke-test credentials for executive, director, teacher, billing, and parent/guardian roles.
- [ ] Create at least one linked parent/guardian login account per pilot school; the June 5, 2026 smoke report showed `0` active parent/guardian users and `0` guardians linked to login accounts.
- [ ] Run final ProCare import mapping against real exports from every active live school.
- [ ] Confirm every ProCare field used by schools is mapped, transformed, or intentionally excluded.
- [ ] Replace remaining demo classroom, family, parent, and teacher data in executive views with real imported school data.
- [ ] Complete Stripe connected account onboarding for every school or payout owner before enabling live parent checkout.
- [ ] Complete legal/accounting review of convenience fee, processing recovery, ACH cap, refunds, disputes, and parent-facing disclosures.
- [ ] Run a formal Supabase advisor/security review after the latest schema migrations.
- [ ] Add production error monitoring and uptime monitoring.
- [ ] Run full role-by-role credentialed production smoke tests after the account/data setup pass.

## Global Platform Readiness

- [x] Next.js app is deployed on Vercel production.
- [x] Production domain is connected at `thebeesuite.io`.
- [x] GitHub `main` pushes trigger production deployment.
- [x] Supabase/PostgreSQL production database is connected.
- [x] Prisma schema covers the core childcare operating model.
- [x] Current production health check previously returned OK and database connected.
- [x] Protected dashboard routes redirect unauthenticated users to login.
- [x] Protected billing mutation routes reject unauthenticated requests.
- [x] Lint, typecheck, test, build, and smoke scripts exist.
- [x] Current Node test suite had 56 passing tests in the June 5, 2026 checklist.
- [ ] Confirm `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:smoke` pass before each full-feature rollout.
- [ ] Confirm `/api/health` and `/api/system/readiness` are healthy after deployment.
- [ ] Review every new migration for tenant/location scoping and destructive operations before production deploy.
- [ ] Add API-level automated tests for every production route.
- [ ] Add rate limiting to all public and sensitive mutation routes.
- [ ] Add PII-safe request/response logging and redaction.
- [ ] Add seed/test fixtures for every major role and feature workflow.

## Security, Privacy, And Legal

- [x] Audit log schema, helper, and viewer foundation exist.
- [x] Sensitive workflows use server-side role and scope checks.
- [x] Guardrail helpers exist for access grants, attendance, billing, dates, documents, notifications, operations, portal, readiness, kiosk, FTE, and storage.
- [x] Data retention, deletion, backup/restore, and encryption-at-rest/field-level encryption plans exist in docs.
- [ ] Rotate any shared secrets before further live-school expansion.
- [ ] Decide and implement MFA policy for executive/admin users.
- [ ] Run formal Supabase advisor/security review after each schema migration.
- [ ] Confirm RLS/table access documentation matches current schema.
- [ ] Complete privacy review for child, guardian, custody, medical, billing, and photo/media data handling.
- [ ] Complete terms, privacy policy, consent language, photo/media release, and school/parent policy approvals.
- [ ] Confirm production backup schedule and restore drill before each cutover wave.

## Tenant, Brand, And Feature Controls

- [x] Schema supports tenants, brands, organizations, owner groups, centers, classrooms, users, access grants, brand assets, and customizations.
- [x] The app supports single-location, multi-location, franchise, owner-group, and corporate-level separation.
- [x] White-label settings foundation exists.
- [x] Executive admin can manage location/user structures at a high level.
- [x] Tenant-specific integration credentials foundation exists.
- [x] Add tenant controls UI for branding fields, parent portal labels, legal/footer settings, asset references, feature flags, DNS verification requests, and support-access audit requests.
- [x] Add tenant-level feature flags in the UI so schools can be enabled module by module.
- [x] Add custom domain DNS verification request UI with generated TXT record values.
- [ ] Add actual logo/favicon upload storage and preview flows.
- [ ] Add custom domain DNS validation, activation, and deployment binding.
- [ ] Add complete owner-group management views for franchisees who own multiple locations inside a larger brand.
- [ ] Add granular permission editor beyond the current role/access-grant model.
- [x] Add explicit support-access request workflow with audit warnings.
- [ ] Add support-access approval/grant workflow if support impersonation is ever enabled.

## Per-School Data And Cutover Setup

Complete this for each school before that school uses operational modules live.

- [ ] Confirm active/open status, official school name, CRM location ID, `ST | City` location ID, phone, address, school email, director email, and notification recipients.
- [ ] Confirm the center exists with correct tenant, brand, owner group, organization, and active status.
- [ ] Import or manually create classrooms, age groups, capacities, ratios, and classroom schedules.
- [ ] Import or manually create staff/teacher profiles, roles, titles, certifications, background check status, schedules, PTO/unavailability, and center/classroom assignments.
- [ ] Import or manually create families, guardians, children, authorized pickups, emergency contacts, medical notes, allergies, custody notes, schedules, enrollments, sibling links, and documents.
- [ ] Import balances, invoices, products, tuition plans, discounts, subsidies, ledger entries, and billing rules.
- [ ] Import attendance/check logs if historical attendance is needed.
- [ ] Validate imported data against ProCare exports with director signoff.
- [ ] Resolve duplicate families, guardians, children, staff, and leads before go-live.
- [ ] Archive or clearly label test leads, test families, test invoices, and test attendance records.
- [ ] Decide whether parent PINs are imported from ProCare or reset by directors inside The BEE Suite.
- [ ] Have each director verify their center dashboard, classroom rosters, families, children, balances, staff, and kiosk route.

## Accounts, Roles, And Access

- [x] Supabase Auth integration exists.
- [x] Session cookie auth exists.
- [x] Login rate limiting guard exists.
- [x] Forgot password/reset password routes exist.
- [x] Forced password reset workflow exists for first production login.
- [x] Parent portal invitation/password setup workflow exists for linked guardians.
- [x] Teacher/staff profile creation automatically generates Bee Suite teacher login usernames with default temporary passwords through Supabase Auth.
- [x] Teacher center grants are created when teacher profiles are saved.
- [ ] Create dedicated smoke credentials for all production roles.
- [ ] Create live accounts for each school director, assistant director, billing admin, teacher, and parent/guardian launch group.
- [ ] Validate every user can only see the intended tenant/brand/center/classroom/family/child scope.
- [ ] Link guardians to parent login users for each pilot school.
- [ ] Validate generated teacher login setup with real teacher/staff rosters from each active school.
- [ ] Add full user invite email workflow for staff/executive accounts instead of only admin-created accounts.
- [ ] Confirm executive/admin MFA policy and rollout timing.
- [ ] Document who can add/remove locations, reset passwords, import ProCare files, edit FTE reports, and manage billing.

## Executive And Corporate Features

- [x] Executive/admin dashboard foundation exists.
- [x] Multi-location dashboard exists.
- [x] Executive users can view multi-school CRM, FTE, and operations data.
- [x] Executive Active Schools table exists.
- [x] Executives can add/remove active school locations.
- [x] Added active schools update the public inquiry location dropdown.
- [x] Active school records support the `ST | City` location ID format.
- [x] Bulk user/location import tools exist for executives.
- [x] Audit logging exists for sensitive admin actions.
- [ ] Run credentialed executive smoke test with a dedicated production smoke account.
- [ ] Validate executive dashboard data is real, not demo, for classroom, parent, teacher, billing, and operations sections.
- [ ] Validate executives can manage locations, users, grants, imports, FTE review, billing oversight, reports, integrations, audit logs, and readiness checks.
- [ ] Finish granular permission editor and support-access/impersonation before broad franchise/customer rollout.

## Director And School Operations Features

- [x] Center dashboard exists.
- [x] Directors/location users are scoped to assigned school data.
- [x] Directors can add/edit family data through the Family Record Editor.
- [x] Directors can update guardian contact data and manage guardian check-in PINs.
- [x] Directors can create/edit child profile details and classroom assignment data.
- [x] Directors can add classrooms and teacher profiles.
- [x] Staff page includes teacher management, certification, background tracking, time clock, PTO, and scheduling foundations.
- [x] Directors can approve or reject submitted family/child document uploads.
- [x] Director FTE submission flow exists.
- [x] Custody visibility controls and staff-facing custody warnings exist.
- [x] Family merge/deduplication tools exist.
- [x] Ratio engine and classroom ratio warnings exist.
- [x] Offline/poor-connectivity classroom tablet strategy exists.
- [ ] Run credentialed director smoke test for every school rollout.
- [ ] Validate director can complete daily workflows: leads, tours, families, children, classrooms, teachers, FTE, attendance, incidents, documents, messages, billing, reports, and notifications.
- [ ] Confirm director training and first-week support coverage.

## CRM, Inquiry Routing, Tours, And Enrollment

- [x] Public inquiry API exists.
- [x] Kid City USA inquiry embed exists.
- [x] Public active locations API exists.
- [x] Inquiry form selected location routes leads to the correct CRM school profile.
- [x] Inquiry routing prefers active centers over lead queue placeholders.
- [x] Test lead routing previously verified 94 leads, tasks, and notes with zero missing/duplicate location routes.
- [x] Inquiry notifications route to global and location-specific recipients.
- [x] Google Sheets backup webhook support exists.
- [x] UTM/source capture and retry queue exist.
- [x] CRM lead list/create/update workflows are available to directors.
- [x] Lead notes, tasks, messages, tours, duplicate detection, merge, assignments, saved views, exports, and nurture steps exist.
- [x] Online registration page and API exist.
- [ ] Install the latest BEE Suite inquiry embed on each live school website or landing page.
- [ ] Submit one test inquiry per school or per approved rollout group after installing the embed.
- [ ] Confirm test inquiry appears in CRM, backup Google Sheet, global notification recipients, and correct school notification recipients.
- [ ] Remove or archive old CRM forms/webhooks after BEE Suite routing is confirmed.
- [ ] Provide and load final registration packet fields and policy acknowledgement documents.
- [ ] Validate registration, tour, waitlist, application approval/rejection, and enrollment checklist workflows using real school data.
- [ ] Confirm registration fee/deposit collection rules after payments are approved.

## FTE Reporting

- [x] FTE schema and migration exist.
- [x] Director FTE submission form exists.
- [x] Executive FTE review/correction/approval exists.
- [x] Current-week missing report tracker exists.
- [x] CSV export exists.
- [x] Executive bulk FTE CSV import/correction exists.
- [x] FTE trend visuals and school snapshots exist.
- [x] FTE notification dropdown escalation exists.
- [x] Persistent missing-FTE Vercel cron route exists.
- [x] `CRON_SECRET` is configured in Vercel production.
- [x] Email/SMS escalation path for missing FTE reports exists if enabled.
- [ ] Confirm final reporting week cutoff, due time, and escalation contacts with operations.
- [ ] Confirm final Google Sheet two-way reconciliation rules, or approve The BEE Suite as source of truth with Sheet backup only.
- [ ] Run first live FTE submission, correction, approval, export, and missing-report escalation test for each rollout group.

## ProCare Import And Cutover

- [x] ProCare import page/panel exists.
- [x] ProCare import API exists.
- [x] Import supports CSV and encrypted `.v10` workflow foundation.
- [x] Import can populate families, guardians, children, classrooms, staff, invoices, balances, and attendance/check log foundations.
- [x] Staff imported through ProCare receive generated Bee Suite teacher login usernames and center-scoped teacher access.
- [x] Import preview/diff UI exists.
- [x] Import rollback/export backup exists.
- [x] Duplicate matching controls for families/children/guardians exist.
- [ ] Provide actual ProCare `.v10` password, or CSV exports, for each rollout school.
- [ ] Export/confirm ProCare datasets: family accounts, children, guardians/payers, relationships, authorized pickups, emergency contacts, classroom roster, staff, attendance, balances/ledger, tuition contracts, schedules, immunization/medical/allergy fields, and FTE.
- [ ] Run final import mapping against real exports from each live school.
- [ ] Confirm every ProCare field used by the schools is mapped or intentionally excluded.
- [ ] Complete final migration runbook for switching each location off ProCare.
- [ ] Schedule cutover windows and fallback procedures per school.
- [ ] Have each school validate imported records before live operational use.

## Attendance, Check-In, And Kiosk

- [x] Attendance page exists.
- [x] Check-in page and center-specific check-in page exist.
- [x] Kiosk lookup/check APIs exist.
- [x] Guardian PIN hashing and verification exist.
- [x] Director PIN management exists.
- [x] Kiosk state guardrails prevent invalid duplicate check-ins/check-outs.
- [x] Lobby tablet UX foundation exists.
- [x] Signature capture exists.
- [x] Late pickup flag workflow exists.
- [x] Parent authorization warnings exist during pickup.
- [x] End-of-day attendance reconciliation report exists.
- [x] QR/PIN alternate check-in options exist.
- [x] Staff kiosk mode exists.
- [ ] Configure kiosk device, route, browser lock mode, and physical placement for each school.
- [ ] Create or verify guardian PINs for the launch family group.
- [ ] Test valid PIN, invalid PIN, duplicate check-in, checkout-before-checkin, authorized pickup warning, signature capture, late pickup, staff kiosk, and end-of-day reconciliation at each school.
- [ ] Tell directors not to use kiosk for live sign-in/out until center data and PINs are verified.

## Classroom And Teacher Workflows

- [x] Teacher portal/mobile view exists.
- [x] Teacher attendance, daily report, incident, and media upload APIs exist.
- [x] Teacher portal roster shows check-in/check-out/absent status.
- [x] Teacher portal supports quick check-in/check-out actions.
- [x] Daily reports support meals, naps, diaper/potty entries, activities, supplies, notes, mood, and parent-send toggle.
- [x] Teachers can create incident reports.
- [x] Teachers can upload classroom media/photos to child/family profiles through the teacher media flow foundation.
- [x] Teacher permissions are separated from director/location users.
- [x] Classroom ratio warnings and staff assignment/schedule actions exist.
- [x] Offline/poor-connectivity classroom tablet strategy exists.
- [ ] Load real classroom rosters and teacher assignments for each school.
- [ ] Validate generated teacher login with real teacher/staff rosters.
- [ ] Run teacher workflow test: roster, attendance, daily report, batch logs, incident, media upload, ratio warning, staff assignment, and offline queue behavior.
- [ ] Train teachers on what is parent-visible, what requires director review, and what stays internal.

## Parent Portal And Family Engagement

- [x] Parent portal page and workspace exist.
- [x] Parent account invitation/login flow exists for linked guardians.
- [x] Parent portal shows family, children, classroom, schedule, permissions, daily reports, shared media, documents, announcements, messages, balances, invoices, payments, and ledger history.
- [x] Parents can upload document files for director review.
- [x] Parent-to-center messages exist.
- [x] Parent contact/update request API exists.
- [x] Parent incident acknowledgement API exists.
- [x] Parent notification preferences exist.
- [x] Parent portal includes pay-balance by bank/card flow tied to open invoices.
- [ ] Create linked parent/guardian users for real pilot families.
- [ ] Validate parent account creation, login, data scope, daily reports, media, documents, messages, incidents, contact update requests, invoice view, and payment flow with real families at each pilot school.
- [ ] Complete full guardian self-service change request approval workflow.
- [ ] Decide push notification/native app strategy before promising push as part of the full feature set.
- [ ] Approve parent launch communication templates and parent onboarding guide distribution.

## Billing, Ledger, Tuition, And Payments

- [x] Billing accounts, invoices, invoice items, payments, ledger entries, products, and tuition plans exist in schema.
- [x] Billing and Invoices page, Payments page, and Billing Settings page exist.
- [x] Stripe Connect onboarding/status/refresh routes exist.
- [x] Stripe Checkout route exists.
- [x] Stripe webhook route verifies signatures.
- [x] Stripe payment reconciliation applies one payment to one invoice with guardrails.
- [x] Director Billing Workbench is live on the Billing and Invoices page.
- [x] Directors can create single-family invoices, tuition/product/custom charges, batch tuition/fee billing, account credits, and account debits.
- [x] Batch billing has duplicate protection.
- [x] Recurring tuition assignment endpoint and daily recurring tuition cron route exist.
- [x] Recurring billing creates monthly child tuition invoices idempotently.
- [x] Billing page includes AR aging and ledger reconciliation reporting.
- [x] Payment method management/autopay and failed payment retry/dunning workflows exist.
- [x] Subsidy/agency payment tracking exists.
- [x] Surcharge/convenience fee and processing recovery disclosure language exists in parent/admin payment flows.
- [ ] Have each school director submit or confirm tuition plans, fees, discounts, subsidy rules, ledger balances, invoice rules, and billing cadence.
- [ ] Complete Stripe connected account onboarding for every school/payout owner before accepting live parent payments.
- [ ] Complete final legal/accounting review of surcharge/convenience fee and processing recovery policy before enforcing live pass-through fees.
- [ ] Confirm whether schools or corporate absorb failed-payment, ACH, card, dispute, and refund fees.
- [ ] Provide official billing terms, refund language, privacy policy, and payment authorization text.
- [ ] Run school-specific billing test: create invoice, post credit/debit, run batch billing, reconcile ledger, start Checkout, complete test payment, receive webhook, mark invoice paid, verify payout/application fee behavior, and test failed-payment path.
- [ ] Confirm live parent payments remain disabled for a school until payout onboarding and payment policy approval are complete.

## Messaging, Announcements, Notifications, And AI

- [x] Messages page, Communications API, lead message API, Announcements page, Campaigns page, Automations page, Mr. Bee AI route, Notification center, dropdown, and summary API exist.
- [x] Read/unread notification UI exists.
- [x] Notification dedupe/retention policy exists.
- [x] Parent notification preferences exist.
- [x] Portal two-way parent/director/teacher messaging UI exists.
- [x] Real SendGrid email paths exist for communication workflows.
- [x] Real Twilio SMS send/receive paths exist.
- [x] Message templates and merge fields exist.
- [x] Richer threaded conversation views with per-family reply history and staff assignment exist.
- [x] Full notification preferences by role/user exist.
- [x] Email/SMS/push delivery channel foundation exists.
- [ ] Verify sender domains, DNS records, SendGrid authentication, Twilio compliance, SMS consent language, opt-out language, and school notification recipients.
- [ ] Configure message templates, merge fields, announcement templates, billing notices, FTE reminders, document reminders, and emergency/non-emergency categories per tenant/school.
- [ ] Test parent-director, parent-teacher, director-parent, lead follow-up, announcement, campaign, email, SMS, notification preference, opt-out, and inbound SMS flows.
- [ ] Confirm AI/Mr. Bee use cases, OpenAI configuration, sensitive-output review rules, and human-review workflow before enabling AI suggestions broadly.

## Forms, Documents, E-Signature, And Registration Packets

- [x] Forms page and Documents page exist.
- [x] Registration page and API exist.
- [x] Signature request mock integration API exists.
- [x] Parent document upload API stores submitted files in Supabase Storage.
- [x] Director document review API supports approve/reject decisions with notes and parent notifications.
- [x] Required document checklist per family/staff/child exists.
- [x] File upload UI tied to Supabase storage exists.
- [x] Director document review states exist.
- [x] Expiration reminders for family/staff/child documents exist.
- [x] Internal signature capture/e-signature foundation exists.
- [x] Build actual form builder UI.
- [ ] Load final registration forms, policy acknowledgement forms, photo/media releases, medical/allergy forms, custody documents, and required staff documents.
- [ ] Confirm e-signature consent language and whether internal signature capture is sufficient for each document type.
- [ ] Test registration packet submission, document request, parent upload, director review, rejection/resubmission, expiration reminders, and export package for licensing/records requests.

## Compliance, Incidents, Medication, And Licensing

- [x] Compliance dashboard exists.
- [x] Incident reports page exists.
- [x] Teacher incident creation API exists.
- [x] Parent incident acknowledgement API exists.
- [x] State-specific licensing configuration foundation exists.
- [x] Medication log workflow exists.
- [x] Compliance report export exists.
- [x] Incident admin review workflow with parent acknowledgement status exists.
- [ ] Configure state/school-specific licensing checklist, staff certification requirements, medication log expectations, emergency drill logs, inspection records, and document retention rules.
- [ ] Complete state-specific childcare licensing review before claiming any state-specific workflow support.
- [ ] Test incident creation, director review, parent acknowledgement, medication log, licensing export, expiring document reminders, and compliance task assignment/reminders.
- [ ] Confirm all public and staff-facing language avoids guaranteeing legal/licensing compliance.

## Staff, Scheduling, Ratios, And Time Clock

- [x] Teachers/staff page exists.
- [x] Staff profile, schedule, certification, background check, PTO/unavailability, and staff time clock foundations exist.
- [x] Dedicated director UI exists for adding/editing teacher profiles and certifications.
- [x] Staff CRUD uses safe teacher deactivation instead of destructive deletion.
- [x] Staff schedule/calendar views exist.
- [x] Ratio engine by age group/state rules exists.
- [ ] Load teacher onboarding forms/documents for each school.
- [ ] Validate staff schedules, classroom assignments, time clock, PTO/unavailability, certification expiration reminders, and ratio warnings against real rosters.
- [ ] Confirm director workflow for staffing gaps and classroom ratio corrections.

## Calendar, Events, And Scheduling

- [x] Calendar page exists.
- [x] Tours, child schedules, billing due dates, compliance reminders, birthdays, and staff schedules are represented in schema/module definitions.
- [x] Full calendar UI with filters by center/classroom/user exists.
- [x] Staff schedule publishing exists.
- [ ] Add real Google Calendar sync if schools expect external calendar integration.
- [ ] Add recurring events, closures, holiday management, and parent event visibility controls.
- [ ] Validate tours, staff schedules, enrollment starts, billing due dates, document expirations, birthdays, and compliance reminders appear correctly per role.

## Marketing, Campaigns, Reputation, And Reviews

- [x] Campaigns page exists.
- [x] Automations page exists.
- [x] Reputation/reviews page exists.
- [x] Campaign, automation, automation run, review, and survey schema exists.
- [ ] Build or validate campaign editor and template library.
- [ ] Add automation workflow builder UI beyond foundation.
- [ ] Add campaign send scheduling and reporting.
- [ ] Add review request workflows.
- [ ] Add survey/NPS collection.
- [ ] Add AI review response generator in UI.
- [ ] Confirm audience segmentation, opt-out rules, consent language, and sender limits before enabling school marketing campaigns.
- [ ] Connect Google Business Profile or other reputation integrations if required for launch.

## Reporting, Analytics, And Exports

- [x] Analytics/reporting page exists.
- [x] Executive dashboard reports CRM, FTE, occupancy/revenue readiness, and operational snapshots.
- [x] FTE trend and snapshot visuals exist.
- [x] Readiness API exists.
- [x] Billing AR aging and ledger reconciliation reporting exists.
- [ ] Add or validate full report builder with filters/date ranges.
- [ ] Add or validate lead source and funnel conversion dashboards.
- [ ] Add or validate attendance/absence trend reporting.
- [ ] Add or validate billing/revenue/AR reporting.
- [ ] Add or validate parent response time and message analytics.
- [ ] Add CSV/PDF export for key reports each role needs.
- [ ] Confirm each school director and executive stakeholder knows which reports are source of truth.

## Integrations And External Systems

- [x] Integrations page exists.
- [x] System readiness API exists.
- [x] Stripe, Supabase, SendGrid, Twilio, Google Sheets, storage, webhook, and signature integration foundations exist.
- [x] Integration health checks, last-sync logs, retry queues, and tenant-specific credentials exist.
- [ ] Configure production credentials per tenant/school where needed.
- [ ] Verify Stripe webhooks, SendGrid sender domains, Twilio senders/compliance, Google Sheet backups, Supabase Storage buckets, and any external webhook receivers.
- [ ] Add real Google Calendar sync if required.
- [ ] Add Google Business Profile, Meta Lead Ads, Zapier/webhooks, or other launch integrations only after owner approval and credential setup.
- [ ] Test failed integration delivery, retry, alerting, and manual replay.

## Training, Support, And Rollout Operations

- [x] Operator launch handbook exists.
- [x] Production release checklist exists.
- [x] Role smoke test checklist exists.
- [x] Support escalation guide exists.
- [x] School director quick-start guide exists.
- [x] Executive/admin quick-start guide exists.
- [x] Parent onboarding guide exists.
- [x] In-school testing runbook exists.
- [ ] Create or update teacher quick-start material for classroom tablet workflows.
- [ ] Create or update billing/admin quick-start material for invoices, payments, ledger, dunning, and Stripe payout readiness.
- [ ] Confirm one launch owner and one escalation contact per school.
- [ ] Confirm pilot school rollout order and cutover windows.
- [ ] Train executives, directors, billing admins, teachers, and launch parents before enabling their modules.
- [ ] Define first-week support hours, severity levels, rollback criteria, and data cleanup process.
- [ ] Record known limitations and disabled modules for each school before go-live.

## Role-By-Role Production Validation

Run this after each major deployment and before enabling all features for a school.

- [x] Automated baseline production smoke passed on June 5, 2026 for public landing, login, onboarding, protected route redirects, inquiry embed assets, public locations API, and inquiry CORS preflight.
- [ ] Executive: log in, verify multi-location dashboard, active schools, users/access, imports, CRM, FTE, billing oversight, reports, integrations, readiness, and audit logs.
- [ ] Director: log in, verify center-scoped dashboard, leads, tours, families, children, classrooms, staff, attendance, kiosk, FTE, documents, incidents, messages, billing, reports, and notifications.
- [ ] Billing admin: log in, verify invoices, products, tuition plans, credits/debits, batch billing, payments, dunning, AR aging, ledger reconciliation, and Stripe status.
- [ ] Teacher: log in, verify classroom roster, attendance, daily reports, batch logs, incidents, media upload, ratio warnings, messages, and offline strategy.
- [ ] Parent/guardian: log in, verify only own family/children, daily reports, photos/media, documents, messages, contact requests, incidents, invoices, payments, and notification preferences.
- [ ] Kiosk/authorized pickup: verify lookup, authorized child list, PIN, signature, warnings, check-in/out state, and invalid-action guardrails.
- [ ] Public visitor: verify inquiry, registration, location selection, source tracking, backup delivery, notifications, and spam/bot guardrails.
- [ ] Confirm no role can see another center, classroom, family, child, billing, message, media, incident, or attendance record outside assigned scope.

## Per-School Go/No-Go Signoff

Use one copy of this section per school.

- [ ] School name:
- [ ] Location ID:
- [ ] Rollout date:
- [ ] Launch owner:
- [ ] Escalation contact:
- [ ] Data import completed and backed up.
- [ ] Director reviewed and approved imported data.
- [ ] Executive access validated.
- [ ] Director/access scope validated.
- [ ] Teacher accounts and rosters validated.
- [ ] Parent/guardian accounts validated.
- [ ] Inquiry/CRM validated.
- [ ] FTE validated.
- [ ] Kiosk/attendance validated.
- [ ] Classroom daily reports/incidents/media validated.
- [ ] Parent portal/documents/messages validated.
- [ ] Billing/ledger validated.
- [ ] Stripe payout/payment readiness approved, or payments intentionally disabled.
- [ ] Messaging/email/SMS notifications validated.
- [ ] Compliance/document/licensing workflows validated.
- [ ] Reporting/export workflows validated.
- [ ] Training completed.
- [ ] Known limitations recorded.
- [ ] Support plan confirmed.
- [ ] Final go/no-go approved by owner/operator.

## Stop Conditions

Stop or pause a school rollout if any of these occur:

- [ ] A user can see another center's family, child, attendance, billing, message, media, incident, document, FTE, or operational data.
- [ ] Parent/guardian can see another family or child.
- [ ] Kiosk accepts a PIN for the wrong center or creates invalid attendance state.
- [ ] A payment marks the wrong invoice paid, applies twice, or routes funds to the wrong connected account.
- [ ] Media becomes visible to parents without permission/review.
- [ ] Document, custody, medical, or allergy warnings are missing from staff-facing workflows.
- [ ] Import creates duplicate or mismapped family, child, guardian, staff, classroom, balance, or invoice data that directors cannot reconcile.
- [ ] Email/SMS sends to the wrong recipients or lacks required consent/opt-out language.
- [ ] Required smoke tests fail and the issue affects live-school data, access, billing, safety, or compliance-sensitive workflows.

## Recommended Rollout Order

- [ ] Phase 0: security, staging, monitoring, smoke credentials, legal/accounting, and owner approvals.
- [ ] Phase 1: active school setup, director access, inquiry embed, CRM, FTE, and reports.
- [ ] Phase 2: ProCare import, family/child/staff/classroom data, attendance, kiosk, and teacher workflows.
- [ ] Phase 3: parent portal, documents, messages, announcements, incidents, media, and notifications.
- [ ] Phase 4: billing, ledger, recurring tuition, dunning, Stripe connected accounts, and live parent payments.
- [ ] Phase 5: marketing campaigns, reviews, surveys, advanced automations, Google Calendar/Business Profile sync, white-label domains, granular permissions, support impersonation, and AI suggestions.
