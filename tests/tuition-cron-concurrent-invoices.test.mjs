import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

process.env.CRON_SECRET = "test-cron-secret";

const fields = {
  tuitionBillingEnabled: true,
  tuitionPlanId: "plan-1",
  tuitionPlanAmountCents: 10000,
  tuitionBillingCadence: "weekly",
  tuitionBillingStartsPeriod: "2026-W41",
};
const children = [1, 2].map((number) => ({
  id: `child-${number}`, familyId: `family-${number}`, fullName: `Test Child ${number}`,
  customFields: fields, family: { centerId: "center-1" },
}));
let centerHeld = false;
let activeCenterUpdates = 0;
let maxCenterUpdates = 0;
let invoiceCreates = 0;
let waiting = [];

async function lockCenter() {
  if (centerHeld) await new Promise((resolve) => waiting.push(resolve));
  centerHeld = true;
  return () => {
    centerHeld = false;
    waiting.shift()?.();
  };
}

function transactionClient() {
  let releaseCenter = null;
  let hasCenterWriteLock = false;
  const tx = {
    async $queryRaw(query) {
      const sql = query.strings.join("?");
      if (/"Center".*FOR UPDATE/.test(sql)) {
        releaseCenter = await lockCenter();
        hasCenterWriteLock = true;
      }
      return [{ id: "locked" }];
    },
    child: { async findFirst() { return { customFields: fields }; } },
    billingAccount: {
      async upsert({ where, include }) {
        return {
          id: `account-${where.familyId}`,
          familyId: where.familyId,
          balanceCents: 0,
          ...(include ? { family: { centerId: "center-1" } } : {}),
        };
      },
      async update() { return { balanceCents: 10000 }; },
    },
    invoice: {
      async findMany() { return []; },
      async findFirst() { return null; },
      async create({ data }) {
        invoiceCreates++;
        return { id: `invoice-${invoiceCreates}`, number: `INV-${invoiceCreates}`, totalCents: data.totalCents };
      },
    },
    ledgerEntry: { async create() { return { id: "ledger" }; } },
    center: {
      async findUnique() { return { status: "active", customFields: { tuitionBillingEnabled: true } }; },
      async update() {
        assert.equal(hasCenterWriteLock, true, "invoice helper must update Center under its exclusive lock");
        activeCenterUpdates++;
        maxCenterUpdates = Math.max(maxCenterUpdates, activeCenterUpdates);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeCenterUpdates--;
        return { id: "center-1" };
      },
    },
  };
  return { tx, release() { releaseCenter?.(); } };
}

mock.module("@/lib/prisma", { namedExports: { prisma: {
  center: { async findMany() { return [{ id: "center-1", customFields: { tuitionBillingEnabled: true } }]; } },
  child: { async findMany() { return children; } },
  tuitionPlan: { async findMany() { return [{ id: "plan-1", centerId: "center-1", name: "Tuition", amountCents: 10000, cadence: "weekly" }]; } },
  async $transaction(run) {
    const client = transactionClient();
    try { return await run(client.tx); }
    finally { client.release(); }
  },
} } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });

const { GET } = await import("../src/app/api/cron/tuition-billing/route.ts");

test("two same-school invoices use the real invoice helper without a school lock upgrade", async () => {
  const response = await GET(new NextRequest("https://app.test/api/cron/tuition-billing?asOf=2026-10-08", {
    headers: { authorization: "Bearer test-cron-secret" },
  }));
  const body = await response.json();
  assert.equal(body.failed, 0);
  assert.equal(body.created, 2);
  assert.equal(invoiceCreates, 2);
  assert.equal(maxCenterUpdates, 1);
  assert.equal(centerHeld, false);
  assert.equal(waiting.length, 0);
});
