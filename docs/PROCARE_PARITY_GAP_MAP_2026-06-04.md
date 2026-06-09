# BEE Suite Procare Parity Gap Map

Last updated: June 4, 2026

This map translates the supplied Procare public-source feature catalogue into the current BEE Suite build queue. It is not a Procare entitlement or pricing matrix. It is a practical product parity tracker for what BEE Suite needs to support for Kid City USA operations and future childcare customers.

Status legend:
- `[x]` Covered, deployed, or strong enough for live validation.
- `[~]` Partially covered; usable foundation exists but important workflow depth remains.
- `[ ]` Major gap still requiring build work, business rules, vendor setup, or production validation.

## Current Strengths

- [x] Multi-tenant/franchise architecture, executive dashboards, school dashboards, role-scoped access, active school management, and live inquiry routing.
- [x] CRM inquiry capture, 94 active-location dropdown, location-specific lead routing, lead tasks/notes/messages/tours, UTM capture, and Google Sheets backup.
- [x] Family, guardian, child, classroom, teacher profile, authorized pickup, PIN, child profile, and school-managed parent/teacher account foundations.
- [x] Parent portal with family snapshot, child schedules, documents, announcements, incidents, daily reports, photos, billing balance, invoices, ledger, and payment actions.
- [x] Teacher portal with roster, quick attendance, daily reports, meals, naps, diapers/potty, activities, incidents, and classroom media upload foundation.
- [x] Billing workbench with products, single-family invoices, batch tuition/fees, recurring monthly tuition cron, ledger entries, AR aging, reconciliation metrics, Stripe Checkout, and parent pay balance CTA.
- [x] Attendance/check-in foundation with PIN verification, kiosk state guardrails, signature capture, late pickup flags, authorized pickup warnings, and end-of-day reconciliation.
- [x] FTE reporting, executive review/corrections, bulk import, missing-report notifications, trends, snapshots, CSV export, and scheduled reminder cron.

## Procare Feature Areas Mapped To BEE Suite

