import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { terminalPaymentReceiptStatus } from "../src/lib/terminal-payment-receipt";

test("terminal status failures and malformed success never unlock an unknown charge", () => {
  for (const ok of [true, false]) for (const body of [null, {}, [], { ok: false }, { status: "unexpected" }, { status: "review" }]) {
    assert.equal(terminalPaymentReceiptStatus(ok, body, "payment-a"), "review");
  }
  assert.equal(terminalPaymentReceiptStatus(false, { status: "failed" }, "payment-a"), "review");
  assert.equal(terminalPaymentReceiptStatus(true, { ok: true, status: "succeeded", paymentId: "payment-b" }, "payment-a"), "review");
  assert.equal(terminalPaymentReceiptStatus(true, { status: "succeeded" }, "payment-a"), "review");
  assert.equal(terminalPaymentReceiptStatus(true, { status: "failed" }, "payment-a"), "review");
  assert.equal(terminalPaymentReceiptStatus(true, { ok: true, status: "failed", paymentId: "payment-a" }, "payment-a"), "review");
  assert.equal(terminalPaymentReceiptStatus(true, { ok: false, status: "failed", paymentId: "payment-b" }, "payment-a"), "review");
});

test("only exact success or explicit confirmed failure finishes a reader request", () => {
  assert.equal(terminalPaymentReceiptStatus(true, { ok: true, status: "succeeded", paymentId: "payment-a" }, "payment-a"), "succeeded");
  assert.equal(terminalPaymentReceiptStatus(true, { ok: false, status: "failed", paymentId: "payment-a" }, "payment-a"), "failed");
  assert.equal(terminalPaymentReceiptStatus(false, { status: "processing", paymentId: "payment-a" }, "payment-a"), "processing");
});

test("reader quotes stay editable while mutation dispatch locks the target", () => {
  const source = readFileSync("src/components/stripe-terminal-payment.tsx", "utf8");
  const quote = source.slice(source.indexOf("const loadReaders ="), source.indexOf("}, [amountCents,"));
  assert.doesNotMatch(quote, /onStatusChange|setStatus\("loading"\)/);
  assert.match(quote, /setReadersLoading\(true\)/);
  assert.match(source, /setTimeout\(\(\) => void loadReaders\(controller\.signal\), 300\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.equal((source.match(/onStatusChange\?\.\("loading"\)/g) ?? []).length, 2);
  const route = readFileSync("src/app/api/billing/terminal-payment/route.ts", "utf8");
  assert.match(route, /status === PaymentStatus\.FAILED[\s\S]*?ok: false, status: "failed", paymentId: payment\.id/);
});
