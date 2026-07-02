# Getting Started Graphics and Platform Refresh

Last updated: July 1, 2026

Use these graphics when onboarding owners, directors, teachers, parents, billing users, and support teams. They replace older one-off starter explanations with role-specific, platform-aware launch flows that match the current app modules.

## New Graphics

| Graphic | File | Use it for |
| --- | --- | --- |
| Getting started platform map | `public/brand/the-bee-suite/explainers/bee-suite-getting-started-platform-map-2026-07-01.svg` | Operator and implementation kickoff: cloud, data, payments, messaging, growth integrations, AI, migration, school configuration, and user training. |
| School launch swimlane | `public/brand/the-bee-suite/explainers/bee-suite-school-launch-swimlane-2026-07-01.svg` | School go-live meetings where each role needs clear handoffs and ownership. |
| Daily user quick start | `public/brand/the-bee-suite/explainers/bee-suite-daily-user-quick-start-2026-07-01.svg` | Role training packets and help-center articles for first-day actions. |

The landing page now includes these graphics before the earlier explainer graphics so prospective operators see the current launch process first.

## Platform-by-Platform Startup Notes

### Vercel / Next.js

1. Link the project and pull environment variables with `npm run cloud:link` and `npm run cloud:env`.
2. Run `npm run cloud:status` before deployment validation.
3. Use `npm run vercel-build` or `npm run cloud:validate` before production releases.
4. Keep secrets in Vercel environment variables only; do not paste secret keys into public scripts, WordPress, or docs screenshots.

### Supabase / Prisma

1. Apply migrations and generate Prisma with `npm run db:generate` and `npm run db:migrate` for deployed databases.
2. Confirm Supabase Auth recovery/setup emails are configured before inviting owners, directors, teachers, or parents.
3. Configure the private `child-media` bucket with `npm run supabase:setup-storage` before teacher photo sharing.
4. Keep service-role keys server-side and use signed URLs for protected child media.

### Stripe Connect

1. Configure platform keys, webhook secret, and method-specific payment configuration IDs.
2. Create or refresh connected accounts from Billing Settings or the school payout scripts.
3. Keep parent checkout blocked until the school connected account can accept charges and receive payouts.
4. Keep parent-paid processing recovery disabled until policy, disclosure, legal/accounting, refund, dispute, and acquirer/card-network review are approved.

### Twilio / Email

1. Configure Twilio SMS credentials and webhook base URL before SMS workflows are enabled.
2. Configure SendGrid or Mailgun for transactional school notifications, invitation emails, and inquiry alerts.
3. Respect notification preferences and avoid emergency or safety-critical automation without human review.

### Google, Meta, Zapier, and Webhooks

1. Configure Google Calendar credentials before enabling tour/event sync.
2. Configure Google/Gmail inquiry ingestion and Google Sheets backup only for approved operator accounts.
3. Configure Meta Lead Ads and Zapier/webhooks with per-tenant secrets and audit logging.
4. Re-run inquiry routing tests after any location ID, center email, or source mapping change.

### OpenAI / Mr. Bee

1. Add `OPENAI_API_KEY` only in server-side environments.
2. Treat AI output as draft suggestions, summaries, and next-step prompts.
3. Never let AI make final safety, custody, medical, legal, billing, compliance, or licensing decisions.
4. Keep staff review visible in workflows that use Mr. Bee.

### Procare / Migration Data

1. Import unencrypted Procare CSV exports only through approved internal workflows.
2. Preserve source IDs and unmapped columns for traceability.
3. Review duplicate matching before cutover.
4. Validate families, guardians, children, classrooms, staff, balances, attendance, documents, and medical/allergy notes with the school before parent invitations.

## Current Role Startup Order

1. Executives and owners approve pilot scope, center setup, payment policy, and support boundaries.
2. Directors complete the school setup checklist, import or create records, set classroom/PIN workflows, and run role smoke tests.
3. Teachers confirm profiles/classrooms, practice attendance, daily reports, media, incidents, messages, kiosk support, and offline queue expectations.
4. Parents accept portal invites, verify contacts/pickups, complete forms, review invoices, set payment methods when enabled, and use kiosk check-in/out.
5. Billing and compliance users confirm payout readiness, invoices, ledger exports, required documents, FTE reporting, licensing tasks, and exception handling.
6. Support monitors health checks, audit logs, request/response logs, escalation queues, notification delivery, and owner go/no-go decisions.

## Refresh Checklist

- [x] Add current platform map graphic.
- [x] Add current school launch swimlane graphic.
- [x] Add current role quick-start graphic.
- [x] Surface the new graphics on the public landing page.
- [x] Update README and product notes so shipped auth, RBAC, parent portal, teacher, kiosk, media, notification, billing, compliance, import, and reporting foundations are not described as placeholders.
- [x] Mark stale product documentation refresh complete in the completion checklist.

