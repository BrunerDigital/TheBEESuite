# The BEE Suite App Completion Checklist

Last updated: June 3, 2026

Status legend:
- `[x]` Built, deployed, or foundation-complete enough to use or test now.
- `[ ]` Still needs work before it should be considered complete production coverage.

## Current Production Baseline

- [x] Next.js App Router SaaS app deployed on Vercel.
- [x] Production domain connected at `thebeesuite.io`.
- [x] GitHub main branch deployment flow active.
- [x] Supabase/PostgreSQL production database connected.
- [x] Prisma schema covers the core childcare operating model.
- [x] Kid City USA pilot tenant, centers, users, leads, FTE, and core CRM workflows are live.
- [x] Role-based UI and data scoping exists for executive users vs location/director users.
- [x] Location-level users are scoped to assigned center data for CRM leads and FTE reports.
- [x] The app name and author metadata have been corrected to `The BEE Suite` and `BrunerDigital`.
- [x] Production Prisma connection usage is limited to reduce Supabase connection exhaustion during live school traffic.
- [ ] Complete a fresh production smoke test for every role after each major deployment.
- [x] Create a formal release checklist before every live-school rollout.

## Public Website And Landing Page

- [x] Public landing page exists.
- [x] Landing page is positioned for childcare centers and preschool operators broadly, not only Kid City USA.
- [x] Hero visual style has been upgraded toward the dark, premium BEE Suite direction.
- [x] Sections include platform explanation, operational value, and feature previews.
- [x] Pricing/payment revenue visual materials exist in docs.
- [x] Social/media marketing asset package exists in docs.
- [ ] Add final production copy pass for public SaaS launch.
- [ ] Add full testimonials section with real approved customer quotes.
- [ ] Add generated or real in-school product usage imagery.
- [x] Add final responsive QA across common mobile/tablet/desktop sizes.
- [ ] Add conversion tracking, analytics, and ad pixels when marketing launches.

## Authentication And Account Access

- [x] Login page exists.
- [x] Forgot password/reset password routes exist.
- [x] Supabase Auth integration exists.
- [x] Session cookie auth exists.
- [x] Login rate limiting guard exists.
- [x] Kid City USA location users can log in with assigned school accounts.
- [x] Executive users including `brenden@kidcityusa.com`, `marie@kidcityusa.com`, `audrey@kidcityusa.com`, and `kayleen@kidcityusa.com` were added previously.
- [x] Password reset support exists through the UI/API.
- [x] Complete forced password reset workflow for first production login.
- [ ] Add MFA option for executive/admin users.
- [x] Add session revocation/admin logout-all-devices control.
- [x] Add parent portal invitation/password setup workflow for linked guardians.
- [ ] Add full user invite email workflow for staff/executive accounts instead of only admin-created accounts.

## Multi-Tenant, Franchise, And White-Label Architecture

- [x] Schema includes tenants, brands, organizations, owner groups, centers, classrooms, users, access grants, brand assets, and brand customizations.
- [x] Supports single-location, multi-location, franchise, owner-group, and corporate-level separation.
- [x] White-label settings module exists.
- [x] Brand/center customization data model exists.
- [x] Executive admin console can manage location/user structures at a high level.
- [x] Access grant model exists for broader than one-center access.
- [ ] Finish UI for every brand customization field, logo upload, favicon, parent portal branding, and legal footer settings.
- [ ] Add self-service domain verification/onboarding.
- [ ] Add tenant-level feature flags in the UI.
- [ ] Add complete owner-group management views for franchisees who own multiple locations inside a larger brand.

## Executive Admin

- [x] Agency/franchise/executive admin page exists.
- [x] Executive admin API exists.
- [x] Corporate users can create/archive locations and manage users through UI foundations.
- [x] Access grant replacement guardrails exist.
- [x] Audit logs exist for sensitive actions.
- [ ] Complete all executive CRUD flows with confirmation states, validation, and error recovery.
- [ ] Add bulk user/location import for executive admins.
- [x] Add password reset email trigger from executive admin, not just password set/reset foundations.
- [ ] Add granular permission editor for roles beyond the current role/access-grant model.
- [ ] Add support-access/impersonation workflow with explicit audit warnings.