| Procare area | BEE Suite status | Notes / next action |
| --- | --- | --- |
| Childcare center management | [~] | Core dashboards, centers, classrooms, active schools, family data, and operating reports exist. Remaining gaps: polished executive CRUD states, bulk imports, ratio engine, staff assignment actions. |
| Family and child profiles | [~] | Family/guardian/child editing, PINs, classroom assignment, documents, medical/custody fields exist. Remaining gaps: complete all field editors, custody warnings across every staff surface, merge/dedupe. |
| Enrollment and registration | [~] | Inquiry CRM, online registration, waitlist/tours, routing, lead workflow exist. Remaining gaps: actual form builder UI, registration fee/payment depth, final ProCare field mapping. |
| Attendance tracking | [~] | Kiosk/PIN/signature/check logs and teacher quick attendance exist. Remaining gaps: QR check-in, staff kiosk mode, offline tablet strategy. |
| Parent communication | [~] | Parent/director/teacher portal messaging, templates, merge fields, broadcast segmentation, AI composer suggestions, and SendGrid/Twilio delivery paths exist. Remaining gaps: production sender validation, opt-out/consent verification, and push/native app strategy. |
| Parent app / portal | [~] | Web parent portal covers balances, payments, daily reports, docs, messages, preferences, incidents, and photos. Remaining gaps: native app/push, full self-service change approval, payment method management/autopay. |
| Staff app / teacher tools | [~] | Teacher portal covers classroom task entry, attendance, incidents, media, and daily reports. Remaining gaps: classroom chat polish, staff time clock, schedule actions, ratio warnings. |
| Billing and payments | [~] | Stripe Checkout, invoices, ledger, recurring monthly tuition, batch billing, AR aging, and parent payments exist. Remaining gaps: autopay/payment methods, failed payment dunning, subsidies/agencies, weekly cadence, legal fee disclosures. |
| Tuition management | [~] | Products, tuition plans, batch billing, child-level recurring assignments, and monthly automation exist. Remaining gaps: weekly/daily cadence, sibling discounts, deposits, late fees, attendance-based billing depth. |
| Subsidy / agency payments | [ ] | Schema-adjacent billing foundation exists, but subsidy ledgers, agency invoices, co-pay separation, aging, and agency reports are not complete. |
| Classroom management | [~] | Classrooms, rosters, teacher portal, attendance, incidents, daily reports, and media exist. Remaining gaps: ratio rules/alerts, name-to-face workflow, capacity/staff planning. |
| Lesson planning / curriculum | [ ] | Not yet implemented beyond activity/daily report foundations. Needs lesson plans, learning objectives, standards, milestones, portfolios, and assessment exports. |
| Daily reports | [x] | Teacher daily report entry supports meals, naps, diapers/potty, activities, supplies, notes, mood, parent-send flag, and parent portal visibility. |
| Meals, naps, diapers, activities | [~] | Activity entry exists. Remaining gaps: meal planning/counts, CACFP-style categories, dashboard reminders, and reimbursement exports. |
| Child development tracking | [ ] | Needs milestones, assessments, standards, portfolios, and export/reporting workflows. |
| Staff management | [~] | Teacher profiles, classroom assignment, credentials, background/certification reminders, and login provisioning exist. Remaining gaps: time clock, payroll/timecards, schedule comparison, staff messaging depth. |
| Staff scheduling | [~] | Staff schedules exist in schema/UI foundation. Remaining gaps: schedule editing depth, coverage alerts, ratio-aware staffing recommendations. |
| Time clock / payroll | [ ] | Staff time clock, breaks, timecards, payroll exports, deductions, accruals, and Gusto/QuickBooks workflows are not complete. |
| Compliance and licensing | [~] | Incidents, documents, compliance dashboard, attendance signatures, allergies/medical/custody foundations, state licensing configuration, emergency drill logs, medication logs, compliance task reminders, exports, and incident review with parent acknowledgement status exist. Remaining gaps: formal state/licensing review, school-specific rule configuration, and validated licensing export package expectations. |
| Reporting and analytics | [~] | Dashboards, CRM/FTE/billing/AR metrics, exports, and audit logs exist. Remaining gaps: custom reports, saved report library, room/program insight depth, subsidy and licensing reports. |
| Messaging and notifications | [~] | Notifications, summary API, dedupe/retention policy, portal messaging, announcements, campaigns, automations, templates, merge fields, broadcast segmentation, role preferences, and email/SMS delivery paths exist. Remaining gaps: production sender validation, opt-out/consent verification, inbound SMS polish, and push/native app strategy. |
| Photo and video sharing | [~] | Teacher media upload foundation and parent media review exist. Remaining gaps: gallery editing depth, download controls, video-specific verification, permission enforcement polish. |
| Digital forms and documents | [~] | Documents, forms, registration, signature request mock, parent submissions, status tracking exist. Remaining gaps: form builder UI, Supabase upload UI, e-signature provider/internal signature completion, expiration reminders. |
| Waitlist / lead / CRM | [x] | Strong CRM foundation with routing, leads, tasks, notes, messages, tours, stages, waitlists, active schools, and verified 94-location routing. |
| Marketing / enrollment growth | [~] | Lead capture, UTM/source capture, campaigns/automations foundations exist. Remaining gaps: nurture delivery channels, pipeline analytics depth, IntelliKid-like automation if desired. |
| Security and permissions | [~] | Role-scoped UI/data, access grants, audit logs, session versioning, guarded routes, and portal guardrails exist. Remaining gaps: MFA, granular permission editor, support impersonation with audit warning. |
| Integrations | [~] | Stripe, Supabase, SendGrid/Twilio foundations, Google Sheets backup, retry queues, and health checks exist. Remaining gaps: live email/SMS delivery, QuickBooks/Gusto, e-signature, background check, curriculum partners. |
| Mobile app capabilities | [ ] | Web portals exist. Native iOS/Android and push/offline behavior are future scope unless we build a PWA/native wrapper. |
| Administrative controls | [~] | School settings foundations, active locations, users, classrooms, teachers, billing settings, notifications, and operations record hub exist. Remaining gaps: polished dedicated editors for every setting. |
| Multi-site / franchise | [~] | Executive/multi-location dashboards and active school management exist. Remaining gaps: corporate templates, multi-center report library, enterprise permission groups, audit analytics. |
| Automation | [~] | FTE reminder cron, recurring tuition cron, CRM automation foundations, retry queues, and notifications exist. Remaining gaps: payment dunning, document reminders, attendance/billing automation depth. |

## Highest-Impact Build Queue

1. Validate production messaging sender setup, SMS consent/opt-out language, notification recipients, and school-specific message/announcement template configuration.
2. Complete document upload, review, expiration reminders, and internal/e-signature workflows.
3. Add QR check-in and staff kiosk/time clock so attendance and payroll foundations become operational.
4. Build classroom ratio rules, warnings, and staff assignment actions.
5. Extend billing with weekly cadence, discounts/late fees/deposits, failed payment dunning, autopay/payment method setup, and subsidy/agency accounting.
6. Add lesson planning, milestones, assessments, and child portfolios after core operations are stable.
7. Add deeper reporting: custom reports, saved filters, compliance exports, subsidy aging, and multi-center analytics.

## Needs Business Or Vendor Input

- Fee disclosures and legal review for card/ACH processing and parent surcharges.
- Stripe connected account onboarding for every payout owner before live parent payments at that school.
- SendGrid/Twilio sender identities, opt-in language, SMS compliance rules, and emergency messaging expectations.
- State-by-state licensing, ratio, medication, document, meal/CACFP, and subsidy reporting requirements.
- Whether native mobile apps are required now, or whether a responsive web/PWA experience is acceptable for the first production phase.
- Whether curriculum/assessment features should be built in-house or integrated with a third-party curriculum provider.
