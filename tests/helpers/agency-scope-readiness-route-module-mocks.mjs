import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { mock, test } from "node:test";

const currentUser = {
  id: "reviewer-b",
  tenantId: "tenant-test",
  email: "reviewer@example.test",
  name: "Reviewer B",
  role: "BILLING_ADMIN",
  centerIds: ["center-test", "center-other"],
  workspace: { mode: "fixed", activeCenterId: "center-test" },
};

const completeProgram = {
  id: "program-test",
  centerId: "center-test",
  name: "Test Agency",
  programName: "Test Program",
  stateCode: "IN",
  status: "active",
  providerNumber: "provider-test",
  vendorNumber: null,
  submissionMethod: "agency_portal",
  portalUrl: "https://agency.example.test",
  paymentInstructions: "Verified",
  receivableGlCode: "1200",
  cashGlCode: "1010",
  adjustmentGlCode: "6900",
  costCenterCode: "school-test",
  requirements: [],
};

function authorization(overrides = {}) {
  const familyId = overrides.familyId ?? "family-test";
  const { agencyProgram: agencyProgramOverrides, family: familyOverrides, child: childOverrides, ...rootOverrides } = overrides;
  return {
    id: "authorization-test",
    centerId: "center-test",
    agencyProgramId: completeProgram.id,
    familyId,
    childId: "child-test",
    authorizationNumber: "AUTH-TEST",
    coverageStart: new Date("2026-09-01T00:00:00.000Z"),
    coverageEnd: new Date("2026-09-30T00:00:00.000Z"),
    authorizedRateCents: 10_000,
    familyCopayCents: 0,
    unitType: "weekly",
    authorizedUnits: null,
    requiredDocuments: [],
    status: "active",
    agencyProgram: { ...completeProgram, ...(agencyProgramOverrides ?? {}) },
    family: { id: familyId, centerId: "center-test", ...(familyOverrides ?? {}) },
    child: { id: "child-test", familyId, fullName: "Test Child", enrollmentStatus: "enrolled", classroomId: "classroom-test", ...(childOverrides ?? {}) },
    ...rootOverrides,
  };
}

let authorizationRecord = authorization();
let accountingMappingsComplete = true;
let claimCreates = 0;
let auditCalls = [];
let reverseBatchMode = "self-pending";
let missingProgramCenter = false;
let transactionErrorCode = null;
let transactionOptions = [];

const database = {
  center: {
    async findUnique() {
      if (missingProgramCenter) return null;
      const program = accountingMappingsComplete ? completeProgram : { ...completeProgram, cashGlCode: null };
      return { agencyReconciliationEnabled: true, agencyPrograms: [program] };
    },
  },
  agencyProgram: {
    async findFirst() { return accountingMappingsComplete ? completeProgram : { ...completeProgram, cashGlCode: null }; },
    async findUnique() { return completeProgram; },
    async create() { throw new Error("A missing-school program create must not write"); },
    async update() { throw new Error("A missing-school program update must not write"); },
  },
  subsidyAuthorization: {
    async findUnique() { return authorizationRecord; },
  },
  subsidyClaim: {
    async findFirst() { return null; },
    async create({ data }) {
      claimCreates += 1;
      return {
        id: `claim-${claimCreates}`,
        ...data,
        status: "draft",
        agencyProgram: { id: completeProgram.id, name: completeProgram.name },
        authorization: { child: { fullName: authorizationRecord.child.fullName }, family: { name: "Test Family" } },
        lines: [{ childId: authorizationRecord.childId }],
        documents: [],
        remittances: [],
      };
    },
  },
  subsidyClaimLine: {
    async aggregate() { return { _sum: { serviceUnits: 0 } }; },
  },
  agencyRemittanceBatch: {
    async findUnique({ where }) {
      if (where.idempotencyKey) return null;
      if (!where.id) return null;
      return {
        id: where.id,
        centerId: "center-test",
        agencyProgramId: completeProgram.id,
        enteredById: "preparer-a",
        reviewedAt: new Date("2026-09-02T00:00:00.000Z"),
        reversedAt: null,
        status: "exception",
        totalCents: 1000,
        allocatedCents: 0,
        unappliedCents: 1000,
        paidAt: new Date("2026-09-01T00:00:00.000Z"),
        externalReference: "DEPOSIT-TEST",
        cashGlCodeSnapshot: "1010",
        costCenterCodeSnapshot: "school-test",
        agencyProgram: completeProgram,
        allocations: [{ id: "late-allocation", status: "pending_review", requestedById: reverseBatchMode === "self-pending" ? currentUser.id : "reviewer-c", remittanceId: null, amountCents: 100, createdAt: new Date("2026-09-03T00:00:00.000Z"), remittance: null }],
      };
    },
    async findFirst() { return null; },
    async create() { throw new Error("Mapping-blocked batch must not be created"); },
  },
  agencyLedgerEntry: {
    async findMany() { return []; },
  },
  agencyAccountingPeriod: {
    async findFirst() { return null; },
  },
};

