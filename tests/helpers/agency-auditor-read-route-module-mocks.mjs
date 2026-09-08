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
  workspace: { mode: "all", activeCenterId: null },
};

let crossLinked = false;
let duplicateSchoolExports = false;
let modelReads = 0;
let activeReadSnapshots = 0;
let repeatableReadTransactions = 0;
let rolledBackReadSnapshots = 0;

function snapshotRead() {
  assert.ok(activeReadSnapshots > 0, "every agency dashboard/export model read must use the active snapshot transaction client");
  modelReads += 1;
}

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
  center: { id: "center-test", name: "School" },
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

function exportFixture(centerId, suffix) {
  const center = { id: centerId, name: "Duplicate School Name" };
  const agencyProgram = { id: `program-${suffix}`, centerId, name: "State Agency", programName: "Child Care", requirements: [] };
  const claim = {
    id: `claim-${suffix}`,
    centerId,
    center,
    agencyProgramId: agencyProgram.id,
    authorizationId: null,
    number: `CLAIM-${suffix.toUpperCase()}`,
    status: "draft",
    claimedCents: 1000,
    approvedCents: null,
    paidCents: 0,
    servicePeriodStart: new Date("2026-09-01T00:00:00.000Z"),
    servicePeriodEnd: new Date("2026-09-07T00:00:00.000Z"),
    dueDate: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    agencyProgram,
    authorization: null,
    lines: [],
    documents: [],
    remittances: [],
  };
  const account = { id: `account-${suffix}`, centerId, agencyProgramId: agencyProgram.id, balanceCents: 1000, center, agencyProgram };
  const entry = {
    id: `entry-${suffix}`,
    agencyLedgerAccountId: account.id,
    type: "claim_approved",
    description: "Approved claim",
    amountCents: 1000,
    balanceAfterCents: 1000,
    effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    externalReference: claim.number,
    glCodeSnapshot: "1100",
    costCenterCodeSnapshot: suffix,
    agencyLedgerAccount: account,
    claim,
    remittance: null,
  };
  const batch = {
    id: `batch-${suffix}`,
    centerId,
    agencyProgramId: agencyProgram.id,
    agencyProgram,
    center,
    allocations: [],
    paidAt: new Date("2026-09-02T00:00:00.000Z"),
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    totalCents: 1000,
    allocatedCents: 0,
    unappliedCents: 1000,
    externalReference: `DEPOSIT-${suffix.toUpperCase()}`,
    paymentMethod: "ach",
    cashGlCodeSnapshot: "1000",
    costCenterCodeSnapshot: suffix,
    status: "unmatched",
    reversedAt: null,
    evidenceName: null,
    evidenceReference: null,
    followUpOwnerId: null,
    followUpDueAt: null,
  };
  return { claim, account, entry, batch };
}

const exportFixtures = [exportFixture("center-test", "first"), exportFixture("center-second", "second")];

function rows(value) {
  snapshotRead();
  return crossLinked ? value : [];
}

