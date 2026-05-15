# Stripe Connect Setup

The Bee Suite is configured as the Stripe platform. Parents pay through platform-owned Checkout Sessions, and each school receives funds through its connected payout account.

## Vercel Environment Variables

Add these to the Vercel production environment:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_ACCOUNTS_V2_API_VERSION=2026-04-22.dahlia
STRIPE_APPLICATION_FEE_BPS=0
STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=false
STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT=true
STRIPE_CHECKOUT_ON_BEHALF_OF=false
```

`STRIPE_APPLICATION_FEE_BPS` is basis points. Examples:

```text
0    = 0%
100  = 1%
250  = 2.5%
```

## Webhook

Create a Stripe webhook endpoint:

```text
https://the-bee-suite-beta.vercel.app/api/billing/stripe-webhook
```

Subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
account.updated
v2.core.account[requirements].updated
```

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`, then redeploy.

## School Payout Onboarding

1. Log into The Bee Suite as a billing-capable user.
2. Open `Billing Settings`.
3. For each school, click `Set up` in the Stripe Connect table.
4. Complete Stripe-hosted onboarding for that school.
5. Return to The Bee Suite. The payout table auto-syncs after return.
6. Use `Check` to refresh payout status later.

Parent checkout is blocked until the selected school has a connected account and Stripe reports payouts enabled.

## Test Mode Checklist

- Create at least one connected school payout account in Stripe test mode.
- Create or reuse a test invoice in The Bee Suite.
- Start checkout from the parent portal.
- Complete payment with a Stripe test card.
- Confirm the invoice changes to `PAID`.
- Confirm the Payment record stores the Stripe Checkout Session ID.
- Confirm the connected school account receives the destination transfer.
- Confirm platform fee behavior matches `STRIPE_APPLICATION_FEE_BPS`.
- Test a failed/asynchronous payment path.

## Go-Live Notes

- Confirm who owns negative balances, disputes, refunds, and school payout support.
- Do not set `STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=true` for real parent payments.
- Keep Stripe keys server-side only. Never paste secret keys into WordPress.
- Keep school payout onboarding behind authenticated Bee Suite sessions.