## Dashboards

- [x] Main dashboard page exists.
- [x] Multi-location dashboard exists.
- [x] Center dashboard exists.
- [x] Classroom dashboard exists.
- [x] Teacher portal/mobile view exists.
- [x] Parent portal view exists.
- [x] Executive-level Kid City USA views can show CRM/FTE/reporting data.
- [x] Executive-only demo data exists for classroom and parent engagement sections.
- [ ] Replace remaining executive demo classroom/parent data with real imported school data.
- [ ] Add configurable dashboard widgets per role.
- [x] Add saved filters and date ranges.
- [x] Add export/share actions for dashboard snapshots.

## CRM Leads And Enrollment Pipeline

- [x] CRM leads page exists.
- [x] CRM API supports scoped lead list/create.
- [x] Lead detail API supports fetch/update.
- [x] Lead notes/tasks/messages/tours APIs exist.
- [x] Pipeline stages are defined.
- [x] Lead stage update bug was fixed so saving lead info no longer reverts to New Inquiry.
- [x] Location-level lead visibility is scoped to the correct center.
- [x] Inquiry form leads route correctly to the selected Kid City USA location ID.
- [x] Lead routing audit API exists.
- [x] Manual lead entry exists for directors/location users.
- [x] Mr. Bee AI assistant API exists for lead communication help.
- [x] Build full drag-and-drop pipeline board interaction.
- [x] Add duplicate lead detection/merge workflow.
- [x] Add full communication timeline per family/lead.
- [x] Add CRM saved views, filters, and exports.
- [x] Add lead assignment/owner workflow.
- [x] Add automated nurture steps tied to stage transitions.

## Inquiry Forms And External Lead Intake

- [x] Public inquiry API exists.
- [x] Kid City USA inquiry form embed code exists.
- [x] Kid City USA location dropdown maps selected location ID to the correct CRM center.
- [x] Inquiry notifications send to global recipients and location-specific recipients.
- [x] Google Sheets backup webhook support exists.
- [x] Public Kid City locations API exists.
- [x] Inquiry allowed-origin configuration exists.
- [x] Add self-service inquiry form builder for every new tenant/location during onboarding.
- [x] Add executive dashboard button to copy embed code for each location/brand.
- [x] Add CAPTCHA/bot protection to public inquiry endpoint.
- [x] Add UTM/source capture and reporting across all embeds.
- [x] Add retry queue for failed email/Google Sheet/CRM forwarding.

## Family, Guardian, And Child Profiles

- [x] Family profile page exists.
- [x] Child profile page exists.
- [x] Family/student intake component exists.
- [x] Family intake API links children to family accounts.
- [x] Guardian PIN management exists.
- [x] Schema covers guardians, children, authorized pickups, emergency contacts, medical notes, allergies, documents, billing accounts, enrollments, and sibling relationships.
- [x] Sensitive medical/custody/document fields are modeled separately.
- [ ] Complete full edit forms for every family/child/guardian field.
- [ ] Add custody visibility controls and staff-facing warnings throughout UI.
- [ ] Add document upload/review/expiration workflow per family/child.
- [ ] Add guardian self-service change request approval workflow.
- [ ] Add family merge/deduplication.

## Enrollment, Waitlist, Tours, And Online Registration

- [x] Enrollment pipeline page exists.
- [x] Waitlist page exists.
- [x] Tours page exists.
- [x] Tour API exists through lead tour route.
- [x] Online registration page and API exist.
- [x] Enrollment/application schema exists.
- [x] Forms and form submission schema exists.
- [ ] Complete online registration packet using the final Kid City USA registration form fields.
- [ ] Add parent-facing registration account creation/invite flow.
- [ ] Add enrollment checklist per child/family.
- [ ] Add document/signature collection for registration forms.
- [ ] Add application approval/rejection workflow.
- [ ] Add registration fee/deposit collection once payments are finalized.

## FTE Reporting

