# Product Notes

Last updated: July 8, 2026

## Production-Ready in This v1

- Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui component foundation.
- Dark-mode-first premium SaaS interface with responsive sidebar, command/search chrome, route-driven modules, and mobile-friendly layout.
- Role-specific login surfaces at `/parents`, `/teachers`, `/directors`, and `/executives`, with automatic routing into parent, teacher, school-operations, or corporate workspaces.
- Executive, director/location, teacher, billing, and parent-facing portal surfaces with role-aware navigation and scoped data access enforcement.
- Supabase Auth/session-cookie login, forgot/reset password, forced first-login password reset, parent invitation/password setup, teacher login generation, login rate limiting, session revocation, and device-session controls.
- PostgreSQL-compatible Prisma schema covering tenancy, CRM, enrollment, families, children, staff, billing, communications, forms, documents, attendance, daily reports, incidents, compliance, marketing, automations, reviews, notifications, audit logs, integrations, white-label settings, and AI.
- Tenant, brand, owner-group, center, classroom, user, access-grant, brand-asset, brand-customization, feature-flag, DNS-verification request, and support-access audit foundations.
- CRM inquiry intake, lead routing, lead notes/tasks/messages/tours, scoped lead visibility, pipeline stages, public inquiry embed, and Google Sheet backup/snapshot foundations.
- Online registration, application approval/rejection, registration fee/deposit collection once payment approval is complete, enrollment checklists, requested uploads, and internal signature-request foundations.
- ProCare import page/API with unencrypted CSV support, batch/row tracking, family/guardian/child/classroom/staff/invoice/balance/attendance import foundations, preview/diff, rollback/export backup, duplicate matching controls, staff login generation, and migration runbook.
- FTE submission/review/correction/approval, CSV export, executive manual edit table, historical trend filters, missing-report tracking, notification escalation, cron reminders, and Google Sheet backup structure.
- Kiosk lookup/check foundations with guardian PINs, check-in/check-out handling, attendance logs, pickup verification warnings, staff kiosk support, and classroom attendance workflows.
- Teacher portal foundations for roster, attendance, daily reports, incidents, media, ratio warnings, staff assignment actions, teacher profile/photo setup, partial save, and offline/poor-connectivity guidance.
- Parent portal foundations for balances, tuition payment UI, daily reports, photos/media review, documents, messages and in-app replies, incidents, contact update requests, notification preferences, and guardian account invitations.
- Billing foundations for billing accounts, invoices, invoice items, payments, ledger entries, products, tuition plans, subsidy/agency tracking, Stripe Connect onboarding/status/refresh, Checkout, webhooks, payment-method setup/requests, autopay status, Friday recurring tuition scheduler, payment reminders, dunning, reconciliation reports, terminal store checkout, and Kid City software invoices.
- Communications foundations for parent/director/teacher messaging, director oversight of family-school threads, announcements, campaigns, templates/merge fields, notification preferences, SendGrid email delivery paths, Twilio SMS delivery/status foundations, inbound SMS handling, and delivery attempt logging.
- Compliance/operations foundations for documents, expirations, medication logs, emergency drills, licensing records, tasks, staff records, payroll/time-card reporting foundations, audit logs, exports, and readiness dashboards.
- Guardrail and quality foundations including lint/typecheck/build/test scripts, Node tests for critical workflows, Playwright smoke-test scripts, pilot readiness check, CI workflow, request/response logging with PII-safe redaction, RLS documentation, retention/deletion policy, backup/restore runbook, and legal/privacy/security review notes.

## Gated Before Wider Production Rollout

These capabilities have foundations in the app, but should not be treated as broadly live until the listed operational approvals, credentials, or real-school validations are complete.

