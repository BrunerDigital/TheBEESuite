import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION,
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_LABEL,
  PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE,
  PAYMENT_PROCESSING_RECOVERY_VERSION,
  paymentProcessingRecoverySummary,
} from "../src/lib/payment-disclosures";

test("payment disclosure states that schools absorb Stripe costs and the 1 percent BEE Suite fee", () => {
  assert.match(PAYMENT_PROCESSING_RECOVERY_LABEL, /school-paid processing/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /schools absorb Stripe processing costs/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /no added processing, convenience, service, platform, or application fee/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION, /no payment-processing fee/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE, /1% BEE Suite application fee reduce school proceeds/i);
  assert.equal(PAYMENT_PROCESSING_RECOVERY_VERSION, "payment-processing-recovery-2026-06-09");
});

test("payment summary confirms that the parent has no processing fee", () => {
  const summary = paymentProcessingRecoverySummary({
    achRecovery: 250,
    cardRecovery: 610,
    formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`,
  });

  assert.equal(
    summary,
    "The school absorbs Stripe processing costs; no processing fee is added to the parent's payment.",
  );
});

test("payment recovery summary does not change when ACH recovery is zero", () => {
  const summary = paymentProcessingRecoverySummary({
    achRecovery: 0,
    cardRecovery: 610,
    formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`,
  });

  assert.equal(
    summary,
    "The school absorbs Stripe processing costs; no processing fee is added to the parent's payment.",
  );
});
