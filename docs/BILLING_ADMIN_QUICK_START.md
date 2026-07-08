# Billing Admin Quick Start

Last updated: July 1, 2026

This guide is for school billing users, directors who handle billing, and administrators validating tuition/payment workflows in The BEE Suite.

## Before You Enable Live Payments

Do not enable or promote live parent payments for a school until all of the following are complete:

1. Stripe connected account onboarding is complete for the correct school or payout owner.
2. Payment processing recovery policy, card recovery language, debit/prepaid handling, refunds, disputes, and parent-facing disclosures are approved by the school/legal/accounting owner. ACH and instant bank remain parent-fee-free.
3. Tuition plans, fees, discounts, subsidy rules, invoice cadence, ledger balances, and family billing accounts are validated against school records.
4. At least one billing smoke test has passed for the school using approved test data or approved live pilot data.
5. Support ownership is documented for failed payments, parent questions, refunds, disputes, and payout issues.

## Daily Billing Review

1. Open the billing dashboard or billing workbench.
2. Review open invoices, past-due balances, upcoming tuition runs, failed payments, subsidy balances, and billing follow-up tasks.
3. Confirm filters are set to the correct school/center before making changes.
4. Export or snapshot important reports before bulk corrections.

## Families, Balances, And Ledgers

- Confirm each billing account is attached to the correct family and school.
- Compare displayed balances to the latest ledger report before major corrections.
- Use ledger reconciliation reports to identify invoice/ledger mismatches.
- Keep notes factual and limited to billing-relevant details.
- Do not store full card numbers, bank account numbers, or other payment credentials in notes.

## Invoices And Tuition Runs

Before generating or sending invoices:

- Confirm tuition plans and assignments are current.
- Confirm discounts, sibling discounts, fees, subsidy/copay splits, and due dates.
- Review invoice previews when available.
- Check for duplicate draft invoices before creating another run.
- Confirm parent-facing copy and payment instructions are correct.

After invoices are created:

- Spot-check families across age groups, tuition plans, discounts, and subsidy scenarios.
- Confirm invoice totals, due dates, and ledger entries.
- Send parent notices only after the school approves the batch.

## Payment Method Requests And Autopay

- Use secure payment-method request links instead of collecting payment details manually.
- Confirm links are sent to the correct guardian/payer.
- Verify expiration and school branding before sending.
- Confirm autopay status before assuming a family will be charged automatically.
- If a parent reports a setup issue, verify the billing account, guardian contact, connected Stripe account, and request status.

## Failed Payments And Dunning

When a payment fails:

1. Check the failure reason and retry state.
2. Confirm whether the invoice is still open and whether another payment succeeded.
3. Use the scheduled dunning/follow-up workflow instead of sending duplicate manual reminders.
4. Escalate urgent or repeated failures to the director or billing owner.
5. Keep parent communication professional and aligned with approved policy language.

## Subsidy / Agency Payments

- Track subsidy/agency portions separately from family copays when configured.
- Confirm agency invoice, voucher, authorization, and expected payment dates.
- Review aging for both agency and family portions.
- Do not write off balances without school approval.

## Terminal Store / Hardware Orders

Before allowing real terminal or reader orders:

- Confirm live pricing, markup, shipping/tax handling, fulfillment owner, and support handoff.
- Confirm the order is for the correct school and shipping address.
- Confirm who handles replacement, returns, warranty, and device setup.

## Parent Billing Questions

For parent questions:

- Verify the caller/message sender is an authorized payer or guardian before discussing account details.
- Answer using invoice, ledger, payment, and approved policy information.
- Escalate disputes, refund requests, custody/payment responsibility questions, and legal/accounting questions to the director or billing owner.

## End-Of-Week Checklist

- Review open invoices and past-due balances.
- Review failed payment follow-ups.
- Confirm subsidy/agency receivables.
- Export or save billing reports required by the school.
- Confirm upcoming tuition run settings.
- Document unresolved billing blockers and owners.

## Support

When reporting a billing issue, include:

- School name.
- Family/billing account or invoice number.
- User email.
- Page or action attempted.
- Expected result.
- Actual result.
- Stripe connected account/payment reference if applicable.
- Screenshot or export if possible.
