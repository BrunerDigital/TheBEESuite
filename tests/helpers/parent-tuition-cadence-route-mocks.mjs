import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

const parent = { id: "parent", tenantId: "tenant", email: "parent@example.test", role: "PARENT_GUARDIAN" };
const childFields = {
  tuitionBillingEnabled: true,
  tuitionPlanId: "weekly-plan",
  tuitionPlanAmountCents: 12000,
  tuitionBillingCadence: "weekly",
};
const schools = new Map([
  ["school-managed", { parentTuitionCadenceChangesDisabled: true }],
  ["school-self-service", {}],
]);
const families = new Map([
  ["family-managed", { childId: "child-managed", centerId: "school-managed" }],
  ["family-self-service", { childId: "child-self-service", centerId: "school-self-service" }],
]);
const writes = [];
const tx = {
  child: {
    async findFirst({ where }) {
      const family = families.get(where.familyId);
      return family?.childId === where.id
        ? { id: where.id, customFields: childFields, family: { centerId: family.centerId } }
        : null;
    },
    async update({ where, data }) {
      writes.push({ childId: where.id, fields: data.customFields });
    },
  },
  center: {
    async findFirst({ where }) {
      assert.deepEqual(where.organization, { tenantId: "tenant" });
      const customFields = schools.get(where.id);
      return customFields ? { customFields } : null;
    },
    async update({ where }) {
      writes.push({ centerId: where.id });
    },
  },
  invoice: {
    async findMany({ where }) {
      assert.deepEqual(where, { billingAccount: { familyId: "family-self-service" }, status: { not: "VOID" } });
      return [];
    },
  },
  auditLog: {
    async create({ data }) {
      writes.push({ action: data.action, centerId: data.centerId });
    },
  },
};

mock.module("@/lib/auth", { namedExports: {
  getCurrentUser: async () => parent,
  isParentGuardian: (user) => user.role === "PARENT_GUARDIAN",
  canAccessCenter: () => false,
} });
mock.module("@/lib/parent-portal-family-scope", { namedExports: {
  async getParentPortalFamilyScope(userId, tenantId, familyId) {
    assert.equal(userId, parent.id);
    assert.equal(tenantId, parent.tenantId);
    return { ok: families.has(familyId), familyId };
  },
} });
mock.module("@/lib/prisma", { namedExports: { prisma: {
  async $transaction(run, options) {
    assert.equal(options.isolationLevel, "Serializable");
    return run(tx);
  },
} } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });

const { POST } = await import("../../src/app/api/parent/tuition-cadence/route.ts");

function saveCycle(familyId, childId, billingCadence) {
  return POST(new NextRequest("https://example.test/api/parent/tuition-cadence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familyId, childId, billingCadence }),
  }));
}

test("a linked parent cannot save any cycle for the school-managed family", async () => {
  writes.length = 0;
  for (const cadence of ["weekly", "biweekly", "four_week"]) {
    const response = await saveCycle("family-managed", "child-managed", cadence);
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /school manages tuition billing cycles/i);
  }
  assert.deepEqual(writes, []);
});

test("the child must belong to the selected linked family", async () => {
  writes.length = 0;
  assert.equal((await saveCycle("family-self-service", "child-managed", "biweekly")).status, 404);
  assert.deepEqual(writes, []);
});

test("the same parent can still save a cycle for their other school", async () => {
  writes.length = 0;
  const response = await saveCycle("family-self-service", "child-self-service", "biweekly");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cadence, "biweekly");
  assert.equal(writes[0].childId, "child-self-service");
  assert.equal(writes[0].fields.tuitionBillingCadence, "biweekly");
  assert.equal(writes[0].fields.tuitionPlanAmountCents, childFields.tuitionPlanAmountCents);
  assert.deepEqual(writes[1], { action: "billing.tuition_cadence.parent_selected", centerId: "school-self-service" });
});