- [x] FTE report schema and migration exist.
- [x] Director FTE submission form exists.
- [x] Executive FTE review/correction/approval exists.
- [x] Current-week missing report tracker exists.
- [x] CSV export exists.
- [x] Executive bulk FTE CSV import/correction exists.
- [x] FTE trend visuals and school snapshots exist.
- [x] FTE notification dropdown escalation exists.
- [x] Vercel cron route exists for persistent missing-FTE notifications.
- [x] `CRON_SECRET` is configured in Vercel production.
- [x] Google Sheet backup/snapshot structure exists.
- [ ] Confirm the final reporting week cutoff/due time with Kid City USA operations.
- [x] Add full historical FTE trend filters by region/state/owner group.
- [x] Add executive manual edit table for inline corrections.
- [ ] Add email/SMS escalation for missing FTE reports if desired.
- [ ] Add final Google Sheet two-way reconciliation rules.

## ProCare Import And Cutover

- [x] ProCare import page/panel exists.
- [x] ProCare import API exists.
- [x] Import supports CSV and encrypted `.v10` workflow foundation.
- [x] Schema includes ProCare import batch/row tracking.
- [x] ProCare field coverage documentation exists.
- [x] Import can populate families, guardians, children, classrooms, staff, invoices, balances, and attendance/check log foundations.
- [ ] Run final import mapping against real exports from each live Kid City USA location.
- [ ] Confirm every ProCare field used by the schools is mapped or intentionally excluded.
- [x] Add import preview/diff UI before committing records.
- [x] Add rollback/export backup for imports.
- [ ] Add duplicate matching controls for families/children/guardians.
- [ ] Add final migration runbook for switching each location off ProCare.

## Attendance, Check-In, And Kiosk

- [x] Attendance page exists.
- [x] Check-in page exists.
- [x] Center-specific check-in page exists.
- [x] Kiosk lookup/check APIs exist.
- [x] Guardian 4-digit PIN model/hash support exists.
- [x] Director PIN setting API exists.
- [x] Attendance/check logs schema exists.
- [x] Kiosk guardrails exist for PIN security and attendance state.
- [x] Complete lobby tablet UX with idle/reset mode and large touch targets.
- [x] Add signature capture.
- [ ] Add QR/PIN options.
- [x] Add late pickup flag workflow.
- [x] Add staff kiosk mode.
- [x] Add parent authorization warnings during pickup.
- [x] Add end-of-day attendance reconciliation report.

## Classroom Operations And Teacher Workflows

- [x] Classroom dashboard exists.
- [x] Teacher portal/mobile view exists.
- [x] Teacher attendance API exists.
- [x] Teacher daily report API exists.
- [x] Teacher incident API exists.
- [x] Teacher media upload API exists.
- [x] Daily reports, meals, naps, diaper/potty logs, activities, incidents, and child media schema exists.
- [x] Supabase child media storage/signing support exists.
- [x] Complete teacher mobile task-entry workflow for all daily report fields.
- [x] Add classroom roster attendance board with fast check-in/check-out states.
- [x] Add batch logging for meals/naps/diapers/activities.
- [ ] Add classroom ratio warnings and staff assignment actions.
- [ ] Add offline/poor-connectivity strategy for classroom tablets.
- [x] Add teacher permissions separated from director/location users.

## Parent Engagement Portal

- [x] Parent portal page exists.
- [x] Parent portal workspace component exists.
- [x] Parent contact request API exists.
- [x] Parent incident acknowledgement API exists.
- [x] Parent media review API exists.
- [x] Parent media/photo review flow foundation exists.
- [x] Parent-facing daily report/media/account schema exists.
- [x] Complete parent account invitation/login flow for linked guardians.
- [x] Add parent dashboard for real balances, daily reports, photos, documents, announcements, and messages.
- [x] Add parent notification preferences.
- [x] Add parent document submission/review workflow foundation.
- [x] Add parent emergency contact/update request submission and director review queue foundation.
- [ ] Add push notifications/native app strategy.

## Billing, Ledger, Tuition, And Payments

