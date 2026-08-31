import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unambiguousZonedDateTimeLocalToUtc } from "@/lib/zoned-date-time";

const invoicesRoute = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
const printActions = readFileSync("src/components/billing-print-actions.tsx", "utf8");
const parentPortal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("cash payments use the director billing and family access guardrails", () => {
  const postHandler = section(invoicesRoute, "async function POSTHandler", "async function PATCHHandler");
  const cashHandler = section(invoicesRoute, "async function createManualCashPayment", "async function refundStripePayment");

  assert.match(postHandler, /canManageBilling\(user\)/);
  assert.match(postHandler, /mode === "manualCashPayment"/);
  assert.match(cashHandler, /assertFamilyAccess\(user, clean\(body\.familyId\)\)/);
  assert.match(cashHandler, /amountCents <= 0/);
});

test("cash payments atomically record payment, ledger credit, and balance", () => {
  const cashHandler = section(invoicesRoute, "async function createManualCashPayment", "async function refundStripePayment");

  assert.match(cashHandler, /prisma\.\$transaction/);
  assert.match(cashHandler, /status: PaymentStatus\.PAID/);
  assert.match(cashHandler, /provider: "manual_cash"/);
  assert.match(cashHandler, /balanceCents: \{ decrement: amountCents \}/);
  assert.match(cashHandler, /type: "cash_payment"/);
  assert.match(cashHandler, /amountCents: -amountCents/);
  assert.match(cashHandler, /balanceAfterCents: updatedAccount\.balanceCents/);
  assert.match(cashHandler, /action: "billing\.cash_payment\.created"/);
  assert.match(cashHandler, /settleOpenInvoicesForOfflinePayment/);
  assert.match(cashHandler, /appliedInvoiceIds/);
});

test("every offline family payment settles fully covered oldest open invoices", () => {
  const offlineHandlers = section(invoicesRoute, "async function createManualCheckPayment", "async function refundStripePayment");

  assert.equal(offlineHandlers.match(/settleOpenInvoicesForOfflinePayment\(tx/g)?.length, 3);
  assert.match(invoicesRoute, /applyFamilyBalancePaymentToOpenInvoices/);
  assert.match(invoicesRoute, /invoiceApplicationStatus: "applied_to_open_invoices"/);
});

test("directors can enter cash details and families see a clear payment label", () => {
  assert.match(workbench, /TabsTrigger value="cash"/);
  assert.match(workbench, /mode: "manualCashPayment"/);
  assert.match(workbench, /Post Cash Payment/);
  assert.match(workbench, /Receipt \/ reference/);
  assert.match(workbench, /automatically marks fully covered oldest invoices paid/);
  assert.match(parentPortal, /provider === "manual_cash"\) return "Cash payment"/);
});

test("manual cash timestamps use the selected school's local date and time", () => {
  assert.match(workbench, /resolveSchoolTimeZone\(centerId\)/);
  assert.match(workbench, /zonedDateTimeLocalValue\(new Date\(\), timeZone\)/);
  assert.match(workbench, /const localNow = currentLocalDateTime\(resolveSchoolTimeZone\(value\)\);[\s\S]*setCheckPaidAt\(localNow\);[\s\S]*setCashPaidAt\(localNow\);[\s\S]*setPayrollPaidAt\(localNow\);/);
  assert.match(workbench, /manualPaymentTimestamp\(cashPaidAt, timeZone\)/);
  assert.match(workbench, /type="datetime-local" value=\{cashPaidAt\}/);
});

test("payment receipts use the payment family's school time zone", () => {
  assert.match(printActions, /useSchoolTimeZone\(payment\.billingAccount\.family\.centerId\)/);
  assert.match(printActions, /formatPrintDateTime\(payment\.paidAt, timeZone\)/);
});

test("manual payments reject nonexistent and repeated daylight-saving wall times", () => {
  assert.equal(unambiguousZonedDateTimeLocalToUtc("2026-03-08T02:30", "America/New_York"), null);
  assert.equal(unambiguousZonedDateTimeLocalToUtc("2026-11-01T01:30", "America/New_York"), null);
  assert.equal(unambiguousZonedDateTimeLocalToUtc("2026-04-05T01:45", "Australia/Lord_Howe"), null);
  assert.equal(unambiguousZonedDateTimeLocalToUtc("2026-08-27T17:15", "America/New_York")?.toISOString(), "2026-08-27T21:15:00.000Z");
});

test("each successful manual payment refreshes its default received time", () => {
  assert.match(workbench, /payload\.mode === "manualCheckPayment"[\s\S]*setCheckPaidAt\(currentLocalDateTime\(timeZone\)\)/);
  assert.match(workbench, /payload\.mode === "manualCashPayment"[\s\S]*setCashPaidAt\(currentLocalDateTime\(timeZone\)\)/);
  assert.match(workbench, /payload\.mode === "payrollDeductionPayment"[\s\S]*setPayrollPaidAt\(currentLocalDateTime\(timeZone\)\)/);
});