- **Live school rollout:** complete the final Kokomo live-use punch list, role-by-role regression smoke, rollout wave order, launch owners, escalation contacts, cutover windows, and stop conditions.
- **Production accounts:** create dedicated smoke-test credentials and linked parent/guardian accounts for each pilot school; validate every role sees only the correct tenant, center, classroom, family, and child scope.
- **Real school data:** replace remaining demo-login classroom/family/parent/teacher fallbacks with real imported or manually loaded school data before operational use.
- **ProCare cutover:** run final import mapping against real exports from every active school and confirm every used field is mapped, transformed, or intentionally excluded.
- **Payments:** keep live parent checkout gated until Stripe connected payout onboarding, payment disclosures, refund/dispute handling, debit/prepaid handling, ACH/card recovery rules, and legal/accounting approval are complete per school.
- **Terminal store:** validate live pricing, markup, fulfillment owner, shipping/tax handling, and support handoff before allowing real hardware orders.
- **Messaging:** verify sender domains, DNS records, SendGrid authentication, Twilio compliance, SMS consent/opt-out language, school notification recipients, and real-family delivery settings.
- **Security/operations:** rotate any shared secrets, add/confirm staging, run Supabase advisor/security review after migrations, confirm RLS docs match the current schema, complete a backup restore drill, and add production error/uptime monitoring.
- **White-label/franchise:** finish actual logo/favicon upload storage and preview flows, custom-domain activation/deployment binding, complete owner-group management views, and granular permission editing before broad franchise/customer rollout.

## Current Rollout Notes

- Kokomo is live production in The BEE Suite and must not be reset, reseeded, overwritten, rolled back, or bulk-reimported.
- Longmont is the preferred first school for ProCare import and payout onboarding testing in the current corporate rollout wave.
- `corpschools@kidcityusa.com` is expected to manage payout setup across the corporate-owned schools from one login rather than logging into every school profile.
- Production Stripe Accounts v2 calls should use `STRIPE_ACCOUNTS_V2_API_VERSION=2026-06-24.dahlia`.

## Known Limitations

- Workflow builder foundations exist, but a full no-code automation builder and marketplace of reusable automation templates are future scope.
- Native iOS/Android apps, true mobile push notifications, and offline-native sync are future scope; current access is web/PWA oriented.
- Google Calendar, Google Business Profile, Meta Lead Ads, Zapier/webhook, and other provider integrations need tenant-specific credential setup and production validation before being called complete.
- OpenAI/Mr. Bee assistance should remain human-reviewed and gated by sensitive-output rules before broad use.
- Licensing exports, jurisdiction-specific compliance configuration, curriculum/lesson planning, developmental milestones, meal planning/CACFP, payroll-provider exports, and multi-state compliance packs remain roadmap items.
- Compliance-readiness workflows do not guarantee legal, licensing, payroll, payment, tax, or accounting compliance without customer-specific professional review.

## Customize First For Each School

- Brand name, logo, colors, legal footer, domain, parent portal labels, and school contact details.
- Center/classroom age groups, capacity, ratio configuration, schedules, and teacher assignments.
- Enrollment pipeline stage labels, registration fields, required uploads, policy acknowledgements, and enrollment checklist items.
- Tuition plans, fees, discounts, subsidy rules, invoice cadence, ledger balances, payment disclosures, and refund/dispute procedures.
- Role permissions, user access grants, support contacts, escalation owners, and sensitive-field visibility.
- Message, campaign, announcement, billing notice, FTE reminder, document reminder, emergency, and non-emergency templates.

## Recommended Next Integrations / Operational Setups

- Staging environment and release validation data for every major role.
- Production monitoring, uptime alerting, and scheduled backup restore drills.
- Supabase Storage or S3-compatible storage hardening for documents/media.
- Stripe Connect live onboarding and payment policy approval per school.
- Twilio Messaging compliance and sender setup per school or tenant.
- SendGrid sender/domain authentication per tenant or brand.
- Google Calendar and Google Sheets production credential validation.
- Signature provider production account and template mapping.
- Webhooks/Zapier/API partner workflows for agency/franchise operations.
- OpenAI configuration with human-review rules and tenant-level enablement.

## V2/V3 Roadmap

- Native mobile app and native push notifications.
- Full no-code workflow builder and automation-template marketplace.
- Advanced franchise reporting and public website/funnel builder.
- Full payroll-provider exports, deductions, accruals, and accounting integrations.
- Curriculum and lesson planning.
- Developmental milestones, portfolios, assessments, and standards exports.
- Meal planning and CACFP tracking.
- Multi-state licensing configuration and jurisdiction-specific export packs.
- Advanced AI enrollment forecasting and parent satisfaction intelligence.
- Expanded public API, partner webhooks, and third-party app marketplace.
