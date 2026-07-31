# Billing Admin SOP - The BEE Suite

Last updated: July 31, 2026

Audience: billing admins, school directors handling billing, accounting users, and launch support.

## Purpose

This SOP explains how billing users manage tuition, invoices, payment methods, ACH setup, card payments, dunning, reconciliation, and payment support in The BEE Suite.

## Visual Overview

![Weekly tuition assignment and Thursday billing flow](../../public/brand/the-bee-suite/explainers/current/weekly-tuition-flow.png)

![Parent payment choices](../../public/brand/the-bee-suite/explainers/current/parent-payment-options.png)

![School-scoped Stripe Terminal payment](../../public/brand/the-bee-suite/explainers/current/terminal-payment-flow.png)

## Billing Admin Responsibilities

- Keep family billing accounts and ledger balances accurate.
- Confirm tuition plans, fees, discounts, subsidy/copay rules, and due dates before invoicing.
- Send secure payment setup links instead of collecting card or bank details manually.
- Present card and bank choices accurately. Card is first in the current parent flow; bank options remain available when enabled.
- Confirm card disclosures before card payment recovery is used.
- Reconcile payments after processor confirmation.
- Escalate refunds, disputes, failed payments, duplicate charges, and policy questions.

## Before Live Parent Payments

Do not send live payment links until all items are complete:

1. The school has completed Stripe connected payout onboarding.
2. Stripe status says charges and payouts are ready for the school.
3. Webhook reconciliation is configured.
4. Tuition plans and open balances are reviewed against school records.
5. ACH, instant-bank, card, autopay, refund, dispute, and failed-payment policies are approved.
6. Parent-facing payment disclosures are approved.
7. Card processing recovery is disabled unless approved by ownership, accounting, card-network/acquirer rules, and applicable law.
8. A billing smoke test passes for the school.

## Daily Billing Review

1. Log in and confirm the school scope is correct.
2. Open `Billing & Invoices`.
3. Review open invoices, past-due balances, failed payments, pending bank payments, subsidy items, and upcoming tuition runs.
4. Filter to the correct school before changing any record.
5. Open the family billing account before creating, charging, or adjusting anything.
6. Document unresolved billing issues for the director or accounting owner.

## The Three Separate Billing Controls

Do not treat these as one switch:

1. **Weekly invoice creation** is the child tuition assignment. On Thursday, an eligible positive weekly assignment creates the invoice for the following week. It does not charge Stripe and does not enable autopay.
2. **Family autopay** is a separate, explicit family-level choice. It uses the one selected saved method to collect eligible open invoices on or after their due date. Saving or replacing a method does not enable autopay.
3. **Batch invoice creation** is a manual way to create many invoices. It does not directly charge Stripe. A due batch invoice can still be picked up later by autopay, so never batch a tuition period already covered by recurring assignments.

`Create Invoice Now` also creates one due-now invoice; it is not an immediate card or bank charge. `Charge Selected Method` is a deliberate one-time stored-method charge and can be used while autopay is disabled.

## Set A Family's Weekly Tuition Correctly

Complete these steps once for each child:

1. Open `Billing & Invoices` and select the exact school, family, and child. Stop if the sticky header is wrong.
2. Review the family ledger first. Confirm there is no duplicate invoice for the same child and week.
3. Open `Weekly tuition plans`. Create or edit the school-scoped plan if needed. Use the actual weekly family amount after an approved discount; do not overwrite a shared plan to correct one family's history.
4. Open `Recurring tuition`. Choose the child and the correct school plan.
5. Confirm `Customer weekly tuition` and `Family weekly total`. Sibling rates are separate child assignments and should add up to the family total.
6. Set `Enabled` only for a positive family-paid rate. An explicit `$0.00` CCDF/voucher assignment records agency-funded tuition and creates no family invoice.
7. Set the start week to the first service week that should be invoiced. Confirm the year carefully; an accidental future year prevents invoices.
8. Save the tuition assignment. Reopen the family and confirm the child rate, start week, and family total.
9. Do not use `Create Invoice Now` just because you edited a historical invoice. Historical invoice corrections do not change the future child rate.
10. If one exact week is genuinely missing, use `Create Invoice Now` only after checking that recurring or batch billing has not already created it.

The amount saved on the child assignment is the canonical future weekly rate. If the plan price later changes, review existing child assignments; do not assume historical assignment snapshots changed automatically.

## Opening Balance: Use Once Or Leave Zero

The opening balance is a cutover tool, not a tuition-rate field.

- Enter a positive opening balance only when creating a new family and the family already owes a verified amount from before The BEE Suite cutover date.
- Leave it blank or `0` for a new family with no prior debt, normal weekly tuition setup, new invoices, or an existing family.
- Leave it `0` if historical open invoices will be entered or imported separately; otherwise the same debt is counted twice.
- Never enter the weekly tuition rate as an opening balance.
- Never use a negative opening balance. Record a verified credit, agency payment, refund, or adjustment through the family ledger with its source and approval.
- Stop and reconcile the ledger if you are unsure whether the amount is debt, a payment, or a credit.

