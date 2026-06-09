# Payment Processing Recovery Disclosure And Review

Last updated: June 9, 2026

This packet finalizes the product copy, operating assumptions, and launch gate for parent-paid payment processing recovery in The BEE Suite. It is not legal advice. Each school, payout owner, legal counsel, and accounting owner must approve the policy before live parent-paid processing recovery is enabled.

## Product Decision

- Use `Payment processing recovery` as the parent-facing line-item label.
- Do not use `convenience fee` or `surcharge` as the default parent-facing label in the app.
- Keep ACH bank payment positioned as the default low-cost tuition payment option.
- Show any recovery amount as a separate Checkout line before payment.
- Keep the family ledger tuition amount separate from the recovery amount.
- Keep BEE Suite payment operations economics school/brand-side, not an undisclosed parent add-on.
- Keep live parent-paid recovery at `$0` until the legal/accounting gate is explicitly approved.

The production gate is:

```text
STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=false
```

Set it to `true` only after the school/payout owner has approved written policy, state-specific rules, card-network/acquirer notice, debit/prepaid handling, refunds, disputes, and accounting classification.

## Final App Copy

Parent portal and checkout disclosure:

```text
ACH bank payment is the default low-cost tuition payment option. If this school allows card payments, a separate payment processing recovery line may be added before checkout to recover third-party processor and card-network costs. The exact amount is shown before payment, is separate from tuition, and is disabled wherever school policy, card-network rules, or applicable law do not allow it.
```

Checkout line item:

```text
Payment processing recovery
```

Checkout line-item description:

```text
Separate payment processing recovery disclosed before checkout where approved by school policy, card-network rules, and applicable law.
```

Admin review note:

```text
Legal/accounting gate: keep live parent-paid processing recovery disabled until the school or payout owner approves written policy, state-specific rules, card-network/acquirer notice, debit/prepaid handling, refunds, disputes, and accounting classification.
```

Refund/dispute support copy for written policy review:

```text
Refunds, failed payments, ACH returns, card disputes, and any refund of payment processing recovery are handled according to the school's approved payment policy and applicable law. Staff should not promise a refund of processor costs unless the approved policy says it is refundable or legal/accounting requires it.
```

## Legal And Accounting Review Checklist

- School policy names who charges tuition, who is merchant/payout owner, and who receives tuition funds.
- State-specific review is complete for every state where the school operates.
- Card-network and acquirer rules are reviewed for notice, disclosure, cap, transaction type, receipt, and refund treatment.
- Debit and prepaid card handling is approved before any card recovery is enabled. If card recovery cannot be limited to legally allowed card types, leave card recovery disabled.
- Parent authorization terms explain tuition, payment method, timing, saved payment method/autopay, failed payment handling, ACH returns, refunds, disputes, and support contacts.
- Accounting approves whether recovery is revenue, processor-cost reimbursement, pass-through, or another treatment.
- Support approves scripts for parent questions, failed payments, refunds, disputes, and duplicate charges.
- The school confirms whether school/corporate absorbs failed-payment, ACH, card, dispute, and refund fees.
- Test mode confirms the line item, total, receipt/payment record, ledger credit, application fee, transfer, refund, and dispute events reconcile correctly.

## Engineering Controls

- `STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=false` keeps parent-paid recovery at `$0` even if rates are configured.
- `STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES=true` keeps method-specific Checkout Sessions from mixing low-cost and high-cost payment methods.
- `STRIPE_PARENT_SURCHARGE_BPS`, `STRIPE_PARENT_SURCHARGE_FIXED_CENTS`, and `STRIPE_PARENT_SURCHARGE_MAX_CENTS` are legacy/global controls and should remain `0` for live tuition unless counsel approves a separate global model.
- `STRIPE_ACH_PROCESSING_RECOVERY_BPS=80` and `STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS=500` match the current ACH recovery policy, but remain inactive until the approval gate is enabled.
- `STRIPE_CARD_PROCESSING_RECOVERY_BPS=290`, `STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS=30`, and `STRIPE_CARD_PROCESSING_RECOVERY_GROSS_UP=true` match the current card recovery policy, but remain inactive until the approval gate is enabled.
- Checkout metadata stores `feeDisclosureVersion=payment-processing-recovery-2026-06-09`.

## Source Checks

- Stripe US pricing: standard online card pricing and ACH Direct Debit pricing should be rechecked before changing rates. See [Stripe pricing](https://stripe.com/pricing) and [Stripe ACH Direct Debit](https://stripe.com/payments/ach-direct-debit).
- Stripe Checkout should continue to use hosted Checkout Sessions and payment method configurations. See [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) and [payment method configurations](https://docs.stripe.com/payments/payment-method-configurations).
- Visa's merchant surcharge materials require careful review for notice, credit/debit distinction, state law, cap, and disclosure obligations. See [Visa merchant surcharging Q&A](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchant-surcharging-qa-for-web.pdf).
- Mastercard requires registration/notice and has card-type, disclosure, and cap rules that must be reviewed before live enablement. See [Mastercard merchant surcharge rules](https://www.mastercard.us/en-us/business/overview/support/merchant-surcharge-rules.html).

## Launch Position

The BEE Suite product copy and engineering gate are finalized. Live parent-paid recovery is still a per-school launch approval item because the final legal/accounting answer depends on the school's state, payout owner, processor/acquirer setup, card-type handling, written payment policy, and refund/dispute treatment.
