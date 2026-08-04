-- READ ONLY. This report does not update billing, family, payment, or ledger data.
-- Run with a role authorized to review all named locations. Provider Stripe fees
-- are populated only when already reconciled into local JSON; NULL means the
-- connected-account balance transaction must be fetched read-only from Stripe.
WITH agency_by_account AS (
  SELECT
    "billingAccountId",
    GREATEST(SUM("amountCents"), 0)::bigint AS agency_responsible_cents
  FROM "LedgerEntry"
  WHERE lower(type) IN (
    'agency_payment', 'agency_receivable', 'agency_voucher_credit',
    'subsidy_payment', 'subsidy_receivable'
  ) OR lower(coalesce("sourceSystem", '')) = 'subsidy_agency'
  GROUP BY "billingAccountId"
),
candidate_payments AS (
  SELECT
    p.*,
    greatest(
      coalesce(nullif(p."customFields"->>'parentProcessingRecoveryAmountCents', '')::int, 0),
      coalesce(nullif(p."customFields"->>'parentSurchargeAmountCents', '')::int, 0)
    ) AS added_fee_cents,
    coalesce(
      nullif(p."customFields"->>'stripeAmountTotalCents', '')::int,
      nullif(p."customFields"->>'checkoutTotalCents', '')::int,
      p."amountCents"
    ) AS amount_charged_cents,
    coalesce(
      nullif(p."customFields"->>'stripeFeeAmountCents', '')::int,
      nullif(p."customFields"->>'providerFeeAmountCents', '')::int
    ) AS stripe_fee_cents
  FROM "Payment" p
  WHERE p.provider = 'stripe'
)
SELECT
  c.name AS location,
  f.id AS family_account_identifier,
  coalesce(p."paidAt", nullif(p."customFields"->>'stripeEventCreatedAt', '')::timestamptz) AS transaction_date,
  greatest(ba."balanceCents" - coalesce(aa.agency_responsible_cents, 0), 0) AS parent_responsible_balance_cents,
  coalesce(aa.agency_responsible_cents, 0) AS agency_responsible_balance_cents,
  p.amount_charged_cents,
  p.added_fee_cents,
  p.stripe_fee_cents,
  CASE WHEN p.stripe_fee_cents IS NULL THEN true ELSE false END AS stripe_fee_lookup_required,
  p.status::text AS payment_status,
  coalesce(p."customFields"->>'stripeRefundStatus', p."customFields"->>'refundStatus', 'none_recorded') AS refund_status,
  coalesce(p."customFields"->>'stripeDisputeStatus', 'none_recorded') AS dispute_status,
  p."customFields"->>'stripePaymentIntentId' AS stripe_payment_intent_id,
  p."customFields"->>'stripeConnectedAccountId' AS stripe_connected_account_id
FROM candidate_payments p
JOIN "BillingAccount" ba ON ba.id = p."billingAccountId"
JOIN "Family" f ON f.id = ba."familyId"
LEFT JOIN "Center" c ON c.id = f."centerId"
LEFT JOIN agency_by_account aa ON aa."billingAccountId" = ba.id
WHERE p.added_fee_cents > 0
   OR p.amount_charged_cents > p."amountCents"
ORDER BY transaction_date DESC NULLS LAST, location, family_account_identifier;
