import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";

const user = { id: "director", role: "CENTER_DIRECTOR", centerIds: ["school"], workspace: { mode: "fixed", activeCenterId: "school" } };
const program = { id: "elc", centerId: "school", name: "ELC", stateCode: "FL", status: "active", updatedAt: new Date("2026-01-01"), requirements: [{ key: "attendance", label: "Attendance", type: "attendance", required: true }] };
function authorization(index, changes = {}) {
  return { id: `auth-${index}`, centerId: "school", agencyProgramId: "elc", childId: `child-${index}`, familyId: `family-${index}`,
    authorizationNumber: `ELC-${index}`, status: "active", updatedAt: new Date("2026-01-01"), coverageStart: new Date("2026-01-01"), coverageEnd: new Date("2027-12-31"),
    authorizedRateCents: 18000 + index, authorizedUnits: 100, unitType: "weekly", requiredDocuments: [], center: { timezone: "America/New_York" },
    family: { id: `family-${index}`, centerId: "school" }, child: { id: `child-${index}`, familyId: `family-${index}`, fullName: `Child ${index}`, enrollmentStatus: "enrolled", classroomId: "classroom" },
    agencyProgram: program, claims: [], ...changes };
}
let records = [];
let created = [];
let audits = [];
let conflictId = "";
let auditFailure = false;
let options = [];
function overlaps(where, claim) { return claim.servicePeriodStart <= where.servicePeriodStart.lte && claim.servicePeriodEnd >= where.servicePeriodEnd.gte; }
const database = {
  agencyProgram: { async findFirst({ where }) { return where.id === program.id && where.centerId === program.centerId ? program : null; } },
  subsidyAuthorization: {
    async findMany({ where, take }) { return records.filter((record) => record.centerId === where.centerId && record.agencyProgramId === where.agencyProgramId && record.status === where.status).slice(0, take); },
    async findUnique({ where }) {
      const record = records.find((item) => item.id === where.id);
      return record ? { ...record, claims: created.filter((claim) => claim.authorizationId === record.id).map((claim) => ({ ...claim, lines: claim.lines.create })) } : null;
    },
  },
  subsidyClaim: {
    async findMany({ where }) { return created.filter((claim) => overlaps(where, claim)).map((claim) => ({ ...claim, lines: claim.lines.create })); },
    async findFirst({ where }) { return created.find((claim) => overlaps(where, claim) && claim.lines.create.some((line) => line.childId === where.lines.some.childId)) ?? null; },
    async create({ data }) {
      if (data.authorizationId === conflictId) throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6.19.3" });
      const claim = { ...data, id: `claim-${created.length}` }; created.push(claim); return claim;
    },
  },
};
const prisma = { ...database, async $transaction(callback, transactionOptions) {
  options.push(transactionOptions); const before = created.length; const auditBefore = audits.length;
  try { return await callback(database); } catch (error) { created.length = before; audits.length = auditBefore; throw error; }
} };
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user; }, canManageBilling() { return user.role === "CENTER_DIRECTOR"; }, canAccessCenter(_user, id) { return user.centerIds.includes(id); } } });
mock.module("@/lib/audit", { namedExports: { async writeAuditLog(_user, input, client) { if (auditFailure) throw new Error("audit unavailable"); audits.push({ input, client }); } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });
const { POST } = await import("../../src/app/api/billing/agency-claims/route.ts");
const defaults = { centerId: "school", agencyProgramId: "elc", servicePeriodStart: "2026-10-05", servicePeriodEnd: "2026-10-09", serviceUnits: 1, dueDate: "" };
async function post(action, fields = {}) { const response = await POST(new Request("https://test/api/billing/agency-claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...defaults, action, ...fields }) })); return { response, body: await response.json() }; }
function reset(count = 80) { records = Array.from({ length: count }, (_, index) => authorization(index)); created = []; audits = []; options = []; conflictId = ""; auditFailure = false; user.role = "CENTER_DIRECTOR"; user.workspace = { mode: "fixed", activeCenterId: "school" }; }

test("bulk preview for 80 children is read only and uses individual rates; creates drafts in bounded chunks with atomic audits", async () => {
  reset();
  const preview = await post("previewBulkClaims");
  assert.equal(preview.response.status, 200); assert.equal(preview.body.rows.length, 80); assert.equal(created.length, 0); assert.equal(audits.length, 0);
  assert.equal(preview.body.rows[79].claimedCents, 18079);
  for (let offset = 0; offset < 80; offset += 20) {
    const result = await post("createBulkClaims", { entries: preview.body.rows.slice(offset, offset + 20) });
    assert.equal(result.body.results.filter((row) => row.status === "created").length, 20);
  }
  assert.equal(created.length, 80); assert.equal(audits.length, 80);
  for (const claim of created) { assert.equal(claim.status, "draft"); assert.equal(claim.documents.create[0].name, "Attendance"); assert.equal(claim.lines.create[0].attendanceDays, null); }
  assert.ok(audits.every((audit) => audit.client === database));
  assert.ok(options.slice(1).every((option) => option.isolationLevel === "Serializable"));
  const retry = await post("createBulkClaims", { entries: preview.body.rows.slice(0, 20) });
  assert.ok(retry.body.results.every((row) => row.status === "exception")); assert.equal(created.length, 80);
});
test("bulk writes reject changed authorization rates and requirements and preserve successful rows around a conflict", async () => {
  reset(4); const preview = (await post("previewBulkClaims")).body;
  records[0].authorizedRateCents += 100;
  records[1].requiredDocuments = [{ key: "extra", label: "Extra", required: true }];
  conflictId = "auth-2";
  const result = await post("createBulkClaims", { entries: preview.rows });
  assert.deepEqual(result.body.results.map((row) => row.status), ["exception", "exception", "exception", "created"]);
  assert.equal(created.length, 1); assert.equal(audits.length, 1);
});
test("bulk row exceptions cover withdrawn children, expired coverage, units and corrupt school relationships", async () => {
  reset(5);
  records[0].child.enrollmentStatus = "withdrawn";
  records[1].coverageEnd = new Date("2026-09-01");
  records[2].authorizedUnits = 0;
  records[3].family.centerId = "other-school";
  records[4].agencyProgram = { ...program, centerId: "other-school" };
  const preview = await post("previewBulkClaims");
  assert.ok(preview.body.rows.every((row) => row.error && !row.fingerprint)); assert.equal(created.length, 0);
});
test("bulk endpoints fail closed for all schools, wrong school, wrong agency and nonbilling roles", async () => {
  reset(1);
  for (const fields of [{ centerId: "all" }, { centerId: "other-school" }, { agencyProgramId: "other-agency" }]) {
    for (const action of ["previewBulkClaims", "createBulkClaims"]) assert.ok((await post(action, fields)).response.status >= 400);
  }
  user.workspace = { mode: "all", activeCenterId: null };
  assert.equal((await post("previewBulkClaims")).response.status, 409);
  user.role = "PARENT_GUARDIAN";
  assert.equal((await post("createBulkClaims")).response.status, 403); assert.equal(created.length, 0);
});
test("duplicate authorizations, oversized writes, malformed dates, missing previews and ambiguous child authorizations are rejected", async () => {
  reset(2);
  assert.equal((await post("createBulkClaims", { entries: Array.from({ length: 21 }, (_, index) => ({ authorizationId: `auth-${index}`, fingerprint: "x" })) })).response.status, 400);
  assert.equal((await post("createBulkClaims", { entries: [{ authorizationId: "auth-0", fingerprint: "x" }, { authorizationId: "auth-0", fingerprint: "x" }] })).response.status, 400);
  assert.equal((await post("createBulkClaims", { entries: [{ authorizationId: "auth-0" }] })).response.status, 400);
  assert.equal((await post("previewBulkClaims", { servicePeriodStart: "2026-02-30" })).response.status, 400);
  records[1] = { ...records[1], childId: records[0].childId, familyId: records[0].familyId, child: records[0].child, family: records[0].family };
  assert.ok((await post("previewBulkClaims")).body.rows.every((row) => /Multiple eligible/.test(row.error)));
  assert.equal(created.length, 0);
});
test("bulk draft rolls back when its audit fails", async () => {
  reset(1); const preview = (await post("previewBulkClaims")).body; auditFailure = true;
  await assert.rejects(() => post("createBulkClaims", { entries: preview.rows }), /audit unavailable/);
  assert.equal(created.length, 0); assert.equal(audits.length, 0);
});
test("a partial overlap under another authorization blocks preview and a previously reviewed write", async () => {
  reset(1); const preview = (await post("previewBulkClaims")).body;
  created.push({ authorizationId: "old-authorization", number: "PRIOR-ELC", servicePeriodStart: new Date("2026-10-01"), servicePeriodEnd: new Date("2026-10-06"), lines: { create: [{ childId: records[0].childId, serviceUnits: 1 }] } });
  const refreshed = await post("previewBulkClaims");
  assert.match(refreshed.body.rows[0].error, /PRIOR-ELC/); assert.equal(refreshed.body.rows[0].fingerprint, "");
  const result = await post("createBulkClaims", { entries: preview.rows });
  assert.equal(result.body.results[0].status, "exception"); assert.match(result.body.results[0].error, /PRIOR-ELC/);
  assert.equal(created.length, 1); assert.equal(audits.length, 0);
});