- [x] Billing/invoices page exists.
- [x] Payments page exists.
- [x] Billing settings page exists.
- [x] Stripe Connect onboarding/status/refresh routes exist.
- [x] Stripe checkout route exists.
- [x] Stripe webhook route exists.
- [x] Billing guardrails and idempotency tests exist.
- [x] Schema covers billing accounts, invoices, invoice items, payments, ledger entries, products, tuition plans, and subscription placeholders.
- [x] Payment fee strategy has been defined: ACH recovery cap, card processing recovery, BEE Suite monthly/payment operations fees, and Kid City USA pilot waiver.
- [x] Complete parent tuition payment UI in parent portal.
- [x] Complete school payout onboarding UI for Stripe Connect.
- [ ] Finalize surcharge/convenience fee disclosures and legal review.
- [ ] Add real invoice generation/recurring tuition scheduler.
- [ ] Add payment method management.
- [ ] Add failed payment/retry workflow.
- [ ] Add ledger reconciliation reports.
- [x] Add subsidy/agency payment tracking.

## Messaging, Communication, And AI Assistant

- [x] Messages page exists.
- [x] Communications API exists.
- [x] Lead message API exists.
- [x] Announcement page exists.
- [x] Campaign page exists.
- [x] Mr. Bee AI route exists.
- [x] Message, announcement, campaign, AI summary, and AI suggestion schema exists.
- [x] SendGrid and Twilio env/integration placeholders exist.
- [ ] Complete two-way parent/director/teacher messaging UI.
- [x] Add real SendGrid email send paths for all communication workflows.
- [x] Add real Twilio SMS send/receive paths.
- [ ] Add message templates and merge fields.
- [ ] Add broadcast segmentation by classroom, center, status, and tag.
- [ ] Add AI reply suggestions directly inside message composer.
- [ ] Add human-review guardrails for sensitive AI outputs in UI.

## Forms, Documents, And E-Signature

- [x] Forms page exists.
- [x] Documents page exists.
- [x] Registration form API exists.
- [x] Signature request mock integration API exists.
- [x] Document/form/form submission schema exists.
- [ ] Build actual form builder UI.
- [ ] Complete required document checklist per family/staff/child.
- [ ] Add file upload UI tied to Supabase storage.
- [x] Add expiration reminders and document review states.
- [x] Integrate real e-signature provider or build internal signature capture.
- [ ] Add export package for licensing/records requests.

## Compliance And Incident Reporting

- [x] Compliance-readiness dashboard exists.
- [x] Incident reports page exists.
- [x] Teacher incident creation API exists.
- [x] Parent incident acknowledgement API exists.
- [x] Staff certification, background check placeholder, medical/allergy, document, and incident schema exists.
- [x] Language avoids guaranteed legal/licensing compliance.
- [ ] Add state-specific licensing configuration.
- [ ] Add emergency drill logs UI.
- [ ] Add medication log workflow.
- [ ] Add compliance report export.
- [ ] Add incident admin review workflow with parent acknowledgement status.
- [ ] Add compliance task assignment/reminders.

## Staff, Teachers, Scheduling, And Ratios

- [x] Teachers/staff page exists.
- [x] Staff profile, schedule, certification schema exists.
- [x] Staff counts and teacher counts are represented in dashboard/reporting.
- [x] Separation between location users/directors and classroom staff has been corrected at the data access level.
- [x] Dedicated director UI exists for adding/editing teacher profiles and certifications.
- [x] Complete staff CRUD UI with safe teacher deactivation instead of destructive deletion.
- [ ] Add teacher onboarding forms/documents.
- [x] Add background check tracking UI.
- [ ] Add staff time clock.
- [x] Add PTO/unavailability.
- [ ] Add ratio engine by age group/state rules.
- [x] Add staff schedule/calendar views.

## Calendar And Scheduling

- [x] Calendar page exists.
- [x] Tours, child schedules, billing due dates, compliance reminders, birthdays, and staff schedules are represented in schema/module definitions.
- [x] Google Calendar mock integration is represented in integrations/readiness.
- [x] Build full calendar UI with filters by center/classroom/user.
- [ ] Add Google Calendar real sync.
- [ ] Add recurring events/closures/holiday management.
- [x] Add staff schedule publishing.
- [ ] Add parent event visibility controls.

## Marketing, Campaigns, Reputation, And Reviews

