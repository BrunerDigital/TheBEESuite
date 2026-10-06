import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

process.env.CRON_SECRET = "test-cron-secret";

let cadence = "weekly";
let startsPeriod = "2026-W41";
let pauseAfterPreflight = false;
let centerFields = { tuitionBillingEnabled: true };
let transactions = 0;
let invoices = 0;
let locks = [];
const childFields = () => ({
  tuitionBillingEnabled: true,
  tuitionPlanId: "plan-1",
  tuitionPlanAmountCents: 10000,
  tuitionBillingCadence: cadence,
  ...(startsPeriod ? { tuitionBillingStartsPeriod: startsPeriod } : {}),
});
const child = () => ({
  id: "child-1", familyId: "family-1", fullName: "Test Child",
  customFields: childFields(), family: { centerId: "center-1" },
});
const plan = () => ({ id: "plan-1", centerId: "center-1", name: "Tuition", amountCents: 10000, cadence });
const tx = {
  async $queryRaw(query) { locks.push(query.strings.join("?")); return [{ id: "locked" }]; },
  child: { async findFirst() { return { customFields: childFields() }; } },
  billingAccount: { async upsert() { return { id: "account-1" }; } },
  center: { async findUnique() { return { status: "active", customFields: centerFields }; } },
  invoice: { async findMany() { return []; } },
};
mock.module("@/lib/prisma", { namedExports: { prisma: {
  center: { async findMany() { return [{ id: "center-1", customFields: { tuitionBillingEnabled: true } }]; } },
  child: { async findMany() {
    if (pauseAfterPreflight) centerFields = { tuitionBillingEnabled: true, tuitionBillingPaused: true };
    return [child()];
  } },
  tuitionPlan: { async findMany() { return [plan()]; } },
  async $transaction(run) { transactions++; return run(tx); },
} } });
mock.module("@/lib/billing-invoices", { namedExports: {
  async createBillingInvoiceForFamily() {
    invoices++;
    return { created: true, invoice: { id: "invoice-1", number: "INV-1", totalCents: 10000 }, totalCents: 10000 };
  },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });

const { GET } = await import("../src/app/api/cron/tuition-billing/route.ts");
const run = async () => {
  const response = await GET(new NextRequest("https://app.test/api/cron/tuition-billing?asOf=2026-10-08", {
    headers: { authorization: "Bearer test-cron-secret" },
  }));
  return { status: response.status, body: await response.json() };
};

test("missing multiweek start periods produce no invoice or ledger write", async () => {
  for (const missingCadence of ["biweekly", "four_week"]) {
    cadence = missingCadence;
    startsPeriod = "";
    centerFields = { tuitionBillingEnabled: true };
    pauseAfterPreflight = false;
    transactions = 0;
    invoices = 0;
    locks = [];
    const result = await run();
    assert.equal(result.body.dueChildren, 0);
    assert.equal(result.body.configurationFailed, 1);
    assert.equal(result.body.created, 0);
    assert.equal(transactions, 0);
    assert.equal(invoices, 0);
    assert.deepEqual(locks, []);
  }
});

test("school pause after preflight prevents recurring invoice creation", async () => {
  cadence = "weekly";
  startsPeriod = "2026-W41";
  centerFields = { tuitionBillingEnabled: true };
  pauseAfterPreflight = true;
  transactions = 0;
  invoices = 0;
  locks = [];
  const result = await run();
  assert.equal(result.body.dueChildren, 1);
  assert.equal(result.body.created, 0);
  assert.equal(result.body.failed, 1);
  assert.equal(transactions, 1);
  assert.equal(invoices, 0);
  assert.match(locks[0], /"Child".*FOR UPDATE/);
  assert.match(locks[1], /"BillingAccount".*FOR UPDATE/);
  assert.match(locks[2], /"Center".*FOR UPDATE/);
});
