import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let actor, lead, writes;
function reset() {
  actor = { id: "director", role: "CENTER_DIRECTOR", centerIds: ["school-a"] };
  lead = { id: "paper-lead", centerId: "school-a", familyName: "Paper Family", stage: "CONTACTED", status: "active", customFields: {}, _count: { enrollments: 0 } };
  writes = { updates: [], notes: [], tasks: [], audits: [] };
}
mock.module("@/lib/prisma", { namedExports: { prisma: {
  lead: {
    async findUnique() { return lead; },
    async update({ data }) { writes.updates.push(data); return { ...lead, ...data }; },
  },
  note: { async create({ data }) { writes.notes.push(data); } },
  task: { async findFirst() { return null; }, async create({ data }) { writes.tasks.push(data); } },
} } });
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { return actor; },
  canManageCrmLeads(user) { return user.role === "CENTER_DIRECTOR"; },
  canViewCrmLeads() { return true; },
  canAccessCenter(user, centerId) { return user.centerIds.includes(centerId); },
} });
mock.module("@/lib/audit", { namedExports: { async writeAuditLog(_user, input) { writes.audits.push(input); } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
const { PATCH } = await import("../../src/app/api/leads/[id]/route.ts");
function update(stage = "ENROLLED") {
  return PATCH(new NextRequest("https://example.test/api/leads/paper-lead", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
  }), { params: Promise.resolve({ id: lead.id }) });
}
test("director can enroll a paper-form lead without linked enrollment and retains audit and follow-up", async () => {
  reset();
  const response = await update();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.lead.stage, "ENROLLED");
  assert.equal(body.stageSemantics.approvedRecordExists, false);
  assert.deepEqual(writes.updates, [{ stage: "ENROLLED" }]);
  assert.match(writes.notes[0].body, /CONTACTED to ENROLLED/);
  assert.match(writes.tasks[0].title, /welcome and first-day/);
  assert.equal(writes.audits[0].metadata.after.stage, "ENROLLED");
});
test("paper enrollment preserves authentication, director permission, school isolation and stage validation", async () => {
  for (const [change, status] of [
    [() => { actor = null; }, 401],
    [() => { actor.role = "TEACHER"; }, 403],
    [() => { lead.centerId = "school-b"; }, 403],
  ]) {
    reset(); change(); assert.equal((await update()).status, status);
    assert.equal(writes.updates.length, 0); assert.equal(writes.audits.length, 0);
  }
  reset(); assert.equal((await update("invalid stage")).status, 400);
  assert.equal(writes.updates.length, 0);
});