- [x] Campaigns page exists.
- [x] Automations page exists.
- [x] Reputation/reviews page exists.
- [x] Campaign, automation, automation run, review, and survey schema exists.
- [x] Google Business Profile mock integration exists in structure.
- [ ] Build campaign editor and template library.
- [ ] Add automation workflow builder UI beyond foundation.
- [ ] Add campaign send scheduling and reporting.
- [ ] Add review request workflows.
- [ ] Add survey/NPS collection.
- [ ] Add AI review response generator in UI.

## Reporting And Analytics

- [x] Analytics/reporting page exists.
- [x] Executive dashboard reports CRM, FTE, occupancy/revenue readiness, and operational snapshots.
- [x] FTE-specific trend and snapshot visuals exist.
- [x] Readiness API exists.
- [ ] Add full report builder with filters/date ranges.
- [ ] Add lead source and funnel conversion dashboards.
- [ ] Add attendance/absence trend reporting.
- [ ] Add billing/revenue/AR reporting.
- [ ] Add parent response time and message analytics.
- [ ] Add export to CSV/PDF for key reports.

## Notifications

- [x] Notification center page exists.
- [x] Notification dropdown exists in app shell.
- [x] Notification summary API exists.
- [x] Derived alerts include inquiries, high-intent leads, tasks, tours, incidents, and FTE due items.
- [x] Persistent FTE reminder cron route exists.
- [x] Add read/unread mutation UI.
- [x] Add parent notification preferences.
- [ ] Add full notification preferences by role/user beyond parent portal.
- [ ] Add email/SMS/push delivery channels.
- [x] Add notification dedupe/retention policy.

## Integrations

- [x] Integrations page exists.
- [x] System readiness API exists.
- [x] Stripe integration foundation exists.
- [x] SendGrid integration foundation exists.
- [x] Twilio integration foundation exists.
- [x] Google Sheets backup support exists for inquiries and FTE.
- [x] Supabase storage/auth/database integration exists.
- [x] Google Calendar/Google Business Profile/Meta/Zapier/webhook/signature/cloud storage placeholders exist.
- [x] Complete real setup UI for each integration.
- [x] Add integration health checks and last-sync logs.
- [x] Add retry queues for failed outbound integrations.
- [ ] Add tenant-specific integration credentials instead of only platform env vars.

## Database, Security, Privacy, And Audit

- [x] Prisma schema covers core modules.
- [x] Migrations exist for CRM import, kiosk/parent engagement, FTE, tenant access/branding, ProCare metadata, Supabase public API hardening, Stripe hardening, and integration delivery queues.
- [x] Audit log schema and audit helper exist.
- [x] Sensitive workflows use server-side role/scope checks.
- [x] Supabase public API hardening migration exists.
- [x] Guardrail helper files exist for access grants, attendance, billing, dates, documents, notifications, operations, portal, readiness, kiosk, FTE, and storage.
- [x] Existing tests cover many guardrails.
- [ ] Run a formal Supabase advisor/security review after each schema migration.
- [x] Add RLS policy documentation for every exposed table.
- [x] Add encryption-at-rest/field-level encryption plan for medical/custody/payment-sensitive fields.
- [x] Add data retention/deletion policy.
- [x] Add audit log viewer filters and export.
- [x] Add backup/restore runbook.

## Testing And Quality Assurance

- [x] Typecheck script exists.
- [x] Lint script exists.
- [x] Build script exists.
- [x] Node test suite exists.
- [x] Guardrail tests cover several critical flows.
- [x] Playwright/browser checks have been used manually for important UI.
- [x] Add automated Playwright smoke tests for login, CRM, inquiry, FTE, kiosk, parent portal, and billing.
- [x] Add CI workflow that blocks deploys on typecheck/lint/test/build failure.
- [ ] Add staging environment separate from production.
- [ ] Add seed/test fixtures for every major role.
- [ ] Add error monitoring and uptime monitoring.

## Documentation And Operations