const prisma = {
  ...database,
  async $transaction(callback, options) {
    transactionOptions.push(options);
    if (transactionErrorCode) {
      throw new Prisma.PrismaClientKnownRequestError("write transaction failed", { code: transactionErrorCode, clientVersion: "6.19.3" });
    }
    return callback(database);
  },
};

mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() { return currentUser; },
    canManageBilling() { return true; },
    canAccessCenter(_user, centerId) { return currentUser.centerIds.includes(centerId); },
  },
});
mock.module("@/lib/audit", {
  namedExports: {
    async writeAuditLog(_user, input, client) { auditCalls.push({ input, client }); },
  },
});
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });

const { POST } = await import("../../src/app/api/billing/agency-claims/route.ts");

function post(body) {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function validClaimBody(centerId = "center-test") {
  return {
    action: "createClaim",
    centerId,
    authorizationId: authorizationRecord.id,
    servicePeriodStart: "2026-09-01",
    servicePeriodEnd: "2026-09-07",
    serviceUnits: "1",
  };
}

test("createClaim requires every authorization relationship and current enrollment to match the exact school", async () => {
  const corruptions = [
    authorization({ agencyProgram: { centerId: "center-other" } }),
    authorization({ family: { centerId: "center-other" } }),
    authorization({ child: { familyId: "family-other" } }),
  ];
  for (const corrupt of corruptions) {
    authorizationRecord = corrupt;
    const before = claimCreates;
    const response = await post(validClaimBody());
    assert.equal(response.status, 404);
    assert.equal(claimCreates, before);
  }

  authorizationRecord = authorization({ child: { enrollmentStatus: "former", classroomId: null } });
  const former = await post(validClaimBody());
  assert.equal(former.status, 409);
  assert.match((await former.json()).error, /currently enrolled child/i);
});

test("valid exact-school createClaim commits its audit through the transaction client", async () => {
  authorizationRecord = authorization();
  auditCalls = [];
  transactionOptions = [];
  const response = await post(validClaimBody());
  assert.equal(response.status, 200);
  assert.equal(claimCreates > 0, true);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].input.action, "billing.subsidy_claim.created");
  assert.equal(auditCalls[0].client, database);
  assert.deepEqual(transactionOptions, [{ isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 }]);
});

test("all-locations and stale authorized-school mutation contexts fail closed", async () => {
  authorizationRecord = authorization();
  const before = claimCreates;
  const allLocations = await post(validClaimBody("all"));
  assert.equal(allLocations.status, 403);
  const staleOtherSchool = await post(validClaimBody("center-other"));
  assert.equal(staleOtherSchool.status, 404);
  assert.equal(claimCreates, before);
});

test("controlled remittance preparation requires complete accounting mappings", async () => {
  accountingMappingsComplete = false;
  const response = await post({
    action: "prepareRemittanceBatch",
    centerId: "center-test",
    agencyProgramId: completeProgram.id,
    totalDollars: "10.00",
    externalReference: "DEPOSIT-TEST",
    paidAt: "2026-09-01",
    paymentMethod: "ach",
    evidenceName: "Bank advice",
    evidenceReference: "evidence-test",
    followUpDueAt: "2026-09-10",
    allocations: [],
    idempotencyKey: "mapping-test-key",
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /accounting mapping/i);
  accountingMappingsComplete = true;
});

function validProgramBody(action) {
  return {
    action,
    centerId: "center-test",
    agencyProgramId: completeProgram.id,
    name: "Test Agency",
    stateCode: "IN",
    providerNumber: "provider-test",
    submissionMethod: "agency_portal",
    portalUrl: "https://agency.example.test",
    paymentInstructions: "Verified",
    receivableGlCode: "1200",
    cashGlCode: "1010",
    adjustmentGlCode: "6900",
    costCenterCode: "school-test",
  };
}

test("program transaction blockers preserve authored 404 and retryable 409 responses", async () => {
  missingProgramCenter = true;
  for (const action of ["createProgram", "updateProgram"]) {
    const response = await post(validProgramBody(action));
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /school not found/i);
  }
  missingProgramCenter = false;

  for (const errorCode of ["P2034", "P2028"]) {
    transactionErrorCode = errorCode;
    for (const action of ["createProgram", "updateProgram"]) {
      const response = await post(validProgramBody(action));
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /changed at the same time/i);
    }
  }
  transactionErrorCode = null;
});

test("a reviewer with a self-requested pending late allocation cannot reverse the batch", async () => {
  reverseBatchMode = "self-pending";
  const response = await post({ action: "reverseRemittanceBatch", centerId: "center-test", batchId: "batch-test", reason: "Correct deposit" });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /you requested a still-pending allocation/i);

  reverseBatchMode = "other-pending";
  const otherReviewer = await post({ action: "reverseRemittanceBatch", centerId: "center-test", batchId: "batch-test", reason: "Correct deposit" });
  assert.equal(otherReviewer.status, 409);
  assert.match((await otherReviewer.json()).error, /unapplied-cash ledger evidence/i);
});