The intake form blocks negative opening balances and blocks adding another opening balance to a matched existing family.

## Create Or Review A Family Invoice

1. Open `Billing & Invoices`.
2. Choose the correct center and family.
3. Confirm the family, guardians, children, and billing account are correct.
4. Choose a charge type: tuition plan, product/fee, or custom charge.
5. Choose child or whole family.
6. Enter due date and billing period.
7. Add a clear description if needed.
8. Create the invoice.
9. Confirm the invoice appears on the family ledger and parent portal.

## Batch Tuition Run

1. Confirm tuition plans and child assignments are current.
2. Filter to the correct school. Tuition plans are school-scoped and cannot be assigned across locations.
3. Confirm recurring tuition has not already created invoices for the same period. If it has, stop.
4. Open the batch tuition tab.
5. Choose target: per matching child or per matching family.
6. Choose age group and enrollment status.
7. Confirm due date and billing period.
8. Select `Create Batch Invoices` only after reviewing scope. This does not directly charge Stripe.
9. Spot-check invoices across tuition plans, discounts, subsidy scenarios, and siblings.
10. If any family has autopay enabled, remember that a due batch invoice can be collected by the next autopay run.
11. Send parent notices only after the school approves the batch.

## Recurring Tuition Assignment

1. Open the selected family.
2. Choose the child.
3. Confirm the sticky billing header shows the intended school, family, billing account, and selected child.
4. Review `Customer weekly tuition` and the `Family weekly total`.
5. Select the tuition plan assigned to that child.
6. Confirm enabled status and the start week or period.
7. Save recurring tuition.
8. Reopen the family or child profile and confirm the same rate appears there.
9. Use `Create Invoice Now` only when the school has verified that one exact invoice is missing.

The child billing assignment is the canonical weekly rate:

- Family records display the sum of active child assignments plus the per-child breakdown.
- Child profiles, enrollment records, and Billing show that same assignment.
- Do not maintain a second family-level or profile-only tuition amount.
- An eligible recurring assignment creates the Thursday invoice for the following week. The scheduler runs daily and uses Thursday for weekly assignments, including legacy assignments that previously stored Friday.
- A saved payment method is required for automatic collection, not for invoice creation.
- `Create Invoice Now` posts a due-now invoice and balance. It does not charge Stripe immediately and does not replace the recurring assignment.

## Send A Secure Payment Method Request

Use this when a family needs to save ACH/bank or card details for future payments.

1. Open `Billing & Invoices`.
2. Choose the correct family.
3. Review guardian and billing email options.
4. Select the intended recipient email.
5. Send the secure payment request.
6. Tell the parent to start from the branded The BEE Suite link.
7. Explain that `Save Debit/Credit Card` is presented first and `Verify Bank Instantly` remains available for ACH verification.
8. If card recovery is approved, tell the parent it is disclosed before submission and applies only to the selected card path.
9. Remind the parent that The BEE Suite does not store bank login credentials, full bank account numbers, or full card numbers.
10. Explain that saving the method does not enable autopay. The family or authorized director must enable autopay separately.

## Manage Family And Payer Payment Methods

- The BEE Suite billing account belongs to the family at one school. Guardians and payers are contacts; the family has one selected Stripe customer and one selected saved default method for stored-method charges and autopay.
- A secure setup link may be sent to the verified billing email or a listed guardian email. The payer completes Stripe's secure bank/card setup; staff must never collect full card or bank credentials.
- `Save Card`, `Verify Bank Instantly`, or `Replace Saved Method` saves or replaces the selected family method. It does not enable autopay.
- `Enable Autopay` requires an already saved method and explicit confirmation. `Disable Autopay` stops automatic collection but keeps the method available for deliberate one-time payments.
- `Manage Saved Method` opens the connected-account Stripe portal. After a change, return to The BEE Suite and verify the masked method label and autopay status before billing.
- A payment method saved for one location's Stripe connected account cannot be reused at another location. Create a correctly scoped customer and method for the new school.
- If two adults want to split an invoice, do not attempt to put two methods on autopay. Keep autopay disabled or use the one agreed default; process approved one-time payments against the remaining invoice balance and verify each result before the next payment.

## ACH And Instant Bank Guidance

Bank payment remains an available lower-cost option when the school enables it. Do not describe it as the only or automatically selected method; the current parent flow presents card first.

- `Verify Bank Instantly` saves a verified bank payment profile for future payments or autopay.
- `Instant Bank` lets a parent pay an invoice by logging into their bank through the secure processor handoff.
- `One-Time Bank` or ACH may take a few business days to settle.
- Pending bank payments should not be repeated unless the school confirms the first attempt failed or expired.
- Bank payments help families avoid debit/credit card processing recovery when card recovery is enabled.

Do not promise every ACH payment is always fee-free. Tell parents the exact total is shown before they submit payment.

