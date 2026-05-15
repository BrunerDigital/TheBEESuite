# Go-Live: GitHub, Supabase, and Vercel

## 1. GitHub

Create a GitHub repository, then push this local repo:

```bash
git remote add origin https://github.com/YOUR_ORG/the-bee-suite.git
git push -u origin main
```

CI runs lint, typecheck, Prisma client generation, and production build on pushes to `main`.

## 2. Supabase

Create a Supabase project and copy the pooled database connection string.

Set local `.env`:

```bash
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

Apply the schema with either Prisma:

```bash
npm run db:push
npm run db:seed
```

Or apply the generated SQL migration:

```bash
supabase db push
```

Migration file:

```text
supabase/migrations/202605130001_initial_bee_suite.sql
```

Before real production use, add RLS policies, tenant-scoped query enforcement, and storage bucket policies.

## 3. Vercel

Import the GitHub repo into Vercel.

Build settings are included in `vercel.json`:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run vercel-build"
}
```

Add Vercel environment variables from `.env.example`, especially:

```text
DATABASE_URL
NEXT_PUBLIC_APP_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AUTH_SECRET
AUTH_PASSWORD_RESET_REDIRECT_URL
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
INQUIRY_NOTIFICATION_EMAILS
ONBOARDING_NOTIFICATION_EMAILS
```

Use preview deployments first, then promote to production after auth, RBAC, RLS, and integration checks are complete.

For Supabase Auth password recovery, add this redirect URL in the Supabase Auth settings:

```text
https://YOUR_DOMAIN/reset-password
```

Then set `AUTH_PASSWORD_RESET_REDIRECT_URL` in Vercel to the same URL. The `/forgot-password` page sends the recovery email, and `/reset-password` completes the password update after Supabase redirects the user back with a recovery token.

Readiness checks:

```text
GET /api/health
GET /api/system/readiness
```

`/api/health` is public and only reports database reachability. `/api/system/readiness` requires a signed-in platform, brand, or regional user and returns non-secret launch status for Supabase Auth, Kid City center data, inquiry intake, Google Sheets, SendGrid, Stripe Connect, and Twilio.

## 4. Payments, Payouts, SMS, Push, and Signature Requests

The server routes are live-ready but remain safe when credentials are missing.
See `docs/STRIPE_CONNECT_SETUP.md` for the dedicated Stripe Connect platform and school payout runbook.

Stripe should be configured as a Connect platform. The Bee Suite platform account creates Checkout Sessions for parent payments, retains the configured platform fee, and transfers the remainder to the selected school's connected payout account.

Required for Stripe Checkout and Connect:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_APP_URL
STRIPE_ACCOUNTS_V2_API_VERSION
STRIPE_APPLICATION_FEE_BPS
STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=false
STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT=true
```

Configure the Stripe webhook endpoint as:

```text
https://YOUR_DOMAIN/api/billing/stripe-webhook
```

Listen for these Stripe events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
account.updated
v2.core.account[requirements].updated
```

New customer payout workflow:

1. Add the platform Stripe keys in Vercel.
2. Open `Billing Settings` in The Bee Suite.
3. For each school, click `Set up` or `Continue` in the Stripe Connect payout table.
4. The authenticated school owner or payout admin completes Stripe-hosted onboarding.
5. Return to The Bee Suite; the payout table auto-syncs status, and the `Check` button can refresh it later.
6. Parent checkout remains blocked for that school until Stripe reports payouts are enabled.

Use destination-charge Checkout Sessions for parent payments. Do not enable platform-only parent payments except for a controlled internal test, because those funds would remain on the platform account instead of routing to the school.

Required for Twilio SMS:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

Push notifications currently create in-app notifications and expose a provider hook through `PUSH_PROVIDER_KEY`.
Signature requests create document records and send email when SendGrid is configured; DocuSign-style API credentials can be added with `DOCUSIGN_INTEGRATION_KEY` / `SIGNATURE_PROVIDER_API_KEY`.

Do not enable live payments for families until tuition policies, refund handling, connected account ownership, Stripe dispute/negative-balance responsibilities, webhook retries, school payout support procedures, and platform fee rules are approved.
