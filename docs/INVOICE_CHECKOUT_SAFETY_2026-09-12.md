# Invoice Checkout safety — September 12, 2026

## Baseline recorded before implementation

Clean isolated branch `work/invoice-checkout-safety-20260912`, based on released main `e414dc3d59385ea9dccec6da82d1eacd8f1ede61`. Parent home-fit production verification is recorded separately. Native privacy PR #361 is undergoing independent protected/macOS checks.

Source evidence, not a live charge reproduction:

- `src/app/api/billing/checkout-session/route.ts` reads DRAFT payments and then directly creates a Payment. Concurrent requests can pass the read together and create different payment-derived Stripe idempotency keys for one invoice.
- Network exceptions and indeterminate provider errors lack the shared idempotent-submission reconciliation. A returned 5xx can be marked FAILED despite possible Stripe side effects. The existing webhook preserves excess paid funds as family credit; that protects ledger history but does not prevent a duplicate charge.
- This route's existing one-time invoice/product policy charges the full invoice and preserves account credit. Autopay/terminal use explicit credit allocation; adopting their serialized claim must not silently change the hosted Checkout policy.
- `canAccessInvoice` looks up an ID without a tenant condition, and tenant-wide role access can bypass its center-ID list. `prisma.ts` is an ordinary client, not an automatic request-tenant filter. Exact school/tenant scope must be established before any provider or local write; missing/ambiguous school ownership must fail closed.
- The shared active-Checkout predicate omits `checkout_submission_unknown`; invoice-scope conflict detection must retain indeterminate attempts as blockers.

