# Go-Live: GitHub, Supabase, and Vercel

## 1. GitHub

Create a GitHub repository, then push this local repo:

```bash
git remote add origin https://github.com/YOUR_ORG/the-bee-suite.git
git push -u origin main
```

CI runs lint, typecheck, tests, Prisma client generation, and production build on pushes to `main`.

Local smoke checks can be run before or after deployment:

```bash
npm run test:smoke
SMOKE_BASE_URL=https://thebeesuite.io npm run test:smoke
```

For Kid City USA operations, production smoke testing targets `https://thebeesuite.io`. Local server smoke mode is only for developer troubleshooting and is enabled with `SMOKE_LOCAL=1`.

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
NEXT_PUBLIC_INQUIRY_TURNSTILE_SITE_KEY
INQUIRY_TURNSTILE_SECRET_KEY
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

Public intake routes include best-effort in-process burst limits:

```text
/api/inquiries
/api/onboarding
/api/auth/forgot-password
```

Keep Vercel firewall/WAF or a dedicated abuse-prevention layer on the roadmap for production scale.

The public `/api/onboarding` route creates a gated trial workspace: tenant, brand, organization, primary center, brand-admin user, white-label defaults, setup integrations, audit log, and a center-linked inquiry embed code. Supabase Auth receives the user server-side with the service key and the user should set their own password through the recovery/setup email. Live checkout and parent engagement workflows remain disabled until the workspace is reviewed and connected.

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
STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID
STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID
STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES=true
STRIPE_ACH_PROCESSING_RECOVERY_BPS=80
STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS=500
STRIPE_CARD_PROCESSING_RECOVERY_BPS=290
STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS=30
STRIPE_CARD_PROCESSING_RECOVERY_GROSS_UP=true
STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS=75
STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS=kid-city-usa
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
TWILIO_MESSAGING_SERVICE_SID
TWILIO_WEBHOOK_BASE_URL
```

Configure the Twilio sender or Messaging Service with these production callbacks:

- Inbound messages: `https://thebeesuite.io/api/twilio/inbound`
- Delivery status callback: `https://thebeesuite.io/api/twilio/status`

Use `TWILIO_MESSAGING_SERVICE_SID` in production when available; `TWILIO_FROM_NUMBER` remains the fallback sender.

Push notifications currently create in-app notifications and expose a provider hook through `PUSH_PROVIDER_KEY`.
Signature requests create document records and send email when SendGrid is configured; DocuSign-style API credentials can be added with `DOCUSIGN_INTEGRATION_KEY` / `SIGNATURE_PROVIDER_API_KEY`.

Do not enable live payments for families until tuition policies, refund handling, connected account ownership, Stripe dispute/negative-balance responsibilities, webhook retries, school payout support procedures, and platform fee rules are approved.
