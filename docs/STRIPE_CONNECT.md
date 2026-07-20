# Stripe Connect Setup

The BEE Suite uses Stripe Checkout and PaymentIntents with Connect direct charges for parent tuition payments. Stripe API requests are scoped to the school's connected account, and the platform can retain the configured application fee.

## Flow

1. The school director or executive opens `/billing-settings`.
2. They start Stripe Connect onboarding for a school.
3. Stripe collects payout, identity, and bank information directly from the school.
4. Parent portal invoice payments create a Checkout Session only after Stripe platform keys, webhook reconciliation, and the school connected account are ready.
5. A separate school business gate must record billing-preview, accounting, and cutover approval. Technical Stripe readiness does not open billing by itself.
6. The Checkout Session creates the charge on the school's connected account and retains the configured BEE Suite application fee.
7. The webhook at `/api/billing/stripe-webhook` marks payments paid, closes invoices, writes ledger credits, and stores processed Stripe event IDs for idempotency.
8. Authorized billing users can run the read-only connected-account reconciliation endpoint at `/api/billing/connect/reconciliation` for a window of 31 days or less.

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
STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=false
STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID=pmc_...
STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID=pmc_...
STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES=true
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

Webhook endpoint:

```text
https://thebeesuite.io/api/billing/stripe-webhook
```

Subscribe the endpoint to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.payment_failed
charge.refunded
charge.dispute.created
account.updated
v2.core.account[requirements].updated
```

If Stripe does not show the v2 account requirements event in the dashboard, keep `account.updated` enabled and use the status sync button in `/billing-settings`.

Production currently uses the events Stripe accepted for the live webhook endpoint:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.payment_failed
charge.refunded
charge.dispute.created
account.updated
```

## Fee Configuration

The final product copy, legal/accounting review checklist, and source links live in `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md`.

`STRIPE_PARENT_SURCHARGE_BPS` and `STRIPE_PARENT_SURCHARGE_FIXED_CENTS` are legacy/global surcharge controls. Keep them at `0` for live tuition unless a single global surcharge has been reviewed and approved.

The preferred tuition model is method-specific processing recovery:

- ACH and instant bank: parent pays tuition only, with no parent-paid processing recovery.
- Card: parent pays tuition plus grossed-up card processing recovery, only after `STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=true`.
- Payment method configurations should be created in Stripe Dashboard and wired into `STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID` and `STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID`. Keep `STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES=true` so a bank checkout cannot accidentally allow card payment methods.
- Keep card recovery disabled if the processor/acquirer setup cannot distinguish legally allowed card types from debit/prepaid card payments.

BEE Suite payment operations fees are school/brand-side economics, not an extra parent-paid processing recovery line:

- `STRIPE_PAYMENT_OPS_FEE_BPS`
- `STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS`
- `STRIPE_PAYMENT_OPS_FEE_MAX_CENTS`

Kid City USA is waived during live testing by:

```text
STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS=kid-city-usa
STRIPE_PAYMENT_OPS_FEE_WAIVED_BRAND_SLUGS=kid-city-usa
STRIPE_PAYMENT_OPS_FEE_WAIVED_NAMES=kid city usa
```

`STRIPE_APPLICATION_FEE_BPS` and `STRIPE_APPLICATION_FEE_FIXED_CENTS` are still supported for platform-level fee experiments, but should remain `0` unless intentionally enabled.

Example:

```text
Invoice tuition: $1,000.00
ACH parent processing recovery: $0.00
ACH checkout total: $1,000.00
Application fee: BEE Suite payment operations fee, if not waived
Family ledger credit: $1,000.00

Credit card parent processing recovery: about $30.18
Card checkout total: about $1,030.18
Application fee: card processing recovery + BEE Suite payment operations fee, if not waived
Family ledger credit: $1,000.00
```

Review fee disclosures, state-specific rules, card-network/acquirer notice, debit/prepaid handling, refunds, disputes, and accounting treatment before setting `STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=true`.

## Go-Live Checks

- Stripe account is fully activated.
- Connect platform profile and branding are configured.
- Webhook endpoint uses the same mode as the keys: test with test keys, live with live keys.
- Each school has completed Connect onboarding and shows `Ready` in `/billing-settings`.
- Test at least one invoice payment with a connected test account.
- Confirm the family balance, invoice status, payment record, ledger entry, application fee, and school payout all reconcile.
- Confirm refund and dispute handling with Stripe test events before live parent payments are broadly enabled.
- Keep `STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=false` in production.
- `STRIPE_BILLING_LEGACY_APPROVED_CENTER_NAMES` defaults narrowly to `Kid City USA - Kokomo` so existing production use can continue. Do not add another school; use explicit per-school approval fields after human signoffs.
- Copy `docs/STRIPE_SCHOOL_EVIDENCE_PACKET_TEMPLATE.md` for every proposed school.
