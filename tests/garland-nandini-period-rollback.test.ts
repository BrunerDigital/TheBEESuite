import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../scripts/rollback-incorrect-nandini-week-period-correction.ts", import.meta.url),
  "utf8",
);

test("Nandini period rollback is exact, idempotent, and payment preserving", () => {
  assert.match(source, /--confirm-rollback-incorrect-nandini-correction/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /mode: "already_rolled_back"/);
  assert.match(source, /billing\.garland_nandini_weekly_period_correction_reversed/);
  assert.match(source, /paymentPreserved: true/);
  assert.match(source, /newChargeCreated: false/);
  assert.match(source, /refundCreated: false/);
  assert.match(source, /invoiceStatus: PaymentStatus\.PAID/);
  assert.match(source, /paymentStatus: PaymentStatus\.PAID/);
  assert.match(source, /balanceCents: 0/);
  assert.doesNotMatch(source, /createPaymentIntent|createCheckout|refundPayment|retrieveStripePaymentIntent/);
});
