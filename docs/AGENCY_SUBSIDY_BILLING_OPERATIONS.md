# Agency Payment And Reconciliation SOP - The BEE Suite

Last updated: September 9, 2026

Audience: school directors, assistant directors, billing administrators, accounting users, and launch support.

Production status: the expanded agency-ledger workflow code and all three reviewed database migrations are released and validated, including the September 9 child-scope guard repair. Per-school operational activation remains a separate business gate; schools that are not explicitly activated retain the baseline direct `Record remittance` workflow. A successful build or schema migration alone never activates a school.

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
3. Baseline direct `Record remittance` remains available to authorized billing staff before activation without requiring accounting export codes.
4. Before activating the expanded workflow, configure nonblank A/R, cash, adjustment, and cost-center codes for every active program in the exact school. Activation and controlled ledger actions fail closed while any mapping is missing.
5. Stop if setup is incomplete, expired, or belongs to another location.

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

1. A different billing administrator or accounting reviewer compares the batch to the source evidence. The preparer and reviewer must be two distinct authorized, active users for this exact school.
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
8. Export claims, deposits, ledger activity, and reconciliation as needed. Accounting codes appear where configured. Formula-like external text is preserved as text in CSV exports so opening a report cannot execute spreadsheet formulas.
9. Use the deposit and adjustment history controls to reach older posted, rejected, reversed, or reconciled records. Actionable batches and pending adjustments remain visible on every history page.

If the ledger does not reconcile, stop. Do not add a duplicate remittance or family payment to force a match.

## 6. Exceptions And Adjustments

- Unmatched or partially allocated cash remains open with an owner and due date until resolved.
- Write-offs, recoupments, overpayments, and correction increases/decreases require a reason, evidence reference, follow-up date, and independent reviewer.
- Posted adjustments and payments are immutable. Correct them with a compensating reversal and a new reviewed record.
- A short payment or denial never shifts responsibility to the family without a separate documented billing decision and approval.

## 7. Accounting Period Close

1. Accounting reviews reconciliation variance, pending batches, pending adjustments, unapplied cash, aging, and follow-up exceptions.
2. Close preflight never reconstructs a claim approval, direct remittance, adjustment, or reversal from today's editable program mappings. It may restore a missing controlled-batch event only when immutable event-time batch snapshots and exact source links prove the amount, effective date, school, program, claim, and remittance. Missing or conflicting evidence blocks close. Each recovery entry identifies the close-time recovery and actor; the close audit and period close commit atomically. It does not infer an approval or payment, alter recorded amounts, or touch family billing.
3. Close the exact school period only after every unresolved batch, additional allocation, and adjustment dated before the period end is cleared, including items from an earlier open gap. The period end cannot be later than the current UTC accounting day.
4. Closed periods reject remittances and adjustments dated within or before the latest closed period, including dates in an earlier open gap.
5. Reopening requires accounting access and a retained reason. Reopen later closed periods before earlier ones so every later certification is invalidated in order. A reopened period may be closed again only after a fresh preflight, and each close/reopen action remains in the audit log.
6. For controlled deposits, `paidAt` is immutable UTC calendar-day source evidence and the independent review timestamp is the ledger posting effective time. A morning review is valid for a source date represented internally at noon on that same UTC day; it is not a backdated event. That rule lets a corrected historical deposit retain its true receipt date while its compensating replacement posts in the current open period. Receipt and reversal events are reconciled independently by their own ledger effective dates; a reversal still cannot precede its exact receipt/posting event, and `paidAt` must never be changed to force a period match.
7. A direct-remittance reversal may retain a same-UTC-day source timestamp that is earlier by clock time than its noon-normalized `paidAt`. Migration and the server preserve that immutable source timestamp, while the dedicated reversal ledger event posts at the later of the source reversal timestamp and the immutable receipt event. The ledger metadata records both the source time and this posting rule. A reversal from an earlier UTC day is invalid and blocks migration.

## 8. Reverse Incorrect Activity

Reverse the whole deposit batch when its payment reference, total, or evidence is wrong. The system preserves every original allocation, restores receivables with compensating entries, reverses unapplied cash, and records the reason and reviewer. Exact pre-release family-ledger mirrors remain reversible even when an agency display name was later changed. If an old mirror sits within a negative net agency-only family history, automated reversal fails closed because it would transfer responsibility to the parent; use a separately reviewed historical correction and do not partially change the remittance or either ledger. Reverse a posted adjustment through its own control. Never delete, overwrite, or silently backdate financial history.

## Stop And Escalate

