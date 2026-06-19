import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKioskTuitionBalanceWarning } from "../src/lib/kiosk-billing-reminders";

test("kiosk tuition warning is friendly and non-blocking", () => {
  const warning = buildKioskTuitionBalanceWarning({
    balanceCents: 37500,
    nextOpenInvoice: { number: "INV-100", totalCents: 25000, dueDate: "2026-06-22T12:00:00.000Z" },
  });

  assert.equal(warning?.type, "tuition_balance_due");
  assert.match(warning?.message ?? "", /Friendly reminder/);
  assert.match(warning?.message ?? "", /\$375.00/);
  assert.match(warning?.message ?? "", /still check in/);
  assert.match(warning?.message ?? "", /The BEE Suite parent portal/);
});

test("kiosk tuition warning falls back to the next open invoice", () => {
  const warning = buildKioskTuitionBalanceWarning({
    balanceCents: 0,
    nextOpenInvoice: { number: "INV-101", totalCents: 12500 },
  });

  assert.equal(warning?.message.includes("$125.00"), true);
  assert.equal(warning?.message.includes("INV-101"), true);
});

test("kiosk tuition warning is omitted when no balance is due", () => {
  assert.equal(buildKioskTuitionBalanceWarning({ balanceCents: 0, nextOpenInvoice: null }), null);
});
