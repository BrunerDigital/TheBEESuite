import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isConfirmedOfflinePaymentReceipt } from "../src/lib/offline-payment-receipt";

const request = { mode: "manualCashPayment", familyId: "family", requestId: "request", amountCents: 10000 };
const receipt = {
  ok: true, totalCents: 10000,
  payment: { id: "payment", billingAccountId: "account", status: "PAID", provider: "manual_cash", amountCents: 10000,
    customFields: { requestId: "request", familyId: "family" } },
  entry: { id: "entry", billingAccountId: "account", paymentId: "payment", amountCents: -10000 },
};

test("cash and check receipts are accepted only for the submitted payment", () => {
  assert.equal(isConfirmedOfflinePaymentReceipt(receipt, request), true);
  assert.equal(isConfirmedOfflinePaymentReceipt({ ...receipt, alreadyRecorded: true }, request), true);
  assert.equal(isConfirmedOfflinePaymentReceipt({ ...receipt, payment: { ...receipt.payment, provider: "manual_check" } },
    { ...request, mode: "manualCheckPayment" }), true);
});

test("malformed successful HTTP bodies cannot clear an unconfirmed request", () => {
  for (const value of [null, undefined, [], "", {}, { ok: true }, { ...receipt, ok: false },
    { ...receipt, totalCents: 0 }, { ...receipt, payment: null }, { ...receipt, entry: null }]) {
    assert.equal(isConfirmedOfflinePaymentReceipt(value, request), false);
  }
});

test("wrong account, request, method, amount and ledger receipts fail closed", () => {
  for (const patch of [{ id: "" }, { billingAccountId: "other" }, { status: "DRAFT" }, { provider: "stripe" },
    { amountCents: 9999 }, { customFields: { requestId: "other", familyId: "family" } },
    { customFields: { requestId: "request", familyId: "other" } }]) {
    assert.equal(isConfirmedOfflinePaymentReceipt({ ...receipt, payment: { ...receipt.payment, ...patch } }, request), false);
  }
  for (const patch of [{ id: "" }, { paymentId: "other" }, { billingAccountId: "other" }, { amountCents: 10000 }]) {
    assert.equal(isConfirmedOfflinePaymentReceipt({ ...receipt, entry: { ...receipt.entry, ...patch } }, request), false);
  }
});

test("receipt validation precedes token rotation and draft reset", () => {
  const ui = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const guard = ui.indexOf("!isConfirmedOfflinePaymentReceipt(json, payload)");
  assert.ok(guard > 0 && guard < ui.indexOf("if (!completeOfflineOperation(payload))"));
  assert.match(ui.slice(guard, ui.indexOf("if (!completeOfflineOperation(payload))")), /setErrorMessage\([\s\S]*return;/);
});
