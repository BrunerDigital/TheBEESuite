# The BEE Suite Updated Completion Checklist

Last updated: June 4, 2026

Current production deployment before document upload/review pass: `dpl_2YaFc7tdF4nMDkZaheKzSRxvb6LB`
Current production commit before document upload/review pass: `35bed54 Add portal family messaging replies`
Rollback point before tuition/accounting work: `dpl_AfWhPU6vSvcZownaazgvhK29WCPh`
Rollback point before messaging/parity work: `dpl_AvK62vh3RU1esFKDoVEMd9JbV6S3`
Rollback point before document upload/review work: `dpl_2YaFc7tdF4nMDkZaheKzSRxvb6LB`

Status legend:
- `[x]` Complete, deployed, or ready for live validation.
- `[ ]` Still needs build work, data, approval, or production validation.

## Production Baseline

- [x] Next.js app deployed on Vercel production.
- [x] Production domain connected at `thebeesuite.io`.
- [x] GitHub `main` pushes trigger production deployment.
- [x] Supabase/PostgreSQL production database connected.
- [x] Prisma schema covers the core childcare operating model.
- [x] Current production health check returns OK and database connected.
- [x] Protected dashboard routes redirect unauthenticated users to login.
- [x] Protected billing mutation route rejects unauthenticated requests.
- [x] Procare parity gap map created at `docs/PROCARE_PARITY_GAP_MAP_2026-06-04.md`.
- [ ] Rotate the GitHub and Supabase tokens that were shared in chat.
- [ ] Run a full role-by-role production smoke test after the next account/data setup pass.

## Executive Level

- [x] Executive/admin dashboard foundation exists.
- [x] Multi-location dashboard exists.
- [x] Executive users can view multi-school CRM/FTE/operations data.
- [x] Executive Active Schools table exists.
- [x] Executives can add/remove active school locations.
- [x] Added active locations flow updates the public inquiry location dropdown.
- [x] Active school records support the `ST | City` Location ID format.
- [x] Active school list currently exposes 94 active locations through the public locations API.
- [x] New active schools create the school/location structure needed for dashboards and routing.
- [x] Executive user/access management foundation exists.
- [x] Audit logging exists for sensitive admin actions.
- [ ] Finish all executive CRUD flows with polished confirmation/error states.
- [ ] Add bulk user/location import tools for executives.
- [ ] Add granular permission editor beyond the current role/access-grant model.
- [ ] Add explicit support-access/impersonation workflow with audit warnings.

## Director / School Level

- [x] Center dashboard exists.
- [x] Directors/location users are scoped to assigned school data.
- [x] CRM lead list/create/update workflows are available to directors.
- [x] Manual lead entry exists.
- [x] Lead notes, tasks, messages, and tours APIs exist.
- [x] Family profiles page exists.
- [x] Child profiles page exists.
- [x] Directors can add and edit family data through the Family Record Editor.
- [x] Directors can update guardian contact data.
- [x] Directors can manage guardian check-in PINs.
- [x] Directors can create/edit child profile details and classroom assignment data.
- [x] Directors can add classrooms for their school.
- [x] Directors can add/edit teacher profiles.
- [x] Directors can provision teacher logins by temporary password or setup/reset email.
- [x] Teacher center grants are created when teacher profiles are saved.
- [x] Staff page includes teacher management and certification/background tracking foundations.
- [x] Directors can approve or reject submitted family/child document uploads.
- [x] Director FTE submission flow exists.
- [x] Onboarding now captures director-provided classroom, tuition/rate, subsidy, balance, and invoice/payment setup sections.
- [x] Attendance, kiosk, daily reports, incidents, documents, messages, announcements, calendar, billing, and payments pages exist.
- [ ] Complete custody visibility controls and staff-facing custody warnings throughout the UI.
- [ ] Complete document upload/review/expiration workflow per family/child/staff.
- [ ] Add family merge/deduplication tools.
- [ ] Add staff time clock.
- [ ] Add ratio engine by age group/state rules.
- [ ] Add classroom ratio warnings and staff assignment actions.
- [ ] Add offline/poor-connectivity strategy for classroom tablets.

## Teacher / Classroom Level

- [x] Teacher portal/mobile view exists.
- [x] Teacher attendance API exists.
- [x] Teacher daily report API exists.
- [x] Teacher incident API exists.
- [x] Teacher media upload API exists.
- [x] Teacher portal roster shows check-in/check-out/absent status.
- [x] Teacher portal supports quick check-in/check-out actions.
- [x] Daily reports support meals, naps, diaper/potty entries, activities, supplies, notes, mood, and parent-send toggle.
- [x] Daily report parser supports both legacy single-field payloads and new batched entries.
- [x] Teachers can create incident reports.
- [x] Teachers can upload classroom media/photos to child/family profiles through the teacher media flow foundation.
- [x] Teacher permissions are separated from director/location users.
- [ ] Add classroom ratio warnings directly in teacher/classroom views.
- [ ] Add more complete classroom staff assignment/schedule actions.
- [ ] Add offline/poor-connectivity classroom tablet strategy.
- [ ] Validate teacher login setup with real teacher emails from each active school.

