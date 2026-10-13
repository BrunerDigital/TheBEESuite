import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
let actor, fields, writes, audits, tenantMatches;
function reset() {
  actor = { id: "director", email: "director@example.test", tenantId: "tenant", role: "CENTER_DIRECTOR", centerIds: ["school"] };
  fields = { tuitionPlanId: "rate", tuitionNetAmountCents: 20250, tuitionBillingCadence: "biweekly", tuitionBillingStartsPeriod: "2026-W40", tuitionBillingInvoiceDelayWeeks: 0, kept: "history" };
  writes = 0; audits = []; tenantMatches = true;
}
reset();
const db = {
  child: {
    async findUnique() { return { id: "child", familyId: "family", fullName: "Example Child", classroomId: "classroom", enrollmentStatus: "enrolled", customFields: structuredClone(fields), family: { centerId: "school", name: "Family" } }; },
    async update({ data }) { writes++; fields = data.customFields; return { id: "child", customFields: fields }; },
  },
  tuitionPlan: { async findUnique() { return { id: "rate", centerId: "school", name: "Weekly rate", cadence: "biweekly", amountCents: 20250 }; } },
  center: { async findFirst() { return tenantMatches ? { customFields: {} } : null; } },
  invoice: { async findMany() { return [{ customFields: { chargeSource: "tuitionPlan", childId: "child", billingPeriod: "2026-W42" } }]; } },
  billingAccount: { async findUnique() { return { customFields: { kept: "account" } }; }, async upsert({ update }) { assert.equal(update.customFields.kept, "account"); return {}; } },
  async $transaction(run) { return run(db); },
};
mock.module("@/lib/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/auth", { namedExports: { getCurrentUser: async () => actor, canManageBilling: u => u.role === "CENTER_DIRECTOR", canAccessCenter: (u, id) => u.centerIds.includes(id) } });
mock.module("@/lib/audit", { namedExports: { writeAuditLog: async (_u, audit) => audits.push(audit) } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_m, h) => h } });
const route = await import("../../src/app/api/billing/tuition-assignments/route.ts");
const { POST } = route.default ?? route;
const request = (patch = {}) => new NextRequest("https://example.test/api/billing/tuition-assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ familyId: "family", childId: "child", tuitionPlanId: "rate", billingCadence: "biweekly", billingStartPeriod: "2026-W40", ...patch }) });

test("a director can delay invoices without editing existing invoices, payments or coverage", async () => {
  reset(); assert.equal((await POST(request({ invoiceDelayWeeks: 1, timingChangeReason: "One week paid ahead" }))).status, 200);
  assert.equal(fields.tuitionBillingInvoiceDelayWeeks, 1); assert.equal(fields.tuitionBillingStartsPeriod, "2026-W40"); assert.equal(fields.kept, "history");
  assert.equal(fields.tuitionAssignmentHistory.at(-1).tuitionBillingInvoiceDelayWeeks, 0);
  assert.equal(audits[0].metadata.invoiceDelayWeeks, 1); assert.equal(audits[0].metadata.timingChangeReason, "One week paid ahead"); assert.equal(audits[0].metadata.existingInvoicesUnchanged, true);
  assert.equal((await POST(request({ invoiceDelayWeeks: 0, timingChangeReason: "Return to standard schedule" }))).status, 200); assert.equal(fields.tuitionBillingInvoiceDelayWeeks, 0);
});
test("an older client cannot silently remove the saved one-week delay", async () => { reset(); fields.tuitionBillingInvoiceDelayWeeks = 1; assert.equal((await POST(request())).status, 200); assert.equal(fields.tuitionBillingInvoiceDelayWeeks, 1); });
test("invalid timing and shifted coverage fail before any write", async () => {
  for (const [patch, status] of [[{ invoiceDelayWeeks: 2 }, 400], [{ invoiceDelayWeeks: 1 }, 400], [{ invoiceDelayWeeks: 1, timingChangeReason: "Paid ahead", billingStartPeriod: "2026-W41" }, 409], [{ invoiceDelayWeeks: 1, billingCadence: "weekly", timingChangeReason: "Paid ahead" }, 400]]) { reset(); assert.equal((await POST(request(patch))).status, status); assert.equal(writes, 0); }
});
test("unauthenticated, parent, foreign school, family mismatch and foreign tenant cannot save timing", async () => {
  for (const mode of ["none", "parent", "school", "family", "tenant"]) { reset(); if (mode === "none") actor = null; if (mode === "parent") actor.role = "PARENT_GUARDIAN"; if (mode === "school") actor.centerIds = []; if (mode === "tenant") tenantMatches = false;
    const response = await POST(request({ invoiceDelayWeeks: 1, timingChangeReason: "Paid ahead", ...(mode === "family" ? { familyId: "other-family" } : {}) })); assert.notEqual(response.status, 200); assert.equal(writes, 0); assert.equal(audits.length, 0);
  }
});
