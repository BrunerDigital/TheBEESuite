# Stripe Connect Setup

The Bee Suite uses Stripe Checkout with Connect destination charges for parent tuition payments.

## Flow

1. The school director or executive opens `/billing-settings`.
2. They start Stripe Connect onboarding for a school.
3. Stripe collects payout, identity, and bank information directly from the school.
4. Parent portal invoice payments create a Checkout Session only after that school has an active connected account.
5. The Checkout Session charges the parent, routes funds to the school connected account, and retains the configured Bee Suite application fee.
6. The webhook at `/api/billing/stripe-webhook` marks payments paid, closes invoices, writes ledger credits, and stores processed Stripe event IDs for idempotency.

## Required Stripe Settings

Create these environment variables in Vercel for Production and Preview:

```text
STRIPE_SECRET_KEY=sk_live_or_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_APPLICATION_FEE_BPS=0
STRIPE_APPLICATION_FEE_FIXED_CENTS=0
STRIPE_PARENT_SURCHARGE_BPS=0
STRIPE_PARENT_SURCHARGE_FIXED_CENTS=0
STRIPE_PARENT_SURCHARGE_MAX_CENTS=0
STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=false
STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT=true
STRIPE_CHECKOUT_ON_BEHALF_OF=false
```

Webhook endpoint:

```text
https://thebeesuite.io/api/billing/stripe-webhook
```

Subscribe the endpoint to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
account.updated
v2.core.account[requirements].updated
```

If Stripe does not show the v2 account requirements event in the dashboard, keep `account.updated` enabled and use the status sync button in `/billing-settings`.

## Fee Configuration

`STRIPE_APPLICATION_FEE_BPS` and `STRIPE_APPLICATION_FEE_FIXED_CENTS` are Bee Suite fees retained from the checkout.

`STRIPE_PARENT_SURCHARGE_BPS` and `STRIPE_PARENT_SURCHARGE_FIXED_CENTS` add a separate parent-facing Checkout line item above tuition. That surcharge is also included in the application fee so the school payout can still receive the invoice amount.

Example:

```text
Invoice tuition: $1,000.00
Parent surcharge: 3.00% + $0.30 = $30.30
Parent checkout total: $1,030.30
Application fee: surcharge plus any Bee Suite fee
Family ledger credit: $1,000.00
```

Review fee disclosures, state surcharge restrictions, card-network rules, refunds, and dispute handling before enabling surcharges in live mode.

## Go-Live Checks

- Stripe account is fully activated.
- Connect platform profile and branding are configured.
- Webhook endpoint uses the same mode as the keys: test with test keys, live with live keys.
- Each school has completed Connect onboarding and shows `Ready` in `/billing-settings`.
- Test at least one invoice payment with a connected test account.
- Confirm the family balance, invoice status, payment record, ledger entry, application fee, and school payout all reconcile.
- Keep `STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=false` in production.
