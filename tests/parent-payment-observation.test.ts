import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isServerCheckoutReceipt, isParentPaymentObservation, paymentResponseNeedsConfirmation } from "../src/lib/parent-payment-observation";

const target = { familyId: "fake-family", invoiceId: null, paymentId: null, requestNonce: "fake-nonce" };
const valid = { ...target, ok: true, version: 1, observedAt: "2026-09-12T00:00:00Z", accountPaymentBlocker: null, invoicePayments: [], outcome: "unidentified" };

test("empty status observation is correlated but not a settled payment receipt", () => {
  assert.equal(isParentPaymentObservation(valid, target), true);
  assert.equal(isParentPaymentObservation({ ...valid, outcome: "settled" }, target), false);
  for (const key of ["familyId", "invoiceId", "paymentId", "requestNonce"]) {
    assert.equal(isParentPaymentObservation({ ...valid, [key]: "other" }, target), false, key);
  }
  for (const patch of [{ ok: false }, { version: 2 }, { observedAt: "invalid" }, { outcome: "safe_to_retry" }, { outcome: ["unidentified"] }, { accountPaymentBlocker: {} }, { invoicePayments: {} }]) {
    assert.equal(isParentPaymentObservation({ ...valid, ...patch }, target), false);
  }
});
test("status shape validates every phase, count, method and invoice identity", () => {
  const payment = { phase: "confirmation_unknown", method: "card" };
  const body = { ...valid, accountPaymentBlocker: { ...payment, count: 1, blocksInvoicePayments: false }, invoicePayments: [{ invoiceId: "fake-invoice", payment }] };
  assert.equal(isParentPaymentObservation(body, target), true);
  for (const patch of [{ count: 0 }, { count: 1.5 }, { blocksInvoicePayments: "true" }, { method: undefined }, { phase: "paid" }, { phase: ["confirmation_unknown"] }]) {
    assert.equal(isParentPaymentObservation({ ...body, accountPaymentBlocker: { ...body.accountPaymentBlocker, ...patch } }, target), false);
  }
  assert.equal(isParentPaymentObservation({ ...body, invoicePayments: [...body.invoicePayments, ...body.invoicePayments] }, target), false);
});
test("ambiguous or malformed Checkout responses require confirmation without trusting bare URLs", () => {
  for (const status of [408, 409, 500, 502, 503]) assert.equal(paymentResponseNeedsConfirmation({ ok: false, status }, null), true);
  for (const status of [400, 401, 403, 404, 422, 429]) assert.equal(paymentResponseNeedsConfirmation({ ok: false, status }, { error: "Denied" }), false);
  const receipt = { ok: true, paymentId: "fake-payment", stripeSessionId: "cs_test_fake", url: "https://checkout.stripe.com/c/pay_fake" };
  for (const url of [undefined, "", "javascript:alert(1)", "http://checkout.stripe.com/pay", "https:checkout.stripe.com/pay", "//checkout.stripe.com/pay", "https://user@checkout.stripe.com/pay", "https://checkout.stripe.com:8443/pay", "https://checkout.stripe.com/\\evil", " https://checkout.stripe.com/pay"]) {
    assert.equal(isServerCheckoutReceipt({ ...receipt, url }), false);
    assert.equal(paymentResponseNeedsConfirmation({ ok: true, status: 200 }, { ...receipt, url }), true);
  }
  for (const url of [receipt.url, "https://payments.example.test/c/pay/cs_test_fake"]) {
    assert.equal(isServerCheckoutReceipt({ ...receipt, url }), true, "Trusted server receipt supports Stripe custom domains");
    assert.equal(paymentResponseNeedsConfirmation({ ok: true, status: 200 }, { ...receipt, url }), false);
    for (const patch of [{ ok: false }, { ok: undefined }, { ok: "true" }, { paymentId: undefined }, { paymentId: "../bad" }, { stripeSessionId: undefined }, { stripeSessionId: "pi_fake" }, { stripeSessionId: "cs_" }]) {
      assert.equal(paymentResponseNeedsConfirmation({ ok: true, status: 200 }, { ...receipt, url, ...patch }), true);
    }
  }
  for (const url of ["https://evil.example.test", "https://checkout.stripe.com.evil.example.test/pay", receipt.url]) {
    assert.equal(isServerCheckoutReceipt({ ok: true, url }), false, "A URL alone is not a server payment receipt");
  }
});
test("actual parent payment observation route is authorized, scoped, complete and read-only", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/parent-payment-observation-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /complete scoped drafts/); assert.match(result.stdout, /missing receipt never proves failure/);
});
