# Link wallet checkout repair - September 23, 2026

## Problem and behavior

Hosted Link can use card funding, so a Link selection cannot safely be priced or classified as a bank-only payment. The earlier safety guard prevented all Link checkouts.

The restored option is labeled **Link or card**. Authenticated invoice, signed invoice-link, and family-balance entry points translate the legacy UI selection to a neutral `link` category. Bank setup retains its separate ACH behavior.

Wallet checkout requires a fresh connected-account read proving Stripe collects the school's processor fees directly. It also requires zero processor reimbursement and zero parent surcharge. The parent pays the principal and the existing BEE application fee is preserved. Stripe charges the school its actual processor fee for the funding method used. Schools using application-collected method-specific processor reimbursement remain blocked before claims or provider creation and receive guidance to use ACH or card.

The request filters Stripe's dynamic methods to card and Link. ACH is not silently substituted for instant bank payments. Stripe decides whether an individual transaction qualifies for instant bank funding. New payment metadata records the wallet selection, not an assertion of bank funding. Existing settled history is retained.

## Integrity and compatibility

- Distinct `link_wallet_v1` provider idempotency mode, with identical request/key retries after ambiguous responses.
- Existing family, tenant, connected-account, principal, authorization and draft/session checks remain enforced.
- Legacy bank-labeled sessions cannot be resumed as a new wallet checkout.
- Existing card, ACH, bank-method setup, autopay and fee rates are preserved.
- No live charge, refund, resend, ledger repair, migration or provider configuration mutation is part of this release.

## Validation evidence

Focused service, request and safety tests passed (122 tests); route harness additionally exercises all three wallet entry points even when ordinary account checks are disabled. Full production validation and release evidence are recorded in the pull request.

Read-only Stripe configuration inspection found eligible Card and Link methods in default configurations for Kokomo, Holly Hill, Granbury and Centennial. Authenticated pre-release Kokomo billing loaded successfully; the previous Link guard was visible. A real payment has not been submitted for testing.

Rollback baseline: main `4437e2316849130bb946e31299375ccc02273997`, deployment `dpl_B5VWXf1WXsHwGzTB4ritwkgXCZG8`.

## Provider references

- https://docs.stripe.com/api/checkout/sessions/create (allowed_payment_method_types)
- https://docs.stripe.com/payments/link/link-payment-methods
- https://docs.stripe.com/payments/link/instant-bank-payments
