import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/apply-pisgah-hannah-september-discount.ts", "utf8");

test("Pisgah Hannah discount uses the approved monthly rate and September effective period", () => {
  assert.match(source, /PLAN_AMOUNT_CENTS = 18_500/);
  assert.match(source, /EMPLOYEE_DISCOUNT_CENTS = 9_250/);
  assert.match(source, /NET_AMOUNT_CENTS = 9_250/);
  assert.match(source, /BILLING_START_PERIOD = "2026-09"/);
  assert.match(source, /category: "employee_discount"/);
  assert.match(source, /Brenden Balance Spreadsheet\.xlsx/);
});

test("Pisgah assignment is fingerprinted and cannot alter August, payments, autopay, or staff access", () => {
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /augustInvoicesChanged: 0/);
  assert.match(source, /paymentsChanged: 0/);
  assert.match(source, /chargesCreated: 0/);
  assert.match(source, /paymentAutopayChanged: false/);
  assert.match(source, /staffAccessChanged: false/);
  assert.match(source, /fields\.tuitionBillingEnabled === true/);
  assert.match(source, /!state\.plan \|\| typeof fields\.tuitionPlanId !== "string" \|\| !fields\.tuitionPlanId/);
  assert.match(source, /fields\.tuitionPlanId === state\.plan\.id/);
  assert.doesNotMatch(source, /data:\s*\{[\s\S]*?autopayPlaceholder\s*:/);
  assert.doesNotMatch(source, /\.payment\.(create|update|delete|deleteMany)\(/);
  assert.doesNotMatch(source, /\.invoice\.(create|update|delete|deleteMany)\(/);
  assert.doesNotMatch(source, /\.staffProfile\.(create|update|delete|deleteMany)\(/);
});
