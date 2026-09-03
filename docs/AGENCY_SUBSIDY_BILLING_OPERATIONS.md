# Agency Payment And Reconciliation SOP - The BEE Suite

Last updated: September 3, 2026

Audience: school directors, assistant directors, billing administrators, accounting users, and launch support.

## Purpose

Use this SOP to prepare an agency claim, record an approved ACH, check, or agency-portal remittance, and prove that the payment reconciled in the dedicated agency ledger. The workflow keeps agency responsibility separate from the family's ledger and never charges the family.

Public step-by-step guide: `https://thebeesuite.io/resources/agency-payment-reconciliation`

Live workspace: sign in at `https://thebeesuite.io/directors`, then open `Billing & Payments` -> `Billing & invoices` -> `Agency receivables`.

## Before The School Records A Payment

Have all of the following in front of you:

- The exact school and agency program.
- The agency's current remittance notice, portal record, check stub, or ACH advice.
- The school-specific provider or vendor/payee number.
- The child authorization number and covered service period.
- The submitted claim confirmation and agency decision/reference.
- The approved claim amount, amount paid, paid date, payment method, and external payment reference.
- A claim-by-claim allocation when one deposit covers more than one claim.

Do not use a Stripe school payout, bank deposit alone, parent payment, or family balance as proof of an agency remittance. Those records do not prove which agency, child, authorization, service period, or claim the money belongs to.

## Step 1 - Confirm The School And Program Are Ready

1. Sign in through the director entry point and confirm the school shown in the workspace.
2. Open `Agency receivables` and select the exact school.
3. Check `Programs ready`. Select the program under `1. Complete agency setup`.
4. Continue only when the program shows `Ready` and the school-specific provider/vendor identity, official submission method, and verified payment setup are documented.
5. Never reuse another school's provider number, vendor number, portal identity, or payment setup.

If the program says `Setup required`, stop. Complete the missing setup from current agency evidence before creating an authorization, claim, approval, or remittance.

## Step 2 - Confirm The Child Authorization And Claim

1. Match the agency program, family, child, authorization number, coverage dates, rate, units, and family copay to the source record.
2. Confirm the claim service dates are inside the authorization dates and do not overlap another open claim for the same authorization.
3. Confirm every required claim item is received, verified, or correctly marked not applicable with evidence.
4. Submit the claim through the agency's approved external channel. `Mark submitted` in The BEE Suite records the external confirmation after submission; it does not transmit the claim.
5. Record the agency decision only after the agency approves or denies the submitted claim. An approval needs the agency decision/reference and exact approved amount.

Do not mark an old payment as submitted or approved merely to make it fit the workflow. If a historical payment has no exact claim, authorization, service-period, and decision evidence, stop and send it to accounting for reconstruction or exception handling.

## Step 3 - Match The Payment Before Entry

In the `Agency claim queue`, open the claim that matches the remittance notice and confirm:

- Status is `approved` or `partially paid`.
- School, agency, child, authorization, and service period all match.
- Claimed, approved, already paid, and remaining amounts are correct.
- The payment will not exceed the remaining approved amount.
- The paid date and method match the agency evidence.
- The external reference is the ACH trace/reference, check number, or agency portal transaction/reference.

When one deposit covers several claims, use the agency remittance detail to allocate the exact amount to each claim. Record one remittance on each matched claim, then prove that the claim allocations add up to the deposit. Do not spread a deposit across families or claims by guesswork.

## Step 4 - Record The Remittance

1. Select `Record remittance` on the matched claim.
2. Enter the exact `External reference`.
3. Enter the exact `Remittance amount` for this claim.
4. Enter the agency's paid date, not the date you happen to enter it.
5. Choose `ACH`, `Check`, `Agency portal`, or `Other` to match the evidence.
6. Add a short note only when it helps identify the remittance; never enter portal passwords, routing numbers, bank account numbers, tokens, or full credentials.
7. Review the claim, amount, date, method, and reference with the second person when two-person review is available.
8. Select `Review complete - save` once. Wait for `Agency billing record saved` and the refreshed claim queue before doing anything else.

