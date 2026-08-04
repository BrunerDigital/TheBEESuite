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

test("payment disclosure separates the parent 2.9 percent card fee from the school-paid BEE Suite fee", () => {
  assert.match(PAYMENT_PROCESSING_RECOVERY_LABEL, /card processing fee/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /2\.9%/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, /parent's eligible payment amount/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION, /2\.9% card processing fee/i);
  assert.match(PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE, /1\.5% BEE Suite application fee is deducted from school proceeds/i);
  assert.equal(PAYMENT_PROCESSING_RECOVERY_VERSION, "payment-processing-recovery-2026-06-09");
});

test("payment summary discloses the parent card fee", () => {
  const summary = paymentProcessingRecoverySummary({
    achRecovery: 250,
    cardRecovery: 610,
    formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`,
  });

  assert.equal(
    summary,
    "ACH and instant bank have no parent processing fee; estimated card processing fee $6.10. Exact totals are shown before submission.",
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
    "ACH and instant bank have no parent processing fee; estimated card processing fee $6.10. Exact totals are shown before submission.",
  );
});
