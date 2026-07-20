# Per-School Stripe and Billing Evidence Packet

Copy this file once per proposed school. Store no secret key, webhook secret, bank account number, routing number, full card number, or identity document here.

## School and ownership

- School name:
- Center ID and `ST | City` location ID:
- Proposed launch date and billing window:
- Billing/accounting owner:
- Technical owner:
- Refund/dispute owner:
- Payout support owner:
- Director signoff owner:
- Evidence storage location:

## Separate approval gates

- [ ] School selected for this wave.
- [ ] Billing preview approved; approver and timestamp:
- [ ] Accounting treatment and opening balances approved; approver and timestamp:
- [ ] Parent disclosures and fee policy approved; approver and timestamp:
- [ ] Billing cutover approved; approver and timestamp:
- [ ] Repository approval fields recorded only after every approval above is complete.
- [ ] Parent invitations approved separately.
- [ ] Live payments approved separately.

## Connected-account snapshot

- Snapshot timestamp and environment:
- Masked connected account ID:
- Responsibility settings and dashboard access:
- Details submitted:
- Merchant/card payments capability status:
- Recipient/transfer capability status:
- Charges enabled:
- Payouts enabled:
- Outstanding requirement fields:
- Future requirement fields and due dates:
- Payout schedule and delay:
- Legal business name/EIN confirmation owner:
- Support contact/address/statement descriptor confirmation owner:
- Bank payout ownership confirmed by (do not record bank details):

## Billing preview

- Source-system export/batch ID and cutoff:
- Family count and invoice count:
- Tuition, fees, discounts, subsidies, credits, and opening balance totals:
- One-time versus recurring review:
- Exceptions and resolutions:
- Family-by-family reviewer:
- Final approved total and approver:

## Safe lifecycle tests

Record environment, timestamp, tester, test identifiers, expected result, actual result, and evidence link for each:

- [ ] Payment-method setup and replacement.
- [ ] Checkout success and duplicate-submit protection.
- [ ] Saved-method/off-session success.
- [ ] Autopay dry run and approved charge behavior.
- [ ] Asynchronous bank processing and settlement.
- [ ] Decline/failure, action required, and dunning.
- [ ] Signed webhook, duplicate webhook, and replay behavior.
- [ ] Invoice status, payment record, and ledger application.
- [ ] Void/correction.
- [ ] Partial refund and full refund.
- [ ] Dispute ownership and notification path.
- [ ] Receipt and parent-facing disclosure.

## Read-only payout reconciliation

- API/report window:
- Local charge total:
- Local refund total:
- Stripe gross activity:
- Stripe fees:
- Stripe net activity:
- Paid payout total:
- Pending payout total:
- Missing local/Stripe charge IDs:
- Unmatched Stripe charge IDs:
- Result: `no_activity`, `balanced`, `missing_stripe_activity`, `unmatched_stripe_activity`, `balance_mismatch`, `payout_pending`, `payout_failed`, or `payout_mismatch`.
- Opening-balance and cross-window timing review:
- Mismatch resolution and retest:

## Final signoffs

- Director — name/date/decision:
- Billing/accounting — name/date/decision:
- Technical — name/date/decision:
- Corporate — name/date/decision:
- Parent billing — explicit `GO` or `NO-GO`:
- First payout reconciled — name/date:
- Approval for next billing batch — name/date:
