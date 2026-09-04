# Agency Payment And Reconciliation SOP - The BEE Suite

Last updated: September 3, 2026

Audience: school directors, assistant directors, billing administrators, accounting users, and launch support.

## Purpose

Use this SOP to prepare agency claims, stage ACH/check/portal deposits, obtain independent review, and prove that claim allocations, deposits, and the dedicated agency ledger agree. Agency responsibility remains separate from the family ledger and never charges the family.

Public guide: `https://thebeesuite.io/resources/agency-payment-reconciliation`

Workspace: sign in at `https://thebeesuite.io/directors`, then open `Billing & Payments` -> `Billing & invoices` -> `Agency receivables`.

## Required Evidence

Have the exact school and agency program, provider/vendor identity, child authorization and coverage period, submitted claim confirmation, agency decision/reference, remittance advice/check stub/portal transaction, paid date, payment method, unique payment reference, total deposit, and claim-by-claim allocation. Store only a secure internal document/advice reference in the ledger; never store credentials or full bank details.

A Stripe payout or bank deposit alone is not agency-remittance proof. It does not establish the agency, authorization, service period, approved claim, or allocation.

## 1. Confirm School And Program Readiness

1. Select one exact school. `All authorized schools` is a consolidated read-only accounting view.
2. Confirm the agency program shows `Ready` and uses this school's provider/vendor identity, submission method, and payment setup.
3. Record optional A/R, cash, adjustment, and cost-center codes when accounting exports need them.
4. Stop if setup is incomplete, expired, or belongs to another location.

## 2. Confirm Authorization And Claim

1. Match the program, family, child, authorization number, coverage dates, rate, units, and family copay.
2. Confirm the service period is authorized and required evidence is complete.
3. Submit through the agency's approved external channel. `Mark submitted` records the external confirmation; it does not transmit the claim.
4. Record a decision only from current agency evidence. Payment may be allocated only to an `approved` or `partially paid` claim and may not exceed the remaining approved amount.

Never manufacture a submission or approval to fit an old deposit. Send incomplete historical records to accounting for reconstruction or controlled exception handling.

## 3. Prepare One Deposit Batch

1. Choose `Prepare deposit batch`, or `Prepare remittance` from a single approved claim.
2. Enter the unique ACH/check/portal reference, exact deposit total, paid date, method, evidence name, secure evidence reference, and follow-up due date.
3. Add every claim allocation shown on the remittance advice. The allocations may not exceed the deposit.
4. If exact allocation detail is missing, leave that amount unapplied. Do not guess or spread it across families.
5. Save once. The batch becomes `pending review`; no claim or ledger balance changes yet.

Duplicate references and replayed requests are blocked per school and agency. Review the existing batch instead of trying a second entry.

## 4. Independent Review And Posting

1. A different billing administrator or accounting reviewer compares the batch to the source evidence.
2. The reviewer approves or rejects the batch. The preparer cannot approve their own batch.
3. Approval posts claim allocations and one explicit unapplied-cash entry for any remainder in one serializable transaction.
4. The reviewer confirms the deposit total equals allocated plus unapplied cash.
5. Later allocations from unapplied cash also require a different reviewer and post in the current open accounting period while retaining the original paid date. A batch may have only one pending or posted allocation for the same claim; review or reverse it before entering a corrected allocation.

No agency payment is final until independent review succeeds.

## 5. Reconcile

Verify all of the following:

1. Claim paid amounts and statuses changed exactly once.
2. Deposit total equals posted allocations plus unapplied cash.
3. Approved claims minus active remittances minus unapplied cash plus posted adjustments equals the expected agency receivable.
4. Expected and ledger balances have zero variance.
5. Aging, overdue claims, pending reviews, and overdue follow-ups are explained.
6. Parent-visible family responsibility did not change.
7. Legacy family-ledger agency rows remain immutable historical entries and are not reused for new activity.
8. Export claims, deposits, ledger activity, and reconciliation as needed. Accounting codes appear where configured.

If the ledger does not reconcile, stop. Do not add a duplicate remittance or family payment to force a match.

## 6. Exceptions And Adjustments

- Unmatched or partially allocated cash remains open with an owner and due date until resolved.
- Write-offs, recoupments, overpayments, and correction increases/decreases require a reason, evidence reference, follow-up date, and independent reviewer.
- Posted adjustments and payments are immutable. Correct them with a compensating reversal and a new reviewed record.
- A short payment or denial never shifts responsibility to the family without a separate documented billing decision and approval.

## 7. Accounting Period Close

1. Accounting reviews reconciliation variance, pending batches, pending adjustments, unapplied cash, aging, and follow-up exceptions.
2. Close the exact school period only after every unresolved batch, additional allocation, and adjustment dated before the period end is cleared, including items from an earlier open gap. The period end cannot be later than the current UTC accounting day.
3. Closed periods reject remittances and adjustments dated within or before the latest closed period, including dates in an earlier open gap.
4. Reopening requires accounting access and a retained reason. Reopen later closed periods before earlier ones so every later certification is invalidated in order. Corrections should normally post in the current open period with the original event date retained in metadata.

## 8. Reverse Incorrect Activity

Reverse the whole deposit batch when its payment reference, total, or evidence is wrong. The system preserves every original allocation, restores receivables with compensating entries, reverses unapplied cash, and records the reason and reviewer. Reverse a posted adjustment through its own control. Never delete, overwrite, or silently backdate financial history.

## Stop And Escalate

Stop for any school, agency, child, authorization, service-period, approval, amount, date, method, evidence, or reference mismatch; an unapproved claim; a payment above the approved remainder; missing multi-claim allocation; duplicate reference; closed period; unexplained variance; expired setup; credentials/bank changes; or a proposed change to family responsibility.

## Activation And Cutover Gates

The shared software does not activate a school's business process. Before activation, each school needs current provider/payment evidence, authorized users, configured programs and accounting mappings, verified authorizations, an approved dual-review policy, a reviewed legacy-family-history report, and a successful first deposit reconciliation. Production migration, deployment, staff training, real payment posting, responsibility changes, and provider/bank changes are separate approvals.
