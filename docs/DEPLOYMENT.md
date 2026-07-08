# Deployment Guide

Last updated: July 8, 2026

The BEE Suite production app is deployed on Vercel from GitHub and uses Supabase/Postgres, Supabase Auth/Storage, Prisma, Stripe, SendGrid, and Twilio-backed runtime configuration.

## Production Target

- Live app: `https://thebeesuite.io`
- Vercel project: `the-bee-suite`
- Vercel scope: `brunerdigitals-projects`
- GitHub repository: `BrunerDigital/TheBEESuite`
- Framework: Next.js 16 App Router
- Production build command: `npm run vercel-build`

`npm run vercel-build` runs:

```bash
prisma generate && npm run lint && npm run typecheck && npm test && next build
```

## Local Cloud Setup

```bash
npm install
npm run cloud:link
npm run cloud:env
npm run dev
```

Use `.env.example` as the safe template. `npm run cloud:env` pulls production Vercel envs into a local pulled env file and then syncs the local runtime file through `scripts/sync-local-env.mjs`.

Do not commit `.env.local`, pulled Vercel env files, SendGrid env files, local Supabase temp state, Vercel project state, or logs.

## Vercel Deployment

Standard production deploy:

1. Commit and push `main`.
2. Vercel Git integration builds the pushed commit.
3. Confirm the deployment reaches `READY`.
4. Confirm production aliases include `thebeesuite.io` and `www.thebeesuite.io`.
5. Run a live health check:

```bash
Invoke-WebRequest -Uri "https://thebeesuite.io/api/health" -UseBasicParsing
```

Useful CLI commands:

```bash
npx vercel ls --scope brunerdigitals-projects
npx vercel inspect <deployment-url-or-id> --scope brunerdigitals-projects
npx vercel redeploy <deployment-id> --target production --scope brunerdigitals-projects
```

When changing Vercel env vars, redeploy production afterward. Existing deployments do not pick up changed env values.

## Required Environment Groups

Core app/auth:

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `AUTH_SECRET`
- `AUTH_PASSWORD_RESET_REDIRECT_URL`
- `CRON_SECRET`

Supabase/Postgres:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

Stripe:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe Connect, fee, payment method configuration, and payout readiness settings from `.env.example`
- `STRIPE_ACCOUNTS_V2_API_VERSION=2026-06-24.dahlia`

Messaging/integrations:

- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- Twilio account/auth/from/webhook settings
- Google Sheets/Calendar credentials where enabled
- `OPENAI_API_KEY` when Mr. Bee features are enabled

## Database And Migrations

Local development:

```bash
npm run db:generate
npm run db:push
```

Production/staged migration flow:

```bash
npm run db:generate
npm run db:migrate
```

Do not use destructive reset or reseed commands against production. Kokomo is live production data and must not be reset, reseeded, overwritten, rolled back, or bulk-reimported.

## Supabase Setup

1. Link the Supabase project and keep local CLI state out of Git.
2. Apply migrations through the approved deployment/migration process.
3. Configure Auth redirect URLs for:
   - `https://thebeesuite.io/reset-password`
   - local development reset URLs when needed
4. Ensure storage buckets and policies match `scripts/setup-supabase-storage.ts` and the current migrations.
5. Keep service-role credentials only in Vercel/local secret env files.

## Stripe Go-Live Checklist

Before enabling live parent payments for a school:

- Stripe connected account exists for the correct center.
- Account can accept charges and receive payouts.
- Webhook reconciliation is configured and tested.
- Payment method setup, ACH/card behavior, payment reminders, dunning, refunds/disputes, and fee recovery disclosures are approved.
- Director/corporate user has verified tuition plans and recurring Friday billing behavior.
- School payout setup is complete through Stripe-hosted onboarding; bank/routing data is never stored in The BEE Suite.

See [STRIPE_CONNECT.md](STRIPE_CONNECT.md), [STRIPE_CONNECT_SETUP.md](STRIPE_CONNECT_SETUP.md), and [PAYMENT_PROCESSING_RECOVERY_REVIEW.md](PAYMENT_PROCESSING_RECOVERY_REVIEW.md).

## Pre-Deploy Validation

Run at minimum:

```bash
npm run lint
npm run typecheck
npm test
```

For production parity:

```bash
npm run vercel-build
```

For broader release checks:

```bash
npm run cloud:validate
npm run pilot:check
```

## Post-Deploy Validation

- Confirm Vercel deployment state is `READY`.
- Hit `/api/health` on the production domain.
- Check Vercel runtime errors for the last 15 minutes.
- Smoke the role-specific login entry points: `/parents`, `/teachers`, `/directors`, `/executives`.
- For billing changes, smoke Stripe Connect readiness and webhook logs before enabling school payments.
- For rollout/import changes, verify center scope and do not test with Kokomo destructive operations.
