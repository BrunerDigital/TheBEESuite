# The Bee Suite

Childcare & Preschool CRM/Operations Platform

The Bee Suite is a white-label childcare CRM and operations command center for leads, tours, enrollment, families, children, classrooms, staff workflows, billing, parent communication, compliance-ready documentation, reporting, and human-reviewed AI assistance.

## Built

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Prisma.
- Premium dark-mode-first SaaS UI with light-mode tokens.
- Executive dashboard plus route-driven surfaces for all 40 requested pages.
- PostgreSQL-compatible schema and realistic seed script.
- Mock integration structure for Stripe, Twilio, SendGrid/Mailgun, Google Calendar, Google Business Profile, Meta Lead Ads, OpenAI, Zapier/webhooks, signatures, and cloud storage.
- Documentation for architecture, deployment, Supabase, Prisma, go-live, AI guardrails, privacy, and roadmap.

## File Tree

```text
.
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── PRODUCT.md
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── [slug]/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── app-shell.tsx
│   │   ├── dashboard.tsx
│   │   ├── module-page.tsx
│   │   └── ui/
│   └── lib/
│       ├── demo-data.ts
│       └── utils.ts
├── .env.example
├── components.json
├── package.json
└── README.md
```

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Database

Set `DATABASE_URL` in `.env`, then run:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Production CRM, inquiry intake, dashboard, reporting, users, center profiles, and operational pages are backed by the configured database. `src/lib/demo-data.ts` now only supplies static navigation/module metadata and safe fallback labels for setup-oriented pages.

## Routes

Public landing page: `/`

Primary dashboard: `/dashboard`

Auth and setup: `/login`, `/forgot-password`, `/onboarding`

Product pages include `/multi-location-dashboard`, `/center-dashboard`, `/classroom-dashboard`, `/crm-leads`, `/family-detail`, `/child-profile`, `/enrollment-pipeline`, `/waitlist`, `/tours`, `/calendar`, `/messages`, `/announcements`, `/campaigns`, `/automations`, `/forms`, `/documents`, `/attendance`, `/daily-reports`, `/incident-reports`, `/staff`, `/billing-invoices`, `/payments`, `/compliance`, `/reputation`, `/analytics`, `/ai-command`, `/parent-portal`, `/teacher-portal`, `/agency-admin`, `/white-label`, `/team-permissions`, `/integrations`, `/billing-settings`, `/notifications`, `/audit-logs`, and `/help`.

## Environment Variables

Use `.env.example` as the guide. External services stay gated until explicitly connected:

- `DATABASE_URL`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `SENDGRID_API_KEY` or `MAILGUN_API_KEY`
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_BUSINESS_PROFILE_CLIENT_ID`
- `META_LEAD_ADS_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `ZAPIER_WEBHOOK_SECRET`
- `SIGNATURE_PROVIDER_API_KEY`
- `CLOUD_STORAGE_BUCKET`

## Deployment

See `docs/DEPLOYMENT.md` for Vercel, Supabase, Prisma, and go-live steps.

## Screenshots / Visual Previews

The design concept was generated with Image Gen and used as the implementation reference for the premium dark SaaS command center. Run the app locally to preview the executive dashboard and module pages.

## Production-Ready vs Placeholder

Production-ready foundation: app shell, responsive UI, shadcn component system, dashboard visuals, module routes, data model, seed strategy, docs, and environment structure.

Connected/live foundation: custom auth session flow, server-side role and center scoping, CRM lead creation/editing, Kid City inquiry routing, SendGrid notifications, Google Sheets inquiry backup, Stripe Connect setup flow, reporting snapshots, and audit logging.

Gated next phase: real parent payment processing, SMS/push, calendar sync, review sync, lead ad sync, e-signatures, document/media storage, kiosk mode, QR/PIN check-in, and licensing exports.

## Security and Privacy Notes

Sensitive child, custody, medical, billing, incident, and compliance data must be role-filtered, audited, and encrypted where appropriate. The UI marks restricted workflows, and the schema includes audit-log and restricted-field foundations. The product provides compliance-ready documentation support only and does not provide legal or licensing advice.

## AI Guardrails

AI is labeled as suggestions only. Human review is required for sensitive outputs. AI must not make final safety, medical, legal, custody, billing, or compliance decisions.

## Next Priorities

1. Connect authentication and server-side RBAC.
2. Wire Prisma reads/writes into the route surfaces.
3. Build real enrollment pipeline drag-and-drop.
4. Implement parent/teacher mobile workflows as dedicated experiences.
5. Connect Stripe test mode, email, SMS, storage, and OpenAI behind guardrails.