## Card Payment Guidance

Use card payments only when the school allows them.

1. Confirm card payment policy is approved.
2. Confirm card processing recovery disclosure is approved if recovery is enabled.
3. Tell the parent the card total is shown before checkout.
4. If charging a saved card and recovery applies, confirm disclosure acceptance before charging.
5. Do not manually enter or store card numbers in notes, messages, spreadsheets, or screenshots.

## Run A Payment From Billing Admin

1. Choose the family billing account.
2. Choose payment target: open invoice, total balance, or custom amount.
3. Choose payment method: autopay, saved method, card checkout, instant bank checkout, or ACH checkout.
4. Review the payment route summary.
5. Confirm the school payout account is ready.
6. Submit the payment or open the secure checkout handoff.
7. Wait for processor confirmation or webhook reconciliation.
8. Do not mark paid manually unless the external payment has been verified.

## Prevent Incorrect Or Duplicate Charges

Before every manual payment, batch, or autopay run:

1. Confirm the school, family, child, invoice number, service week, amount, and Stripe connected account.
2. Review the full ledger, including credits and payments that are pending, processing, succeeded, refunded, or disputed.
3. Use the autopay preview before a live run. Stop if the family, invoice, or amount is unexpected.
4. Keep only one selected default family method for autopay. Multiple methods attached in Stripe do not authorize charging both.
5. Never run batch billing for a period already created by recurring tuition.
6. Never click `Create Invoice Now` to correct a paid or already-existing invoice. Edit or adjust the specific historical record under the approved correction process.
7. Do not retry a card, ACH, instant-bank, Checkout, or Terminal attempt while it is pending or processing. First verify its status in The BEE Suite and the school's connected Stripe account.
8. If a payment succeeded but the ledger did not update, do not submit it again. Escalate with the payment ID, invoice ID, connected account, amount, and event time.
9. Account credit must be applied before deciding the remaining amount to charge. If the displayed credit or remaining balance is unclear, leave autopay disabled and escalate.
10. For refunds, identify the original connected-account charge, distinguish tuition principal from fees, and refund only the approved amount. Never compensate by deleting payment history.

Stop immediately if one invoice shows two succeeded payments, two active payment attempts, a method from another connected account, or a balance that does not reconcile. Disable autopay for that family, preserve the records, and escalate; do not issue another charge or delete ledger history.

## Run An In-Person Stripe Terminal Payment

Use this only for an authorized school with a ready connected account and a certified reader assigned to that school's Stripe Terminal location.

1. Open the intended family billing account and confirm the school, family, billing account, invoice or amount, and payout account.
2. Choose `In-Person Card Reader`.
3. Select an online reader registered to the current school.
4. If needed, register the school's S700/S710 or WisePOS E using its pairing code and a clear reader label.
5. Confirm the parent is physically present and can review and cancel from the reader.
6. Review the account payment, any approved card recovery, and the total shown on the reader.
7. Ask the parent to tap, insert, or swipe on the Stripe reader.
8. Wait for processor status and webhook reconciliation before treating the payment as recorded.

Card details are encrypted by Stripe hardware and never enter The BEE Suite. Smart readers are controlled over the network; direct USB data use requires Stripe's Android mobile-reader SDK.

## Failed Or Pending Payment Procedure

1. Open the family billing account.
2. Review payment status and failure reason.
3. Confirm whether another payment already succeeded.
4. If a checkout is still open or processing, do not create duplicate checkout links.
5. Use the dunning or reminder workflow when available.
6. Contact the family with approved language.
7. Escalate repeated failures, disputes, refunds, and account ownership questions.

## Subsidy Or Agency Payments

1. Confirm agency payer, authorization number, coverage dates, and expected amount.
2. Post agency payment to the correct family or child.
3. Keep family copay separate from agency portion when configured.
4. Include reference numbers when available.
5. Do not write off balances without director or accounting approval.

## Reconciliation Procedure

1. Review recent payments and ledger entries.
2. Compare processor confirmation, payment status, invoice status, and ledger balance.
3. Resolve duplicate draft checkouts before sending new links.
4. Export reports required by the school or accounting owner.
5. Escalate mismatches with the payment ID, invoice number, family, amount, and screenshot.

## Weekly Billing Checklist

- Review open invoices.
- Review past-due balances.
- Review pending ACH/bank payments.
- Review failed payments and dunning tasks.
- Review subsidy/agency receivables.
- Review payment method/autopay setup status.
- Confirm upcoming tuition run settings, child assignments, and start periods.
- Spot-check that family totals equal the active per-child weekly rates.
- Export or save required reports.
- Document unresolved blockers and owners.

## Billing Escalation Packet

Include:

- School name.
- Family or billing account.
- Invoice number.
- Amount.
- Payment method.
- User email.
- Stripe connected account or payment reference if available.
- Page or action attempted.
- Expected result.
- Actual result.
- Screenshot if safe to share.
- Time of issue.
