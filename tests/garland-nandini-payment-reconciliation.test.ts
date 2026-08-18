import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("scripts/reconcile-garland-nandini-payment.ts", "utf8");

test("Nandini reconciliation is exact, provider-verified, fingerprinted, and idempotent", () => {
  assert.match(source, /paymentId: "cmsxsvtts000kjr04huhu5szm"/);
  assert.match(source, /billingAccountId: "cmsqggt16000rla04kma3pw7q"/);
  assert.match(source, /amountCents: 27_000/);
  assert.match(source, /retrieveStripeCheckoutSession/);
  assert.match(source, /retrieveStripePaymentIntent/);
  assert.match(source, /\/v1\/charges\/\$\{encodeURIComponent\(latestChargeId\)\}/);
  assert.match(source, /sessionPaymentStatus === "paid"/);
  assert.match(source, /intentStatus === "succeeded"/);
  assert.match(source, /state\.stripe\.charge\.status === "succeeded"/);
  assert.match(source, /state\.stripe\.charge\.paid/);
  assert.match(source, /state\.stripe\.charge\.amountRefundedCents === 0/);
  assert.match(source, /!state\.stripe\.charge\.refunded/);
  assert.match(source, /const appliedAt = new Date\(review\.state\.stripe\.charge\.createdAt!\)/);
  assert.match(source, /--confirm-nandini-payment-reconciliation/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /candidateInvoices\.length === 1/);
  assert.match(source, /lockedCandidateInvoices\.length !== 1/);
  assert.match(source, /application\.appliedInvoiceIds\?\.length !== 1/);
  assert.match(source, /mode: "already_applied"/);
  assert.match(source, /applySucceededStripeFamilyBalancePayment/);
  assert.match(source, /newChargeCreated: false/);
  assert.match(source, /refundCreated: false/);
  assert.doesNotMatch(source, /createStripeCheckoutSession|createStripePaymentIntent|createStripeRefund/);
});
