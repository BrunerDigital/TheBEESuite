import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const invoicesRoute = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
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
});

test("directors can enter cash details and families see a clear payment label", () => {
  assert.match(workbench, /TabsTrigger value="cash"/);
  assert.match(workbench, /mode: "manualCashPayment"/);
  assert.match(workbench, /Post Cash Payment/);
  assert.match(workbench, /Receipt \/ reference/);
  assert.match(parentPortal, /provider === "manual_cash"\) return "Cash payment"/);
});
