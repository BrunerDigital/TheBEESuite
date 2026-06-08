import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION,
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_LABEL,
  PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE,
  paymentProcessingRecoverySummary,
} from "../src/lib/payment-disclosures";

test("payment recovery disclosure names ACH preference and card processing recovery", () => {
  assert.match(PAYMENT_PROCESSING_RECOVERY_LABEL, /processing recovery/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /ACH payments are the preferred/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /Card payments may include/i);
  assert.doesNotMatch(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /convenience fee/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /shown before payment/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION, /applicable rules/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE, /state rules/i);
});

test("payment recovery summary includes bank and card estimates", () => {
  const summary = paymentProcessingRecoverySummary({
    achRecovery: 250,
    cardRecovery: 610,
    formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`,
  });

  assert.equal(
    summary,
    "Estimated ACH recovery $2.50; estimated card processing recovery $6.10. Exact totals are shown in Stripe Checkout before payment.",
  );
});

test("payment recovery summary treats ACH as lowest-cost when no recovery is configured", () => {
  const summary = paymentProcessingRecoverySummary({
    achRecovery: 0,
    cardRecovery: 610,
    formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`,
  });

  assert.equal(
    summary,
    "ACH is the lowest-cost option; estimated card processing recovery $6.10. Exact totals are shown in Stripe Checkout before payment.",
  );
});