Current official Stripe references: [idempotent requests](https://docs.stripe.com/api/idempotent_requests) and [advanced error handling](https://docs.stripe.com/error-low-level). Preserve the same request parameters and key; treat 5xx outcomes as indeterminate. Keys may be pruned after 24 hours, so an old unresolved attempt must not be blindly resubmitted.

## Authorized scope

Implement code-level authorization, serialization, immutable attempt/recovery and focused fake-provider regression tests. Preserve invoice principal, account-credit policy, fees, provider ownership, financial history, parent eligibility, reserved-review restrictions and all existing billing approval gates. Do not charge/refund cards, change accounts, reconcile live ledger records, run migrations or publish provider settings. Production checks remain strictly guarded and non-charging.

Implementation and verification evidence will follow. This finding is not evidence that a particular family was charged twice; no real financial records were inspected or mutated for this baseline.

## Implemented corrections (local release gates passed)

- Both authenticated invoice Checkout and validated emailed payment links share a Serializable BillingAccount-locked claim before Customer/Checkout submission. A current invoice/amount, school/tenant/connected account, current billing approval/readiness and responsibility hold are checked again. Existing account-credit behavior is explicit `preserve`; autopay/Terminal callers retain their default credit-first allocation.
- Authenticated requests prove minimal invoice topology and tenant/workspace authority before loading child or ledger details. Platform cross-tenant billing requires an explicitly selected authorized school and uses that school's tenant for provider/audit scope. Current actor/device/family authority is rechecked. Both routes reject untrusted mutation origins and retain reserved App Review financial restrictions.
- Exact request digests bind customer, amounts, fees, metadata, channel, secure return URLs, API/encoder version, and a 23-hour create-retry window. Raw signed-link tokens, credentials and return URLs are never persisted in payment attempts. Persisted fields have an explicit bounded scalar allowlist. The original retry deadline is never extended.
- Account-scoped Customer creation has identical canonical parameters in both routes, a stable key, and fresh mapping compare/reconciliation. Conflicting mappings or school-account cutover block Checkout instead of overwriting the winner.
- Uncertain transport, 5xx, 409, HTTP-400 idempotency conflicts, and malformed successful provider responses remain confirmation-pending, with same-key recovery only. A webhook-confirmed Payment or changed actual attempt cannot be overwritten by a late response. Definitive failure retains a sanitized status/time and refreshes billing. Success/audit commit atomically; only proven transaction rollbacks receive a bounded database retry.
- This invoice path explicitly uses one deterministic Stripe payment-method mode per Payment. Healthy configured/method-specific/default behavior keeps its existing first mode; invalid provider configuration fails closed instead of falling back to a different key that could create a second Session. Other callers' fallback default is unchanged. The local production-env provenance file currently has no configured ACH/card/Link payment-method-configuration IDs; this is a file observation, not a provider setting change.
- Existing sessions require provider identity/customer/account/amount proof. Resuming additionally checks current request/channel/recipient/return URLs. Expired or failed drafts are changed only with full-JSON DRAFT compare-and-set, so provider inspection cannot overwrite a webhook or newer metadata. Expiry requests expanded PaymentIntent evidence using Stripe's documented [response expansion](https://docs.stripe.com/api/expanding_objects); an unconfirmed/processing result remains blocked.
- Removed stale whole-school configuration writes from collection-time provider-readiness inspection; these reads no longer overwrite concurrent setup changes.

## Current validation

- New core suites: **49 tests passed**, including six actual-route cases inside the module-mock wrapper, concurrent invoice claims, original-key recovery, malformed/ambiguous responses, provider-mode identity, source/payload mismatches, 23-hour expiry, webhook/metadata races, audit rollback, legacy expanded-intent expiration, role/tenant/demo guards, and receipt/return contracts. No live provider, database or financial writes.
- Final integrated `npm run vercel-build` passed: Prisma generation, ESLint (zero errors; one pre-existing unused-fixture warning), TypeScript, **2,100 tests passed with no skips**, and optimized Next.js 16.3.4 build. Both Parent/Teacher `mobile:store:check` gates passed. Exact protected deployment and post-release checks remain required.
- Independent final review passed 172 focused assertions across invoice/API/provider recovery, account-credit/autopay, Terminal, shared guards, fees, and webhook hardening; no remaining material source blocker found. Concurrency evidence is a fake serialized-transaction/provider harness, not a real PostgreSQL concurrency run or a Stripe test-mode transaction.
- Initial provider test failed because its fake connected-account request omitted the required existing 1% fee; the fixture was corrected, not the fee guard. A new natural-language idempotent-key test found an overly narrow classifier; production code now recognizes both idempotent and idempotency wording. Initial final gate also caught a test-harness environment typing error; fixed before rerun. Failure logs are retained locally.

Remaining separate actionable work: dormant parent product-order creation still needs an explicit client/server purchase-retry key; it is not activated by this change. Parent pending-payment UI currently under-represents some shared blockers and is the next UI wave. This release does not authorize charges, refunds, signed-link sends, identity changes, provider configuration or school activation.

## Protected-preview follow-up

PR #362's first preview failed before the optimized build: three nested fake route tests inherited production mode without a signing key. The child now always runs in production mode with its own ephemeral random fixture key. Production signing requirements and provider environment were not changed. Both failure and local reproduction evidence are retained.

Automated review also identified that a definitive Customer-creation rejection unnecessarily held an unsubmitted invoice forever. Such a rejection now marks only the untouched, still-DRAFT preparation FAILED, allowing a later corrected attempt. Existing unknown outcomes, concurrent Customer/Checkout progress, newer metadata and PAID records remain protected. Nine added cases verify definitive 400/401/403/422 recovery after the old retry window, unknown preservation and concurrent-progress races; the three focused suites now pass **58 tests**. The final integrated gate and a new Ready preview remain required before merge.

The review-corrected final `npm run vercel-build` passed: Prisma, lint (same pre-existing warning only), types, **2,109 tests with no skips**, and optimized build. Independent review reran all 58 focused cases successfully. Protected CI/Ready deployment and production verification are still separate release gates.

A subsequent protected review identified provider-expired, unpaid Sessions whose expanded intents still require abandoned user action or confirmation. Stripe's [Session status contract](https://docs.stripe.com/api/checkout/sessions/object) says expired Sessions do not process further. The exact safe-state allowlist now includes `requires_action` and `requires_confirmation` only for provider-confirmed expired/unpaid Sessions; processing, succeeded, requires-capture, missing/unknown intent states and other Session statuses remain blocked. Identity verification and DRAFT compare-and-set are unchanged. Regression cases cover replacement after the creation-retry window, prohibited states and a late paid webhook. No production expiration or new charge was performed to validate this logic.

Final expiry-corrected gate passed: **2,118 tests, zero failures/skips**, Prisma, lint/types and optimized build. The three new core suites pass **67 tests**, independently rerun. Review did not identify another safe intent status to release; all other statuses retain the conservative guard.