- [x] Architecture docs exist.
- [x] Product docs exist.
- [x] Deployment/go-live docs exist.
- [x] Inquiry intake docs exist.
- [x] Kid City CRM cutover docs exist.
- [x] Kiosk/parent engagement docs exist.
- [x] FTE reporting docs exist.
- [x] Stripe Connect docs exist.
- [x] ProCare field coverage docs exist.
- [x] Pricing/payment visuals exist.
- [x] In-school testing runbook exists.
- [x] Consolidate docs into one operator-facing launch handbook.
- [x] Create school director quick-start guide.
- [x] Create executive/admin quick-start guide.
- [x] Create parent onboarding guide once parent portal is production-ready.
- [x] Create incident response/support escalation guide.

## User-Facing Route Checklist

- [x] `/` public landing page.
- [x] `/login`.
- [x] `/reset-password`.
- [x] `/onboarding`.
- [x] `/dashboard`.
- [x] `/multi-location-dashboard`.
- [x] `/center-dashboard`.
- [x] `/fte-reports`.
- [x] `/classroom-dashboard`.
- [x] `/crm-leads`.
- [x] `/family-detail`.
- [x] `/child-profile`.
- [x] `/enrollment-pipeline`.
- [x] `/waitlist`.
- [x] `/tours`.
- [x] `/calendar`.
- [x] `/messages`.
- [x] `/announcements`.
- [x] `/campaigns`.
- [x] `/automations`.
- [x] `/forms`.
- [x] `/documents`.
- [x] `/attendance`.
- [x] `/daily-reports`.
- [x] `/parent-media-review`.
- [x] `/incident-reports`.
- [x] `/staff`.
- [x] `/billing-invoices`.
- [x] `/payments`.
- [x] `/compliance`.
- [x] `/reputation`.
- [x] `/analytics`.
- [x] `/ai-command`.
- [x] `/parent-portal`.
- [x] `/teacher-portal`.
- [x] `/agency-admin`.
- [x] `/white-label`.
- [x] `/team-permissions`.
- [x] `/integrations`.
- [x] `/billing-settings`.
- [x] `/notifications`.
- [x] `/audit-logs`.
- [x] `/help`.
- [x] `/check-in`.
- [x] `/check-in/[centerId]`.
- [x] `/registration`.
- [ ] Replace module-placeholder behavior with full CRUD workflows on every lower-priority operations page.

## API Route Checklist

- [x] Auth: login, logout, forgot password, reset password.
- [x] Admin: executive management.
- [x] AI: Mr. Bee assistant.
- [x] Billing: checkout session, Stripe webhook, Stripe Connect onboard/refresh/status.
- [x] Communications: messages.
- [x] Cron: FTE reminders.
- [x] Families: family/student intake.
- [x] FTE: list/export, submit/update, bulk import/correction.
- [x] Guardians: PIN management.
- [x] Health/readiness.
- [x] Imports: ProCare.
- [x] Inquiries: public inquiry intake and routing audit.
- [x] Integrations: push placeholder, signature requests, SMS placeholder.
- [x] Kiosk: lookup/check.
- [x] Leads: list/create/detail/update/messages/notes/tasks/tours.
- [x] Notifications: summary and read mutation.
- [x] Onboarding.
- [x] Operations records.
- [x] Parent: contact requests, incident acknowledgement, media review, invitations, preferences, and document submission.
- [x] Public Kid City locations.
- [x] Registration.
- [x] Teacher: attendance, daily reports, incidents, media.
- [ ] Add API-level automated tests for every route.
- [ ] Add rate limiting to all public and sensitive mutation routes.
- [ ] Add request/response logging with PII-safe redaction.

## Highest Priority Remaining Work

- [ ] Complete full ProCare import validation with real exports from active Kid City USA locations.
- [ ] Replace remaining executive-only demo data with real imported classroom/family/teacher data.
- [x] Finish parent portal account access, balances, tuition payment UI, daily report details, photo viewing, documents, and messages.
- [ ] Finish teacher classroom tablet workflows for daily logging.
- [x] Complete kiosk production UX with authorization/signature/late pickup workflows.
- [ ] Complete Stripe Connect payout onboarding and parent tuition checkout end-to-end.
- [x] Complete inquiry embed self-service generator for every tenant/location.
- [x] Add automated Playwright smoke tests and CI gate.
- [x] Add formal production runbook for live school support.
- [ ] Complete legal/privacy/security review before public SaaS launch beyond Kid City USA pilot.

