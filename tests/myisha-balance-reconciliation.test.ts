import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/reconcile-lees-summit-myisha-balance.ts", "utf8");

test("Myisha source-balance reconciliation is guarded and preserves financial history", () => {
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /source_balance_reconciliation/);
  assert.match(source, /originalLedgerPreserved: true/);
  assert.match(source, /invoicesChanged: 0/);
  assert.match(source, /paymentsChanged: 0/);
  assert.match(source, /refundsCreatedOrChanged: 0/);
  assert.match(source, /chargesCreated: 0/);
  assert.doesNotMatch(source, /\.invoice\.(delete|deleteMany)\(/);
  assert.doesNotMatch(source, /\.payment\.(create|update|delete|deleteMany)\(/);
  assert.doesNotMatch(source, /\.refundRequest\.(create|update|delete|deleteMany)\(/);
});

test("Myisha reconciliation is anchored to both later ProCare sources", () => {
  assert.match(source, /Current Billing\.csv/);
  assert.match(source, /Standard customer statement\.pdf/);
  assert.match(source, /reportedBalanceCents: 0/);
  assert.match(source, /endingBalanceCents: 0/);
  assert.match(source, /stripePaymentIntentsFound: stripeEvidence\.paymentIntents\.length/);
  assert.match(source, /stripeChargesFound: stripeEvidence\.charges\.length/);
  assert.match(source, /stripeRefundsFound: stripeEvidence\.charges\.reduce/);
});

test("Myisha apply fingerprint includes a fresh exact connected-customer Stripe audit", () => {
  assert.match(source, /loadStripeEvidence\(\)/);
  assert.match(source, /const reviewed = \{ database: reviewedState\(before\), stripe: stripeEvidence \}/);
  assert.match(source, /fingerprint\(\{ database: reviewedState\(current\), stripe: stripeEvidence \}\)/);
  assert.match(source, /\/v1\/payment_intents\?customer=\$\{STRIPE_CUSTOMER_ID\}/);
  assert.match(source, /\/v1\/charges\?customer=\$\{STRIPE_CUSTOMER_ID\}/);
  assert.match(source, /\/v1\/refunds\?charge=\$\{charge\.id\}/);
  assert.match(source, /stripeEvidence\.paymentIntents\.length === 0 && stripeEvidence\.charges\.length === 0/);
});