## Parent / Family Level

- [x] Parent portal page exists.
- [x] Parent account invitation/login flow exists for linked guardians.
- [x] Parent portal shows family, children, classroom, schedule, and permission snapshots.
- [x] Parent portal shows daily reports.
- [x] Parent portal shows teacher-shared photos/media foundation.
- [x] Parent portal shows documents and document submission/review foundation.
- [x] Parents can upload document files to family/child document requests for director review.
- [x] Parent portal shows announcements.
- [x] Parent portal supports parent-to-center messages.
- [x] Parent contact/update request API exists.
- [x] Parent incident acknowledgement API exists.
- [x] Parent notification preferences exist.
- [x] Parent portal shows billing balance, open invoices, recent payments, and ledger history.
- [x] Parent portal has ACH/card Stripe Checkout buttons on open invoices.
- [x] Parent portal now includes a top-level Pay Balance by Bank/Card action tied to the next open invoice.
- [ ] Add push notification/native app strategy.
- [ ] Add full guardian self-service change request approval workflow.
- [ ] Validate parent account creation with real families at each pilot school.

## CRM, Inquiry Routing, And Active Schools

- [x] Public inquiry API exists.
- [x] Kid City USA inquiry embed exists.
- [x] Public active locations API exists.
- [x] Public locations API returns 94 active schools.
- [x] Public locations include `crmLocationId` values such as `FL | Sarasota` and `IN | Westfield`.
- [x] Inquiry form selected Location ID routes leads to the correct CRM school profile.
- [x] Inquiry routing prefers active centers over lead queue placeholders.
- [x] Test leads were sent to every active location in batch `qa-routing-20260604-120828`.
- [x] Test lead routing verified 94 leads, tasks, and notes with zero missing/duplicate location routes.
- [x] Inquiry notifications route to global and location-specific recipients.
- [x] Google Sheets backup webhook support exists.
- [x] UTM/source capture exists.
- [x] Retry queue exists for failed outbound integration deliveries.
- [ ] Reconfirm all director notification emails for the active schools before final rollout.
- [ ] Remove or archive test leads if operations does not want them retained in live CRM history.

## Tuition, Billing, Ledger, And Payments

- [x] Billing accounts, invoices, invoice items, payments, ledger entries, products, and tuition plans exist in schema.
- [x] Billing and Invoices page exists.
- [x] Payments page exists.
- [x] Billing Settings page exists.
- [x] Stripe Connect onboarding/status/refresh routes exist.
- [x] Stripe Checkout route exists.
- [x] Stripe webhook route exists and verifies signatures.
- [x] Stripe checkout uses hosted Checkout Sessions.
- [x] Stripe payment reconciliation applies one payment to one invoice with guardrails.
- [x] Billing guardrail tests exist.
- [x] Director Billing Workbench is live on the Billing and Invoices page.
- [x] Directors can create a single-family invoice.
- [x] Directors can create tuition/product/custom charges.
- [x] Directors can run batch tuition/fee billing by school, age group, enrollment status, and per-child/per-family target.
- [x] Batch billing has duplicate protection by family, source, billing period, target, and child scope.
- [x] Directors can post family account credits and debits.
- [x] Billing actions update invoice records, invoice line items, ledger entries, and billing account balances together.
- [x] Parent portal shows balances and lets parents pay through Stripe Checkout.
- [x] Recurring tuition assignment endpoint exists for child-level plan scheduling.
- [x] Daily recurring tuition cron route exists and is scheduled in Vercel.
- [x] Recurring billing creates monthly child tuition invoices idempotently.
- [x] Billing page includes AR aging and ledger reconciliation reporting.
- [x] Add weekly recurring billing cadence rules if schools need weekly tuition billing.
- [ ] Add payment method management/autopay through Stripe Setup Intents or customer portal.
- [ ] Add failed payment retry/dunning workflow.
- [x] Add subsidy/agency payment tracking.
- [ ] Finalize surcharge/convenience fee disclosures and legal review.
- [ ] Complete Stripe connected account onboarding for every school/payout owner before accepting live parent payments at that school.

## Attendance, Check-In, And Kiosk

- [x] Attendance page exists.
- [x] Check-in page exists.
- [x] Center-specific check-in page exists.
- [x] Kiosk lookup/check APIs exist.
- [x] Guardian PIN hashing and verification exist.
- [x] Director PIN management exists.
- [x] Kiosk state guardrails prevent invalid duplicate check-ins/check-outs.
- [x] Lobby tablet UX foundation exists.
- [x] Signature capture exists.
- [x] Late pickup flag workflow exists.
- [x] Parent authorization warnings exist during pickup.
- [x] End-of-day attendance reconciliation report exists.
- [x] Add QR/PIN alternate check-in options.
- [x] Add staff kiosk mode.

## FTE Reporting

