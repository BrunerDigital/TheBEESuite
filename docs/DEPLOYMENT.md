# Deployment Guide

## Vercel

1. Push the repository to GitHub.
2. Connect the Vercel project `the-bee-suite` to `BrunerDigital/TheBEESuite`.
3. Set environment variables from `.env.example`, scoped separately for production, preview, and development.
4. Add `DATABASE_URL` for the production Postgres database.
5. Keep deployments flowing through GitHub branches and Vercel previews.

Recommended Vercel build command:

```bash
npm run vercel-build
```

## Supabase Setup

1. Create a Supabase project.
2. Copy the pooled Postgres connection string into `DATABASE_URL`.
3. If using Supabase Auth, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY`. `SUPABASE_SERVICE_ROLE_KEY` remains a legacy fallback only.
4. Run:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

5. Add Row Level Security policies before production. Scope every table by tenant, organization, center, classroom, family, or child as appropriate.

## Prisma Setup

Cloud development:

```bash
npm run cloud:link
npm run cloud:env
npm run db:generate
npm run dev
```

Local Postgres remains a fallback only. See `docs/CLOUD_DEVELOPMENT.md` for the preferred Codespaces workflow.

## Go-Live Checklist

- Connect production auth and enforce RBAC server-side.
- Add tenant-scoped database query helpers.
- Add encryption/key management for restricted child, custody, medical, billing, and compliance data.
- Configure audit logging for sensitive reads and writes.
- Configure Stripe Connect platform keys, school payout onboarding, webhook signing, and platform fee rules.
- Validate parent checkout, connected account payouts, application fees, refunds, and disputes in Stripe test mode before enabling live mode.
- See `docs/STRIPE_CONNECT.md` and `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md` for the exact webhook URL, event list, Vercel variables, processing recovery approval gate, and payout onboarding flow.
- Review all compliance-readiness language with counsel/licensing experts.
- Add backup, retention, and deletion policies.
- Add monitoring, error reporting, and security headers.
- Perform accessibility, responsive, load, and privacy reviews.
