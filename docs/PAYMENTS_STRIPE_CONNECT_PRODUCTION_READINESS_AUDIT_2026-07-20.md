# Payments and Stripe Connect Production Readiness Audit

Audit date: July 20, 2026

Accountable human: Brenden until explicitly delegated

Decision: **NO-GO for live parent billing at any additional school. Kokomo may continue normal production use.** The wider wave remains NO-GO until the shared readiness signoffs pass.

## Production-ready definition

A school is payments-ready only when all of the following are evidenced for that school:

- The intended school, launch date, billing owner, accounting owner, and support owner are named.
- Stripe reports completed account details, no outstanding requirements, charges enabled, payouts enabled, and the approved payout schedule.
- Legal business identity, EIN, support details, statement descriptor, receipt details, bank ownership, fee policy, and disclosures are approved.
- Imported rates, cadence, discounts, subsidies, credits, balances, invoices, and one-time versus recurring classifications reconcile to the approved source.
- A family-by-family billing preview is approved before live charges are created.
- Payment-method setup, Checkout, saved-method payment, autopay, webhook idempotency, ledger application, asynchronous success/failure, dunning, receipt, void/correction, partial refund, dispute ownership, and payout visibility are tested in an approved safe environment.
- The first live batch, Stripe balance activity, application fees, connected-account payout, BEE Suite payments, invoices, and ledger balances reconcile before the next batch.
- Parent billing has an explicit school-level business approval gate in addition to technical Stripe readiness, with a tested stop/rollback procedure.

## Evidence completed

- Read-only live Stripe audit: the configured platform account uses a live restricted key and reports charges and payouts enabled.
- The database contains 71 active center records, one of which is the non-school `Unassigned Lead Queue`. Of the 70 real active school records, only Kokomo has a connected Stripe account; 69 real schools have no connected account recorded.
- Kokomo's connected account was readable through the configured Stripe credentials. This proves access only; the audit did not obtain retained evidence for all capability, requirements, payout schedule, or reconciliation fields.
- `npm run pilot:check -- --all`: configuration and database passed; 69 of 70 active schools still have at least one broader rollout gap; 20 open invoices exist.
- Code review confirmed fail-closed checks for platform keys, webhook signing secret, connected-account presence, live account retrieval, saved payment method, duplicate/pending payment attempts, invoice/payment scope, and card-processing-recovery acceptance.
- Webhook review confirmed signed-event validation, event deduplication, successful and failed Checkout/PaymentIntent handling, invoice and family-balance ledger application, refunds, and disputes.
- Refund review confirmed exact partial refunds against original PaymentIntents, connected-account scoping, idempotency keys, multi-payment allocation, ledger entries, and explicit handling when Stripe-refundable capacity is insufficient.
- A readiness defect was fixed: outstanding Stripe requirement fields and incomplete details now block readiness even when charges and payouts are enabled.
- Connect documentation now matches the implemented direct-charge model.
- Focused payment/Stripe tests: 66 passed, 0 failed.
- TypeScript typecheck passed.

## Findings

### BLOCKER

1. **Additional schools have no connected accounts.** Sixty-nine real active schools other than Kokomo have no connected Stripe account recorded. Owner: Brenden until delegated.
2. **No selected-school Stripe evidence packet exists.** The first wave and dates are not named, so charges, payouts, requirements, payout schedule, identity, bank ownership, and support details cannot be signed off per school. Owner: Brenden until delegated.
3. **No explicit school-level business enablement gate exists.** Checkout and autopay are technically allowed when Stripe/webhook/account readiness passes (subject to environment overrides), but the code does not separately require recorded approval of the billing preview, disclosures, accounting, and cutover. Do not mark a new connected account ready until this gate is designed and implemented. Owner: Brenden until delegated.
4. **Payout reconciliation is not implemented as an evidenced workflow.** The repo can configure and display connected-account readiness, but it does not ingest/list Stripe payout or balance-transaction events and cannot reconcile a billing batch to a Stripe payout. Owner: Brenden until delegated.
5. **The complete lifecycle has not been executed per selected school.** No retained safe-environment evidence covers payment-method setup, Checkout, saved method/autopay, asynchronous settlement, webhook ledger application, failure/dunning, receipt, correction, partial refund, dispute ownership, application fee, and payout. Owner: Brenden until delegated.
6. **Billing preview and opening balances are not approved per selected school.** Twenty open invoices exist, but the current evidence does not establish which school records are authoritative or approved for charging. Owner: Brenden until delegated.

### REQUIRED BEFORE WAVE

1. Make production overrides fail-safe and capture their deployed values: `STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS=false`, `STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT=true`, webhook requirements enabled, and parent processing recovery disabled unless approved. Owner: Brenden until delegated.
2. Confirm webhook endpoint mode and subscriptions include Checkout completion/async failure/expiry, PaymentIntent success/failure, refunds, disputes, and connected-account requirements updates; retain a delivery/replay test. Owner: Brenden until delegated.
3. Approve the direct-charge responsibility model for fees, negative balances, refunds, disputes, tax/receipts, and support. Owner: Brenden until delegated.
4. Assign one billing/accounting owner and one technical/support owner for every selected school, plus a launch-day stop and rollback decision-maker. Owner: Brenden until delegated.
5. Reconcile the first live billing batch and first payout before allowing a second batch. Owner: Brenden until delegated.

### FOLLOW-UP

1. Replace narrative-only payout checks with a durable per-school evidence record containing Stripe snapshot time, requirements, capabilities, payout schedule, test case IDs, reconciliation totals, signoffs, and exceptions. Owner: Brenden until delegated.
2. Add automated tests around the future business enablement gate and payout reconciliation workflow. Owner: Brenden until delegated.
3. Review whether future/eventually-due Stripe requirements should block immediately or receive a documented due-date policy; the current safety gate blocks on every returned requirement field. Owner: Brenden until delegated.

## External decisions required

- Name the actual first school wave, dates, and intended billing modules.
- Decide and record the human billing/accounting, technical release, refund/dispute, payout support, and launch support owners for each selected school.
- Approve the direct-charge Connect responsibility model and payout schedule.
- Approve parent-facing fee/disclosure policy, including debit/prepaid, refunds, disputes, and accounting classification; keep recovery disabled until approval.
- Choose the durable school-level billing enablement/signoff mechanism.
- Decide the payout reconciliation source and acceptance tolerances.

## Exact next action

Brenden names the first school (other than already-live Kokomo), launch date, billing/accounting owner, and technical owner. Then run a read-only Stripe account snapshot for that school or complete its Stripe-hosted onboarding, without enabling billing, and attach charges, payouts, requirements, payout schedule, identity/support, and bank-ownership confirmation to a per-school evidence packet.
