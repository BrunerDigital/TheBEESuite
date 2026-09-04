import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

const currentUser = {
  id: "auditor-user",
  tenantId: "tenant-test",
  email: "auditor@example.test",
  name: "Read-only Auditor",
  role: "READ_ONLY_AUDITOR",
  centerIds: ["center-test", "center-second"],
};

let crossLinked = false;
let modelReads = 0;

const foreignProgram = { id: "program-foreign", centerId: "center-forbidden", name: "SECRET FOREIGN AGENCY", programName: "SECRET PROGRAM", requirements: [] };
const corruptAuthorization = {
  id: "authorization-corrupt",
  centerId: "center-test",
  agencyProgramId: foreignProgram.id,
  familyId: "family-foreign",
  childId: "child-foreign",
  authorizationNumber: "SECRET-AUTH",
  coverageStart: new Date("2026-09-01T00:00:00.000Z"),
  coverageEnd: new Date("2026-09-30T00:00:00.000Z"),
  status: "active",
  agencyProgram: foreignProgram,
  family: { id: "family-foreign", centerId: "center-forbidden", name: "SECRET FOREIGN FAMILY" },
  child: { id: "child-foreign", familyId: "family-foreign", fullName: "SECRET FOREIGN CHILD", enrollmentStatus: "enrolled", classroomId: "classroom-foreign" },
};
const corruptClaim = {
  id: "claim-corrupt",
  centerId: "center-test",
  agencyProgramId: foreignProgram.id,
  authorizationId: corruptAuthorization.id,
  number: "SECRET-CLAIM",
  status: "approved",
  claimedCents: 1000,
  approvedCents: 1000,
  paidCents: 0,
  servicePeriodStart: new Date("2026-09-01T00:00:00.000Z"),
  servicePeriodEnd: new Date("2026-09-07T00:00:00.000Z"),
  dueDate: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  agencyProgram: foreignProgram,
  authorization: corruptAuthorization,
  lines: [{ childId: "child-foreign" }],
  documents: [],
  remittances: [],
};

function rows(value) {
  modelReads += 1;
  return crossLinked ? value : [];
}

const prisma = {
  center: {
    async findMany({ where }) {
      modelReads += 1;
      return where.id.in.map((id) => ({ id, agencyReconciliationEnabled: false, agencyPrograms: [] }));
    },
  },
  agencyProgram: { async findMany() { return rows([]); } },
  subsidyAuthorization: { async findMany() { return rows([corruptAuthorization]); } },
  subsidyClaim: { async findMany() { return rows([corruptClaim]); } },
  family: { async findMany() { return rows([]); } },
  agencyLedgerAccount: {
    async findMany() {
      return rows([{ id: "account-corrupt", centerId: "center-test", agencyProgramId: foreignProgram.id, balanceCents: 1000, center: { name: "School" }, agencyProgram: foreignProgram }]);
    },
  },
  agencyLedgerEntry: {
    async findMany() {
      return rows([{
        id: "entry-corrupt",
        agencyLedgerAccountId: "account-corrupt",
        type: "claim_approved",
        description: "SECRET LEDGER ENTRY",
        amountCents: 1000,
        balanceAfterCents: 1000,
        effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        externalReference: "SECRET-REF",
        glCodeSnapshot: null,
        costCenterCodeSnapshot: null,
        agencyLedgerAccount: { id: "account-corrupt", centerId: "center-test", agencyProgramId: foreignProgram.id, balanceCents: 1000, agencyProgram: foreignProgram },
        claim: corruptClaim,
        remittance: null,
      }]);
    },
  },
  agencyRemittanceBatch: {
    async findMany() {
      return rows([{
        id: "batch-corrupt",
        centerId: "center-test",
        agencyProgramId: foreignProgram.id,
        agencyProgram: foreignProgram,
        center: { name: "School" },
        allocations: [{ id: "allocation-corrupt", claim: corruptClaim, amountCents: 1000, status: "posted" }],
        paidAt: new Date("2026-09-01T00:00:00.000Z"),
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        totalCents: 1000,
        allocatedCents: 1000,
        unappliedCents: 0,
        externalReference: "SECRET-DEPOSIT",
        paymentMethod: "ach",
        status: "reconciled",
        reversedAt: null,
      }]);
    },
    async groupBy() { modelReads += 1; return []; },
    async count() { modelReads += 1; return 0; },
  },
  agencyLedgerAdjustment: {
    async findMany() {
      return rows([{ id: "adjustment-corrupt", centerId: "center-test", agencyProgramId: foreignProgram.id, agencyProgram: foreignProgram, claim: corruptClaim, createdAt: new Date("2026-09-01T00:00:00.000Z") }]);
    },
    async groupBy() { modelReads += 1; return []; },
    async count() { modelReads += 1; return 0; },
  },
  agencyAccountingPeriod: { async findMany() { return rows([]); } },
  ledgerEntry: {
    async aggregate() {
      modelReads += 1;
      return { _sum: { amountCents: null }, _count: { _all: 0 } };
    },
  },
  async $queryRaw() { modelReads += 1; return []; },
};

mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() { return currentUser; },
    canManageBilling(user) { return user.role !== "READ_ONLY_AUDITOR"; },
    canAccessCenter(_user, centerId) { return currentUser.centerIds.includes(centerId); },
  },
});
mock.module("@/lib/audit", { namedExports: { async writeAuditLog() { throw new Error("Auditor reads and denied writes must never audit"); } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });

const { GET, POST } = await import("../../src/app/api/billing/agency-claims/route.ts");

function get(path = "") {
  return GET(new NextRequest(`https://app.test/api/billing/agency-claims${path}`));
}

function post(action, centerId = "center-test") {
  return POST(new NextRequest("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, centerId }),
  }));
}

test("auditor can read one authorized school and all authorized schools", async () => {
  crossLinked = false;
  for (const path of ["?centerId=center-test", ""]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.equal(body.capabilities.canManageAgencyBilling, false);
    assert.deepEqual(body.claims, []);
  }
});

test("auditor can download every authorized agency export", async () => {
  crossLinked = false;
  for (const flag of ["exportClaims", "exportLedger", "exportReconciliation", "exportDeposits"]) {
    const response = await get(`?centerId=center-test&${flag}=true`);
    assert.equal(response.status, 200, flag);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv/i, flag);
    await response.text();
  }
});

test("auditor wrong-school reads and exports fail before model access", async () => {
  for (const suffix of ["", "&exportClaims=true", "&exportLedger=true", "&exportReconciliation=true", "&exportDeposits=true"]) {
    const before = modelReads;
    const response = await get(`?centerId=center-forbidden${suffix}`);
    assert.equal(response.status, 403, suffix);
    assert.equal(modelReads, before, suffix);
  }
});

test("auditor cannot invoke any agency mutation", async () => {
  for (const action of ["createProgram", "updateProgram", "createAuthorization", "createClaim", "recordRemittance", "prepareRemittanceBatch", "approveRemittanceBatch", "requestLedgerAdjustment", "closeAccountingPeriod"]) {
    const before = modelReads;
    const response = await post(action);
    assert.equal(response.status, 403, action);
    assert.match((await response.json()).error, /billing access required/i, action);
    assert.equal(modelReads, before, action);
  }
});

test("corrupt cross-school relationship names are omitted from workspace and exports", async () => {
  crossLinked = true;
  const response = await get("?centerId=center-test");
  assert.equal(response.status, 200);
  const bodyText = JSON.stringify(await response.json());
  assert.doesNotMatch(bodyText, /SECRET FOREIGN|SECRET-CLAIM|SECRET LEDGER|SECRET-DEPOSIT/);

  for (const flag of ["exportClaims", "exportLedger", "exportReconciliation", "exportDeposits"]) {
    const exported = await get(`?centerId=center-test&${flag}=true`);
    assert.equal(exported.status, 200, flag);
    assert.doesNotMatch(await exported.text(), /SECRET FOREIGN|SECRET-CLAIM|SECRET LEDGER|SECRET-DEPOSIT/, flag);
  }
  crossLinked = false;
});
