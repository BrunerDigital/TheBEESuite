import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/audit-pending-email-evidence.ts", "utf8");

test("pending email audit counts only real invoice payment applications", () => {
  assert.match(source, /INVOICE_APPLICATION_LEDGER_TYPES/);
  assert.match(source, /"payment"/);
  assert.match(source, /"cash_payment"/);
  assert.match(source, /"check_payment"/);
  assert.match(source, /"payroll_deduction_payment"/);
  assert.match(source, /"account_credit_application"/);
  assert.match(source, /"refund"/);
  assert.match(source, /"chargeback"/);
  assert.match(source, /"chargeback_reversal"/);
  assert.match(source, /INVOICE_APPLICATION_LEDGER_TYPES\.has\(entry\.type\)/);
  assert.match(source, /Math\.max\(0, -applicationDeltaCents\)/);
  assert.doesNotMatch(source, /INVOICE_APPLICATION_LEDGER_TYPES[\s\S]*?"tuition_credit"/);
  assert.doesNotMatch(source, /INVOICE_APPLICATION_LEDGER_TYPES[\s\S]*?"agency_voucher_credit"/);
});
