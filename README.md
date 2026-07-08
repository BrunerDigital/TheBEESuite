# The BEE Suite

Childcare CRM, school operations, billing, parent portal, teacher portal, and executive reporting platform.

Last refreshed: July 8, 2026

The BEE Suite is a multi-tenant, white-label operating system for childcare brands and schools. It supports inquiry intake, enrollment, families, children, classrooms, staffing, tuition billing, Stripe Connect payout setup, parent communications, documents, compliance workflows, FTE reporting, role-specific portals, and human-reviewed AI assistance.

## Current State

- Production app: `https://thebeesuite.io`
- Hosting: Vercel project `the-bee-suite`
- Database/Auth/Storage: Supabase-backed Prisma application
- Payments: Stripe Checkout and Connect foundations with school payout onboarding and autopay billing workflows
- Communication: in-app messaging, SendGrid email paths, Twilio SMS foundations, notification preferences, and delivery logging
- Rollout focus: Kid City USA corporate schools, with Kokomo treated as live production data and Longmont used for import/payout testing

## Main User Flows

- Parents: `/parents` for parent login, `/parent-portal` for family account access, `/parents/setup` and `/parent-portal/setup` for onboarding/setup flows.
- Teachers: `/teachers` for teacher login and `/teacher-portal` for classroom-safe workflows.
- Directors: `/directors` for school operations login and `/dashboard`, `/messages`, `/billing-settings`, `/staff`, `/documents`, `/attendance`, `/daily-reports`, `/incident-reports`, `/fte-reports`, and related school modules.
- Executives: `/executives` for corporate login, `/multi-location-dashboard`, `/agency-admin`, `/team-permissions`, `/analytics`, `/fte-reports`, and cross-location reporting.
- Public/support: `/`, `/app`, `/registration`, `/check-in`, `/support`, `/resources`, `/privacy`, `/login`, `/forgot-password`, and `/reset-password`.

Most operating modules are served through `src/app/[slug]/page.tsx` with RBAC and center/family/classroom scoping enforced server-side.

## Tech Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, shadcn-style UI primitives, Recharts, and lucide-react.
- Prisma 6 with Supabase/Postgres.
- Supabase Auth session-cookie login plus server-side user/access-grant checks.
- Stripe Checkout, Connect, billing webhooks, payment method setup, autopay/dunning/reminder cron routes, and terminal store checkout.
- SendGrid/Twilio integration paths for email/SMS and in-app notification records.
- Playwright-assisted visual capture scripts and Node test coverage for core workflows.

## Repository Layout

```text
.
├── docs/                 Operational docs, SOPs, rollout plans, launch guides, security notes
├── ios/                  Capacitor iOS parent shell
├── native/               Static native/PWA shell helpers
├── output/               Committed launch screenshots, graphics, and printable deliverables
├── prisma/               Prisma schema, seed data, and migrations config
├── public/               Brand/public assets
├── scripts/              Import, rollout, payout, setup, graphics, and validation scripts
├── src/
│   ├── app/              App Router pages, role portal routes, API routes, cron routes
│   ├── components/       Workspace panels, forms, dashboards, portal UI, shared UI primitives
│   └── lib/              Auth, RBAC, billing, communications, import, reporting, Stripe/Supabase helpers
├── supabase/             Supabase config and SQL migrations
├── tests/                Node test suite for guardrails and critical workflows
└── wordpress-avada/      Kid City public inquiry embed snippets
```

## Local Setup

```bash
npm install
npm run cloud:link
npm run cloud:env
npm run dev
```

Open `http://localhost:3000`.

Use `.env.example` as the safe template. Do not commit `.env.local`, pulled production env files, SendGrid env files, or machine-specific Supabase/Vercel temp state.

For machine setup details, see [docs/LOCAL_CLOUD_SETUP.md](docs/LOCAL_CLOUD_SETUP.md).

## Common Commands

```bash
npm run lint
npm run typecheck
npm test
npm run vercel-build
npm run cloud:validate
```

Database and rollout helpers:

```bash
npm run db:generate
npm run db:migrate
npm run pilot:check
npm run kidcity:ensure-corporate-schools
npm run kidcity:prepare-school-payouts
```

Production Vercel builds use:

```bash
npm run vercel-build
```

That command runs Prisma generate, lint, typecheck, the full Node test suite, and `next build`.

## Environment Variables

Start from `.env.example`. Important production groups:

- App/auth: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, `AUTH_PASSWORD_RESET_REDIRECT_URL`
- Supabase/Postgres: `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, Connect/payment fee settings, payout settings, and `STRIPE_ACCOUNTS_V2_API_VERSION=2026-06-24.dahlia`
- Messaging: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, Twilio account/auth/from/webhook settings
- Operations: `CRON_SECRET`, `OPENAI_API_KEY`, Google Sheets/Calendar credentials where enabled

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/STRIPE_CONNECT.md](docs/STRIPE_CONNECT.md), and [docs/STRIPE_CONNECT_SETUP.md](docs/STRIPE_CONNECT_SETUP.md).

## Data And Rollout Guardrails

- Kokomo is a live production school in The BEE Suite. Do not reset, reseed, overwrite, rollback, or bulk-reimport Kokomo data.
- Use Longmont, staging, or approved test data for ProCare import and payout onboarding testing.
- Use import preview/diff, backups, audit logs, and spot checks before inviting parents or changing payment flows.
- Live parent payments must remain tied to Stripe Connect readiness, webhook reconciliation, school payout readiness, and approved fee disclosures.

Primary rollout checklist: [docs/KIDCITY_CORPORATE_ROLLOUT_CHECKLIST_2026-07-07.md](docs/KIDCITY_CORPORATE_ROLLOUT_CHECKLIST_2026-07-07.md).

## Documentation Index

- Product status: [docs/PRODUCT.md](docs/PRODUCT.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Security/privacy operations: [docs/SECURITY_PRIVACY_OPERATIONS.md](docs/SECURITY_PRIVACY_OPERATIONS.md)
- ProCare migration: [docs/PROCARE_LOCATION_MIGRATION_RUNBOOK.md](docs/PROCARE_LOCATION_MIGRATION_RUNBOOK.md)
- SOP library: [docs/sops/README.md](docs/sops/README.md)
- Public resources page content: [docs/sops/](docs/sops/)
- QA/change notes: [docs/qa-codex-change-notes/README.md](docs/qa-codex-change-notes/README.md)
- App Store packet: [docs/APP_STORE_SUBMISSION_PACKET.md](docs/APP_STORE_SUBMISSION_PACKET.md)

## Generated Assets

Committed launch assets live under:

- `output/playwright/fresh-screenshots-2026-07-07T16-22-06/`
- `output/playwright/bee-suite-graphics-2026-07-07/`
- `output/pdf/`
- `output/printables/`

These are retained as launch deliverables. Local runtime logs, temp files, `.next`, Supabase `.temp`, and pulled env files are ignored.

## AI And Safety

Mr. Bee and AI-assisted copy are suggestion tools only. Human review is required for family-facing, safety, medical, custody, billing, legal, licensing, or compliance-sensitive outputs.
