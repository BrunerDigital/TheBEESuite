import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";

const clone = value => structuredClone(value);
const center = (id, tenantId) => ({ id, name: id, customFields: {
  stripeConnectAccountId: "acct_school_a", unrelatedSetting: "preserve",
}, organization: { tenantId } });
let rows, matchedTenantId, changeDuringRetrieve, conflictOnce, writes, audits, reads, lookups;
beforeEach(() => {
  rows = [center("school_a", "tenant_a"), center("other_tenant_school", "tenant_b")];
  matchedTenantId = "tenant_a"; changeDuringRetrieve = null; conflictOnce = false;
  writes = []; audits = []; reads = []; lookups = [];
});
const centerStore = {
  findMany: async input => {
    reads.push(input);
    // Return the extra row even for a scoped query to exercise the explicit tenant guard too.
    return clone(rows);
  },
  findUnique: async input => clone(rows.find(row => row.id === input.where.id)),
  update: async () => { throw Error("Unconditional center writes are forbidden"); },
  updateMany: async input => {
    const row = rows.find(item => item.id === input.where.id);
    if (conflictOnce) {
      conflictOnce = false; row.customFields.concurrentSetting = "new";
      return { count: 0 };
    }
    if (!row || JSON.stringify(input.where.customFields.equals) !== JSON.stringify(row.customFields)) return { count: 0 };
    row.customFields = clone(input.data.customFields); writes.push(clone(input)); return { count: 1 };
  },
};
const receiptStore = {
  create: async () => ({}), update: async () => ({}), updateMany: async () => ({ count: 1 }),
};
const database = {
  center: centerStore, stripeWebhookEvent: receiptStore,
  auditLog: { create: async input => { audits.push(clone(input)); return {}; } },
};
database.$transaction = async callback => callback(database);
mock.module("@/lib/prisma", { namedExports: { prisma: database } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });
mock.module("@/lib/stripe-webhook-readiness", { namedExports: {
  matchStripeWebhookSecret: async () => ({ configured: true, matched: true, tenantId: matchedTenantId }),
} });
const integrations = await import("../../src/lib/integrations.ts");
mock.module("@/lib/integrations", { namedExports: {
  ...integrations,
  retrieveStripeConnectedAccount: async (id, input) => {
    lookups.push({ id, ...input });
    if (changeDuringRetrieve) Object.assign(rows[0].customFields, changeDuringRetrieve);
    return { ok: true, configured: true, account: {
      id, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
      requirementFields: [], currentlyDueRequirementFields: [], pendingVerificationFields: [],
    } };
  },
} });
const { POST } = await import("../../src/app/api/billing/stripe-webhook/route.ts");
const request = () => new NextRequest("https://thebeesuite.io/api/billing/stripe-webhook", {
  method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "synthetic" },
  body: JSON.stringify({ id: "evt_synthetic_account_update", type: "account.updated", data: { object: { id: "acct_school_a" } } }),
});

test("a tenant-authenticated account webhook cannot update a different tenant with the same cached mapping", async () => {
  const response = await POST(request()); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.updatedCenters, 1);
  assert.deepEqual(reads[0].where, { organization: { tenantId: "tenant_a" } });
  assert.deepEqual(writes.map(input => input.where.id), ["school_a"]);
  assert.equal(rows[1].customFields.stripePayoutsEnabled, undefined);
  assert.equal(audits[0].data.tenantId, "tenant_a");
});

test("a cutover completed during provider retrieval survives the old account webhook", async () => {
  changeDuringRetrieve = { stripeConnectAccountId: "acct_replacement", cutoverNote: "keep" };
  const response = await POST(request()); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.updatedCenters, 0);
  assert.equal(rows[0].customFields.stripeConnectAccountId, "acct_replacement");
  assert.equal(rows[0].customFields.cutoverNote, "keep"); assert.equal(writes.length, 0); assert.equal(audits.length, 0);
});

test("fresh unrelated settings are retained when Stripe status synchronizes", async () => {
  changeDuringRetrieve = { concurrentSetting: "new" };
  const response = await POST(request()); const payload = await response.json();
  assert.equal(payload.updatedCenters, 1); assert.equal(rows[0].customFields.concurrentSetting, "new");
  assert.equal(rows[0].customFields.unrelatedSetting, "preserve"); assert.equal(rows[0].customFields.stripePayoutsEnabled, true);
});

test("a concurrent settings conflict retries with a fresh read instead of overwriting", async () => {
  conflictOnce = true;
  const response = await POST(request()); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.updatedCenters, 1);
  assert.equal(rows[0].customFields.concurrentSetting, "new"); assert.equal(writes.length, 1); assert.equal(audits.length, 1);
});
