# Help a parent enable family autopay

Category: Billing

Before you start: confirm the correct school and role. Use approved source records; perform live changes only within your assigned authority.

1. Confirm the school and family, then review all due invoices, credits and pending payment attempts before discussing collection.
2. Explain that a child’s tuition assignment, a saved payment method and autopay are three separate controls.
3. Have the parent sign into their own Parent Portal and review the intended saved payment method. Never request or use their password.
4. The parent reviews and enables autopay in their portal only when they consent. Current director controls do not enable or disable the parent’s autopay choice.
5. Reopen the family’s billing information to verify the displayed autopay state and method. Do not submit a charge merely to test the setting.
6. Directors may use a saved method for an eligible invoice only after parent authorization, appropriate permissions and the usual payment review. Pending or processing attempts must be reconciled first.

Current source review: family-record-editor.tsx, billing-workbench.tsx and /api/billing/autopay at c62c6ec1. This updates the older SOP wording.

## Verify the result

The parent’s consent, intended method and displayed autopay state agree; no test charge is needed.

## If something goes wrong

Pending payment, wrong connected account or missing authorization blocks activation. Wait for pending actions; reopen the record before retrying an uncertain save or send.

Source: src/components/billing-workbench.tsx and src/app/api/billing/autopay/route.ts (c62c6ec1) — Parent-authorized autopay. Prepared October 8, 2026. SOP snapshot e06ad8d5; current source corrections are identified above. Written procedure; not a recording of a completed live action.
