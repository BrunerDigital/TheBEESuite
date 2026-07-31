# Kid City Billing Configuration Audit

Audit date: July 31, 2026  
Mode: production read-only; no invoices, balances, payments, methods, approvals, or Stripe accounts changed

## Outcome

- All 70 active public Kid City locations have a mapped Stripe connected account that was reachable and matched the stored location binding.
- Five locations were technically ready for charges and payouts with no outstanding Stripe account requirements: Woodland Park East Midland, Holly Hill, Kokomo, Lees Summit, and Garland.
- Sixteen locations had a confirmed payout-bank record; 54 still awaited bank confirmation.
- Kokomo was the only location on the legacy billing-approved path. The other 69 locations remained blocked by The BEE Suite billing-approval gate, so technical account mapping cannot be mistaken for permission to bill.
- No explicit full-billing approval records were found. Business activation remains a separate location-by-location approval gate.

## Billing Data Guardrails

- 10 enabled child tuition assignments were found across two locations with positive tuition plans.
- No enabled assignment referenced another school's plan, lacked a start period, or used the wrong weekly billing day.
- Two Kokomo assignments require director confirmation because the child snapshot no longer matches the current plan.
- Five saved family payment methods were found, all at Kokomo. Autopay was disabled on all five.
- No saved method had a connected-account scope mismatch.
- No invoice had multiple succeeded Stripe payments, multiple active attempts, a duplicate dedupe key, or a non-positive open balance.
- No family had more than one opening-balance ledger entry, and no negative opening balance was found.

## Kokomo Records Requiring Director Confirmation

Do not change these from the audit alone; confirm the intended business values with the director first.

1. Richardson Family / Ava Richardson
   - Current plan: Toddler rate with 10% discount, $202.50 weekly.
   - Child assignment snapshot: $234.00 weekly, starting 2026-W32.
   - Account has a valid credit and older open weekly invoices. Preserve the credit and reconcile the exact service weeks before enabling autopay.

2. Allen Family / Wren Cain
   - Current plan: Preschool Weekly Rate with 10% Discount, $189.00 weekly.
   - Child assignment snapshot: $210.00 weekly.
   - Start period is 2027-W32 and requires confirmation; an unintended future year prevents current recurring invoices.
   - Review the separate open $160 invoice before changing the weekly assignment.

## Kokomo Incident Lessons Applied

- A saved payment method, weekly invoice creation, and autopay are separate controls.
- Existing family credit must be applied before the remaining Stripe charge principal is calculated.
- A connected-account refund must distinguish tuition principal from processor/platform fees and preserve the audit trail.
- Billing controls must reset when a different family is selected; no plan from another family or school may be used as a fallback.
- Batch billing and recurring weekly billing must never be used for the same service period.

## Director Sign-Off

For each active family, verify the school, child, weekly amount, start week, open invoices, credits, one selected saved method, and explicit autopay status. Leave autopay disabled whenever the ledger or assignment does not reconcile.