- [x] FTE schema and migration exist.
- [x] Director FTE submission form exists.
- [x] Executive FTE review/correction/approval exists.
- [x] Current-week missing report tracker exists.
- [x] CSV export exists.
- [x] Executive bulk FTE CSV import/correction exists.
- [x] FTE trend visuals and school snapshots exist.
- [x] FTE notification dropdown escalation exists.
- [x] Vercel cron route exists for persistent missing-FTE notifications.
- [x] `CRON_SECRET` is configured in Vercel production.
- [ ] Confirm final reporting week cutoff/due time with Kid City USA operations.
- [ ] Add email/SMS escalation for missing FTE reports if desired.
- [ ] Add final Google Sheet two-way reconciliation rules.

## ProCare Import And Cutover

- [x] ProCare import page/panel exists.
- [x] ProCare import API exists.
- [x] Import supports CSV and encrypted `.v10` workflow foundation.
- [x] Import can populate families, guardians, children, classrooms, staff, invoices, balances, and attendance/check log foundations.
- [x] Import preview/diff UI exists.
- [x] Import rollback/export backup exists.
- [ ] Run final import mapping against real exports from each live Kid City USA location.
- [ ] Confirm every ProCare field used by the schools is mapped or intentionally excluded.
- [ ] Add duplicate matching controls for families/children/guardians.
- [ ] Add final migration runbook for switching each location off ProCare.

## Messaging, Notifications, And AI

- [x] Messages page exists.
- [x] Communications API exists.
- [x] Lead message API exists.
- [x] Announcements page exists.
- [x] Campaigns page exists.
- [x] Automations page exists.
- [x] Mr. Bee AI route exists.
- [x] Notification center page exists.
- [x] Notification dropdown exists.
- [x] Notification summary API exists.
- [x] Read/unread mutation UI exists.
- [x] Notification dedupe/retention policy exists.
- [x] Parent notification preferences exist.
- [x] Complete portal two-way parent/director/teacher messaging UI.
- [x] Add real SendGrid email send paths for all communication workflows.
- [x] Add real Twilio SMS send/receive paths.
- [ ] Add message templates and merge fields.
- [ ] Add richer threaded conversation views with per-family reply history and staff assignment.
- [ ] Add full notification preferences by role/user beyond parent portal.
- [ ] Add email/SMS/push delivery channels.

## Forms, Documents, Compliance, And E-Signature

- [x] Forms page exists.
- [x] Documents page exists.
- [x] Registration page and API exist.
- [x] Signature request mock integration API exists.
- [x] Compliance dashboard exists.
- [x] Incident reports page exists.
- [x] Teacher incident creation API exists.
- [x] Parent incident acknowledgement API exists.
- [x] Parent document upload API stores submitted files in Supabase Storage.
- [x] Director document review API supports approve/reject decisions with notes and parent notifications.
- [ ] Build actual form builder UI.
- [x] Complete required document checklist per family/staff/child.
- [x] Add file upload UI tied to Supabase storage.
- [x] Add director document review states.
- [x] Add expiration reminders for family/staff/child documents.
- [x] Integrate real e-signature provider or complete internal signature capture flow.
- [x] Add state-specific licensing configuration.
- [ ] Add medication log workflow.
- [ ] Add compliance report export.
- [ ] Add incident admin review workflow with parent acknowledgement status.

## Integrations, Security, And Operations

- [x] Integrations page exists.
- [x] System readiness API exists.
- [x] Stripe integration foundation exists.
- [x] Supabase storage/auth/database integration exists.
- [x] SendGrid/Twilio integration foundations exist.
- [x] Google Sheets backup support exists for inquiries and FTE.
- [x] Integration health checks and retry queues exist.
- [x] Audit log viewer exists.
- [x] Guardrail tests cover access grants, attendance, billing, dates, documents, notifications, operations, portal, readiness, kiosk, FTE, and storage.
- [x] Lint, typecheck, test, and build scripts exist.
- [x] Current test suite has 56 passing tests.
- [x] Complete real setup UI for each integration.
- [ ] Add tenant-specific integration credentials instead of only platform env vars.
- [ ] Run formal Supabase advisor/security review after schema migrations.
- [ ] Add staging environment separate from production.
- [ ] Add seed/test fixtures for every major role.
- [ ] Add error monitoring and uptime monitoring.

## Business / User Input Needed

- [x] Create onboarding sections for directors to provide current tuition plans, fees, discounts, subsidy rules, ledger balances, and invoice rules.
- [ ] Have each school director submit or confirm current tuition plans, fees, discounts, subsidy rules, ledger balances, and invoice rules.
- [ ] Confirm which schools are ready for Stripe connected account onboarding.
- [ ] Confirm convenience fee/processing recovery language with legal/accounting.
- [ ] Provide teacher/staff rosters per active location.
- [x] Create onboarding sections for directors to provide classroom names, capacities, age ranges, and ratio expectations.
- [ ] Have each school director submit or confirm classroom names, capacities, age ranges, and ratio expectations per active location.
- [ ] Provide final registration packet fields and policy acknowledgement documents.
- [ ] Approve public website copy, testimonials, logos, and real in-school photos.
- [ ] Confirm FTE cutoff schedule and escalation contacts.
- [ ] Confirm pilot school rollout order and cutover windows.
