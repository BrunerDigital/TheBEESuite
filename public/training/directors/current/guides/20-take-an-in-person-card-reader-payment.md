# Take an in-person card-reader payment

Category: Billing

Before you start: confirm the correct school and role. Use approved source records; perform live changes only within your assigned authority.

Use this only for an authorized school with a ready connected account and a certified reader assigned to that school's Stripe Terminal location.

1. Open the intended family billing account and confirm the school, family, billing account, invoice or amount, and payout account.
2. Choose `In-Person Card Reader`.
3. Select an online reader registered to the current school.
4. If needed, register the school's S700/S710 or WisePOS E using its pairing code and a clear reader label.
5. Confirm the parent is physically present and can review and cancel from the reader.
6. Review the account payment and exact total shown on the reader. No processing fee is added to the parent payment.
7. Ask the parent to tap, insert, or swipe on the Stripe reader.
8. Wait for processor status and webhook reconciliation before treating the payment as recorded.

Card details are encrypted by Stripe hardware and never enter The BEE Suite. Smart readers are controlled over the network; direct USB data use requires Stripe's Android mobile-reader SDK.

## Verify the result

One confirmed payment and receipt match the family and amount.

## If something goes wrong

Stop if reader, school account, parent presence or payment result is uncertain. Wait for pending actions; reopen the record before retrying an uncertain save or send.

Source: sources/BILLING_ADMIN_SOP.md — Run An In-Person Stripe Terminal Payment. Prepared October 8, 2026. SOP snapshot e06ad8d5; current source corrections are identified above. Written procedure; not a recording of a completed live action.
