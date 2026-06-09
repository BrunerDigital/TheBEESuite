# Deployment Guide

## Vercel

1. Push the repository to GitHub.
2. Create a Vercel project from the repository.
3. Set environment variables from `.env.example`.
4. Add `DATABASE_URL` for a production Postgres database.
5. Run `npm run db:generate` during build if your deployment flow needs Prisma Client generation.
6. Deploy with the default Next.js settings.

Recommended Vercel build command:

```bash
npm run build
```

## Supabase Setup

1. Create a Supabase project.
2. Copy the pooled Postgres connection string into `DATABASE_URL`.
3. If using Supabase Auth, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Run:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

5. Add Row Level Security policies before production. Scope every table by tenant, organization, center, classroom, family, or child as appropriate.

## Prisma Setup

Local Postgres:

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

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