const prisma = {
  center: {
    async findMany({ where }) {
      snapshotRead();
      return where.id.in.map((id) => ({ id, agencyReconciliationEnabled: false, agencyPrograms: [] }));
    },
  },
  agencyProgram: { async findMany() { return rows([]); } },
  subsidyAuthorization: { async findMany() { return rows([corruptAuthorization]); } },
  subsidyClaim: { async findMany() { snapshotRead(); return duplicateSchoolExports ? exportFixtures.map((fixture) => fixture.claim) : crossLinked ? [corruptClaim] : []; } },
  family: { async findMany() { return rows([]); } },
  agencyLedgerAccount: {
    async findMany() {
      snapshotRead();
      return duplicateSchoolExports
        ? exportFixtures.map((fixture) => fixture.account)
        : crossLinked ? [{ id: "account-corrupt", centerId: "center-test", agencyProgramId: foreignProgram.id, balanceCents: 1000, center: { id: "center-test", name: "School" }, agencyProgram: foreignProgram }] : [];
    },
  },
  agencyLedgerEntry: {
    async findMany() {
      snapshotRead();
      if (duplicateSchoolExports) return exportFixtures.map((fixture) => fixture.entry);
      return crossLinked ? [{
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
        agencyLedgerAccount: { id: "account-corrupt", centerId: "center-test", agencyProgramId: foreignProgram.id, balanceCents: 1000, center: { id: "center-test", name: "School" }, agencyProgram: foreignProgram },
        claim: corruptClaim,
        remittance: null,
      }] : [];
    },
  },
  agencyRemittanceAllocation: {
    async findMany({ where }) {
      snapshotRead();
      if (duplicateSchoolExports) {
        const batch = exportFixtures.find((fixture) => fixture.batch.id === where.batchId)?.batch;
        return batch?.allocations ?? [];
      }
      if (crossLinked && where.batchId === "batch-corrupt") {
        return [{ id: "allocation-corrupt", claim: corruptClaim, amountCents: 1000, status: "posted" }];
      }
      return [];
    },
  },
  agencyRemittanceBatch: {
    async findMany() {
      snapshotRead();
      if (duplicateSchoolExports) return exportFixtures.map((fixture) => fixture.batch);
      return crossLinked ? [{
        id: "batch-corrupt",
        centerId: "center-test",
        agencyProgramId: foreignProgram.id,
        agencyProgram: foreignProgram,
        center: { id: "center-test", name: "School" },
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
      }] : [];
    },
    async groupBy() { snapshotRead(); return []; },
    async count() { snapshotRead(); return 0; },
  },
  agencyLedgerAdjustment: {
    async findMany() {
      return rows([{ id: "adjustment-corrupt", centerId: "center-test", agencyProgramId: foreignProgram.id, agencyProgram: foreignProgram, claim: corruptClaim, createdAt: new Date("2026-09-01T00:00:00.000Z") }]);
    },
    async groupBy() { snapshotRead(); return []; },
    async count() { snapshotRead(); return 0; },
  },
  agencyAccountingPeriod: { async findMany() { return rows([]); } },
  ledgerEntry: {
    async aggregate() {
      snapshotRead();
      return { _sum: { amountCents: null }, _count: { _all: 0 } };
    },
  },
  async $queryRaw() {
    snapshotRead();
    if (!duplicateSchoolExports) return [];
    return exportFixtures.map((fixture) => ({
      agencyLedgerAccountId: fixture.account.id,
      mappingCategory: "receivable",
      glCodeSnapshot: fixture.entry.glCodeSnapshot,
      costCenterCodeSnapshot: fixture.entry.costCenterCodeSnapshot,
      snapshotStatus: "COMPLETE",
      approvedCents: 0n,
      remittedCents: 0n,
      unappliedCents: 0n,
      adjustmentCents: 0n,
      ledgerBalanceCents: BigInt(fixture.entry.amountCents),
      openBatchExceptionCount: 0n,
      missingImmutableEventCount: 0n,
      unsupportedLedgerEntryCount: 0n,
    }));
  },
  async $transaction(callback, options) {
    assert.equal(options?.isolationLevel, "RepeatableRead");
    repeatableReadTransactions += 1;
    activeReadSnapshots += 1;
    try {
      return await callback(prisma);
    } catch (error) {
      rolledBackReadSnapshots += 1;
      throw error;
    } finally {
      activeReadSnapshots -= 1;
    }
  },
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
    const snapshotsBefore = repeatableReadTransactions;
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.equal(body.capabilities.canManageAgencyBilling, false);
    assert.deepEqual(body.claims, []);
    assert.equal(repeatableReadTransactions, snapshotsBefore + 1, `${path || "all schools"} must use one repeatable-read snapshot`);
  }
});

test("an all-location workspace can read one authorized school without exposing mutation controls", async () => {
  crossLinked = false;
  currentUser.role = "PLATFORM_OWNER";
  currentUser.workspace = { mode: "all", activeCenterId: null };

  const response = await get("?centerId=center-second");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.capabilities.canManageAgencyBilling, false);
  assert.equal(body.capabilities.canReviewAgencyPosting, false);
  assert.equal(body.capabilities.canCloseAccountingPeriod, false);
  assert.equal(body.capabilities.requiresExactWorkspaceSelection, true);

  currentUser.role = "READ_ONLY_AUDITOR";
  currentUser.workspace = { mode: "all", activeCenterId: null };
});

test("CSV export fully materializes and releases its snapshot before body consumption", async () => {
  crossLinked = false;
  const readsBefore = modelReads;
  const rollbacksBefore = rolledBackReadSnapshots;
  const response = await get("?centerId=center-test&exportClaims=true");
  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.ok(modelReads > readsBefore, "all database reads must finish before the response is returned");
  const readsAfterMaterialization = modelReads;
  assert.equal(activeReadSnapshots, 0, "the Repeatable Read snapshot must be committed before body consumption");
  assert.equal(rolledBackReadSnapshots, rollbacksBefore);
  await response.body.cancel("test consumer disconnected");
  assert.equal(modelReads, readsAfterMaterialization, "cancelling the materialized response must not trigger more database reads");
  assert.equal(activeReadSnapshots, 0);
  assert.equal(rolledBackReadSnapshots, rollbacksBefore);
});

test("auditor can download every authorized agency export", async () => {
  crossLinked = false;
  for (const flag of ["exportClaims", "exportLedger", "exportReconciliation", "exportDeposits"]) {
    const snapshotsBefore = repeatableReadTransactions;
    const response = await get(`?centerId=center-test&${flag}=true`);
    assert.equal(response.status, 200, flag);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv/i, flag);
    await response.text();
    assert.equal(repeatableReadTransactions, snapshotsBefore + 1, `${flag} must use one repeatable-read snapshot`);
  }
});

test("all-school exports retain immutable school IDs when school names are duplicated", async () => {
  duplicateSchoolExports = true;
  for (const flag of ["exportClaims", "exportLedger", "exportReconciliation", "exportDeposits"]) {
    const response = await get(`?${flag}=true`);
    assert.equal(response.status, 200, flag);
    const csv = await response.text();
    assert.match(csv, /^"School ID","School",/, flag);
    assert.match(csv, /"center-test","Duplicate School Name"/, flag);
    assert.match(csv, /"center-second","Duplicate School Name"/, flag);
  }
  duplicateSchoolExports = false;
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
