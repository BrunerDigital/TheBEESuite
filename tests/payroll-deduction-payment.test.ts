import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("payroll deductions are explicit offline payments with an auditable idempotency reference", () => {
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  assert.match(route, /mode === "payrollDeductionPayment"/);
  assert.match(route, /provider: "manual_payroll_deduction"/);
  assert.match(route, /sourceSystem: "bee_suite_payroll_deduction"/);
  assert.match(route, /sourceSystem_externalId/);
  assert.match(route, /Payroll run or pay-period reference is required/);
  assert.match(route, /billing\.payroll_deduction_payment\.created/);
  assert.match(route, /manualFamilyPaymentExceedsVisibleBalance/);
});

test("director copy distinguishes a completed payroll payment from a discount or benefit", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.match(workbench, /Use this only after payroll confirms the deduction/);
  assert.match(workbench, /offline family payment.not a discount or employer benefit/);
  assert.match(workbench, /payroll run \/ pay period/i);
});
