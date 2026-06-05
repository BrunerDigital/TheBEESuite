# Stripe Connect Setup

The BEE Suite is configured as the Stripe platform. Parents pay through platform-owned Checkout Sessions, and each school receives funds through its connected payout account.

## Vercel Environment Variables

Add these to the Vercel production environment:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_ACCOUNTS_V2_API_VERSION=2026-04-22.dahlia
STRIPE_APPLICATION_FEE_BPS=0
STRIPE_APPLICATION_FEE_FIXED_CENTS=0
STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID=pmc_...
STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID=pmc_...
STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES=true
STRIPE_ACH_PROCESSING_RECOVERY_BPS=80
STRIPE_ACH_PROCESSING_RECOVERY_FIXED_CENTS=0
STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS=500
STRIPE_CARD_PROCESSING_RECOVERY_BPS=290
STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS=30
STRIPE_CARD_PROCESSING_RECOVERY_GROSS_UP=true
STRIPE_PAYMENT_OPS_FEE_BPS=0
STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS=75
STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS=kid-city-usa
STRIPE_PAYMENT_OPS_FEE_WAIVED_BRAND_SLUGS=kid-city-usa
STRIPE_PAYMENT_OPS_FEE_WAIVED_NAMES=kid city usa
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

For live tuition, keep the global application fee at `0` and use method-specific processing recovery:

- ACH: 0.8%, capped at $5.
- Card: 2.9% + $0.30 gross-up.
- Kid City USA: payment operations fee waived through the waiver env vars above.
- Future non-waived brands: use `STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS` or `STRIPE_PAYMENT_OPS_FEE_BPS` for the school/brand-side payment operations fee.

Create separate Stripe payment method configurations for ACH and card before enabling method-specific fees. This prevents a parent from opening a low-fee ACH checkout and then paying with a card.

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

1. Log into The BEE Suite as a billing-capable user.
2. Open `Billing Settings`.
3. For each school, click `Set up` in the Stripe Connect table.
4. Complete Stripe-hosted onboarding for that school.
5. Return to The BEE Suite. The payout table auto-syncs after return.
6. Use `Check` to refresh payout status later.

Parent checkout is blocked until the selected school has a connected account and Stripe reports payouts enabled.

## Test Mode Checklist

- Create at least one connected school payout account in Stripe test mode.
- Create or reuse a test invoice in The BEE Suite.
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
- Keep school payout onboarding behind authenticated BEE Suite sessions.