Recording a remittance does not charge the family. Agency approval creates the receivable charge in the dedicated agency ledger; the matched remittance creates a payment entry against that same school-and-agency account. Existing family-ledger agency rows remain immutable history, and compatibility settlement is limited to clearing those pre-existing agency receivables.

## Step 5 - Reconcile Immediately

Refresh the agency workspace and verify all of the following:

1. The claim's paid amount increased by exactly the remittance amount.
2. The claim status is `partially paid` when money remains or `paid` when the approved amount is fully covered.
3. The remittance history shows the exact paid date, amount, and external reference once.
4. The agency ledger contains one `remittance received` entry with the exact claim, amount, date, method, and reference.
5. The school-and-agency ledger balance decreased by the remittance amount and reconciles to approved claims less active remittances and reversals.
6. The parent's visible family responsibility did not increase or decrease because of the agency remittance.
7. Any legacy family-ledger compatibility entry is clearly identified and does not exceed the pre-existing matching agency receivable.
8. For a multi-claim deposit, the sum recorded across claims equals the deposit exactly.
9. Export the agency ledger CSV for complete accounting history; export the agency-claims CSV when claim-level status detail is also required.

If the claim or remittance saved but the dedicated agency ledger is missing the matching entry or does not reconcile, stop and escalate to accounting. Do not post a second manual family payment or a duplicate remittance to force the balance to match.

## Reverse an incorrect remittance

1. Find the exact remittance in the claim history.
2. Select `Reverse` and enter a specific correction reason.
3. Confirm the original remittance is shown as reversed and the claim paid amount/status recalculates.
4. Confirm the dedicated agency ledger contains a compensating reversal entry and the school-and-agency balance was restored.
5. If the original payment cleared a pre-existing legacy family-ledger agency receivable, confirm its compatibility reversal was also preserved.
6. Enter the corrected remittance as a new record using the correct source evidence.

Never delete, overwrite, backdate without evidence, or reuse the family cash/check payment workflow to correct an agency remittance. The original record, reversal, correction reason, and replacement must remain in the audit history.

## Stop And Escalate

- The school, agency, child, family, authorization, service period, claim, or payment does not match.
- The program says `Setup required` or provider/vendor enrollment is incomplete or expired.
- The claim is still draft, ready, submitted, denied, void, or otherwise not approved for payment.
- Attendance or required documents conflict with the billed units.
- The approved amount exceeds the claim or the payment exceeds the remaining approved amount.
- A deposit covers multiple claims but the agency has not supplied an exact allocation.
- A denial or short payment might shift responsibility to the family.
- The remittance has no unique ACH, check, or agency-portal reference.
- A portal requires credentials, banking changes, an electronic signature, or an agreement not already approved by the school.
- Agency rules are unclear, outdated, or conflict with the authorization.

<!-- pagebreak -->

## School Readiness Gate

The software workflow is shared across schools, but each school is ready only after its own evidence is complete:

- An authorized director or billing user can access only the intended school.
- Every participating agency program shows `Ready`.
- Provider/vendor enrollment, external submission, and payment setup are current.
- Current child authorizations and agency/family responsibility are verified.
- Claims have complete evidence and follow the real external submission and decision sequence.
- Accounting has approved the remittance notice and claim allocation used for posting.
- A first school-specific remittance has been entered with two-person review and reconciled successfully.

## First Remittance Review Record

Retain these details in the school's approved internal reconciliation record:

- School and agency program.
- Claim number or numbers and covered service period.
- Deposit or remittance total and external reference.
- Exact amount allocated to each claim.
- Claim status, dedicated agency-ledger balance, and ledger result after posting.
- Parent-visible responsibility before and after posting.
- Person who entered the remittance and date reviewed.
- Second reviewer and date reviewed.
- Any exception, accountable owner, and required follow-up.

Training, program setup, claim submission, recording an agency payment, changing family responsibility, and external provider/bank changes are separate approval gates. A guide or successful software release does not activate a school's agency process by itself.