Stop for any school, agency, child, authorization, service-period, approval, amount, date, method, evidence, or reference mismatch; an unapproved claim; a payment above the approved remainder; missing multi-claim allocation; duplicate reference; closed period; unexplained variance; expired setup; credentials/bank changes; or a proposed change to family responsibility.

## Activation And Cutover Gates

The shared software does not activate a school's business process. A preview build proves compilation only; it does not prove that runtime queries are compatible with an unmigrated production schema. These are separate gates, in this release order:

1. **Backup and preflight** records a current verified backup/PITR restore point, confirms production-derived rehearsal parity, rechecks source counts and checksums, and freezes agency program/authorization/claim/remittance/ledger changes plus related family, child, and classroom school moves for the short migration window. Unrelated parent, classroom, enrollment, attendance, communication, and payment-method work remains available.
2. **Database migration history and repairs** use the Supabase migration registry as the sole production writer. The agency receivable, reconciliation, and child-scope guard repair migrations are applied and verified in production under Supabase versions `20260908161144`, `20260908161154`, and `20260909180912`; do not apply the former local aliases `20260903190000`, `20260903210000`, or `20260908200500` through Supabase. Production's Supabase and Prisma registries use different version identities for the same reviewed SQL bytes. The deployed repair is stored at `supabase/migrations/20260909180912_agency_child_scope_guard_repair.sql` and remains byte-identical to `prisma/migrations/20260908200500_agency_child_scope_guard_repair/migration.sql` (SHA-256 `AE236CE0C753F7E098BE1652B30795BA13283D46E76FB3EECDDFE749580D1580`). It was applied through the authorized Supabase migration writer on September 9, 2026 after a recovery snapshot and exact-target preflight; catalog verification confirmed one trigger, four canonical `center_id` aliases, security-invoker execution, an empty locked search path, and no execute grant for `PUBLIC`, `anon`, or `authenticated`. `npm run db:migrate`, `prisma migrate deploy`, `prisma migrate resolve`, manual SQL execution, and migration-ledger edits remain prohibited. If any future phase partially applies or fails, keep the operational freeze and any committed database fence in place and capture the Supabase error, registry state, and exact catalog evidence. Never edit the original migration bytes, and never reuse either original name/version for altered SQL or object definitions. Use a separately reviewed migration with a new identity as a forward repair; never insert or edit a migration-history row or switch migration writers.
3. **Software deployment** puts the exact reviewed, green application commit on the canonical production aliases only after every migration object and invariant is verified. The migrated database includes an inactive-school source compatibility projection: if a baseline claim or remittance source row is written, it creates only the matching exact dedicated-ledger entry and never infers a claim, approval, remittance, or family obligation. That database projection does not make an older application build's legacy family-ledger mirror safe. Keep all agency approval and remittance writes frozen until the reviewed application is validated. A failed release may roll back only to a separately verified compatibility build; if the raw pre-release build must be restored, keep agency financial writes frozen until a forward correction is verified.
4. **End-to-end validation** checks authenticated access for every affected role, exact-school mutation scope, all-authorized-school reads/exports, tenant isolation, independent review, accounting totals, and unchanged parent/family responsibility before the posting freeze is lifted.
5. **Per-school operational activation** enables only an explicitly approved, fully configured school; `setup_required` programs remain blocked. If validation fails, roll back the application while leaving the additive schema intact and keep controlled financial posting frozen until a forward correction is verified.
6. **Staff training** confirms that preparers and independent reviewers can use the evidence, exception, reversal, close, and export controls.
7. **First-deposit reconciliation approval** requires two authorized users to post and independently verify the pilot school's first real deposit before the workflow is declared live there.

Before activation, each school also needs current provider/payment evidence, authorized users, configured programs and accounting mappings, verified authorizations, an approved dual-review policy, and a reviewed legacy-family-history report. Real payment posting, responsibility changes, and provider/bank changes remain separate approvals.

## Access Continuity

- Platform owners, brand administrators, regional managers, center directors, assistant directors, and billing administrators keep the baseline claim and direct `Record remittance` workflow for schools that have not been activated.
- After activation, those same exact-school roles may prepare controlled activity. A different authorized accounting-capable user must review it; a preparer cannot approve their own posting.
- The all-schools workspace retains consolidated reads and school-attributed exports but is read-only. A global user selects one exact authorized school before a financial mutation. Fixed-school operational roles keep their existing authorized school actions. Read-only auditors may inspect authorized records and exports but cannot mutate them. Teachers, parents/guardians, and authorized pickups have no agency-financial mutation access.
- Activation changes only the selected school's agency accounting workflow. It does not remove access to unrelated billing, enrollment, classroom, parent, payment-method, or reporting work.
