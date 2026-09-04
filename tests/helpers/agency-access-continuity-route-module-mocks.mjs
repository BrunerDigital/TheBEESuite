import assert from "node:assert/strict";
import { mock, test } from "node:test";

const billingRoles = new Set([
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "BILLING_ADMIN",
]);

const deniedRoles = [
  "TEACHER",
  "PARENT_GUARDIAN",
  "AUTHORIZED_PICKUP",
];

const currentUser = {
  id: "same-user",
  tenantId: "tenant-test",
  email: "billing@example.test",
  name: "Billing User",
  role: "BILLING_ADMIN",
  centerIds: ["center-test"],
  workspace: { mode: "fixed", activeCenterId: "center-test" },
};

let claimReads = 0;
let activationEnabled = false;

const agencyProgram = {
  id: "program-test",
  centerId: "center-test",
  name: "Test Agency",
};

const exactAuthorization = {
  id: "authorization-test",
  centerId: "center-test",
  agencyProgramId: agencyProgram.id,
  familyId: "family-test",
  childId: "child-test",
  agencyProgram,
  family: { id: "family-test", centerId: "center-test", billingAccount: null },
  child: { id: "child-test", familyId: "family-test" },
};

const approvedClaim = {
  id: "claim-test",
  centerId: "center-test",
  agencyProgramId: agencyProgram.id,
  authorizationId: exactAuthorization.id,
  number: "SUB-TEST",
  status: "approved",
  approvedCents: 10_000,
  claimedCents: 10_000,
  approvedAt: new Date("2026-09-01T12:00:00.000Z"),
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
  updatedAt: new Date("2026-09-01T12:00:00.000Z"),
  externalReference: "approval-test",
  agencyProgram,
  authorization: exactAuthorization,
  lines: [{ childId: exactAuthorization.childId }],
};

const directRemittance = {
  id: "remittance-test",
  claimId: approvedClaim.id,
  amountCents: 1_000,
  paidAt: new Date("2026-09-02T12:00:00.000Z"),
  paymentMethod: "ach",
  externalReference: "payment-test",
  enteredById: "same-user",
  reversedAt: null,
  allocation: null,
  claim: approvedClaim,
};

const claimApprovalEntry = {
  id: "approval-entry-test",
  agencyLedgerAccount: { centerId: "center-test", agencyProgramId: agencyProgram.id },
  claimId: approvedClaim.id,
  remittanceId: null,
  type: "claim_approved",
  amountCents: approvedClaim.approvedCents,
  effectiveAt: approvedClaim.approvedAt,
  externalReference: approvedClaim.externalReference,
};

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      subsidyClaim: {
        async findUnique() {
          claimReads += 1;
          return approvedClaim;
        },
      },
      center: {
        async findUnique() {
          return { agencyReconciliationEnabled: activationEnabled };
        },
      },
      subsidyRemittance: {
        async findUnique() {
          return directRemittance;
        },
      },
      agencyLedgerEntry: {
        async findUnique({ where }) {
          return where.sourceSystem_externalId?.externalId === `claim-approved:${approvedClaim.id}` ? claimApprovalEntry : null;
        },
      },
      async $transaction(callback) {
        return callback(this);
      },
    },
  },
});

mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() {
      return currentUser;
    },
    canManageBilling(user) {
      return billingRoles.has(user.role);
    },
    canAccessCenter(_user, centerId) {
      return centerId === "center-test";
    },
  },
});

mock.module("@/lib/audit", {
  namedExports: {
    async writeAuditLog() {
      throw new Error("Access-boundary requests must not write an audit event");
    },
  },
});

mock.module("@/lib/request-response-logging", {
  namedExports: {
    withApiLogging(_name, handler) {
      return handler;
    },
  },
});

const { POST } = await import("../../src/app/api/billing/agency-claims/route.ts");

async function post(action) {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, centerId: "center-test", claimId: "claim-test" }),
  }));
}

async function postDirectReversal() {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "reverseRemittance",
      centerId: "center-test",
      claimId: approvedClaim.id,
      remittanceId: directRemittance.id,
      reason: "Correct baseline entry",
    }),
  }));
}

test("all six billing roles reach baseline direct record and same-user reverse actions", async () => {
  for (const role of billingRoles) {
    currentUser.role = role;
    for (const action of ["recordRemittance", "reverseRemittance"]) {
      const before = claimReads;
      const response = await post(action);
      assert.equal(response.status, 400, `${role} ${action}`);
      assert.equal(claimReads, before + 1, `${role} must pass billing authorization for ${action}`);
      assert.doesNotMatch((await response.json()).error, /billing access required/i, `${role} ${action}`);
    }
  }
});

test("teacher, parent, and pickup roles remain denied before agency data access", async () => {
  for (const role of deniedRoles) {
    currentUser.role = role;
    for (const action of ["recordRemittance", "reverseRemittance", "prepareRemittanceBatch", "approveRemittanceBatch"]) {
      const before = claimReads;
      const response = await post(action);
      assert.equal(response.status, 403, `${role} ${action}`);
      assert.match((await response.json()).error, /billing access required/i, `${role} ${action}`);
      assert.equal(claimReads, before, `${role} must be rejected before reading a claim`);
    }
  }
});

test("read-only auditor remains denied for every mutation before agency data access", async () => {
  currentUser.role = "READ_ONLY_AUDITOR";
  for (const action of ["recordRemittance", "reverseRemittance", "prepareRemittanceBatch", "approveRemittanceBatch", "createProgram", "createClaim"]) {
    const before = claimReads;
    const response = await post(action);
    assert.equal(response.status, 403, action);
    assert.match((await response.json()).error, /billing access required/i, action);
    assert.equal(claimReads, before, `${action} must be rejected before reading a claim`);
  }
});

test("same-user direct correction remains available only before exact-school activation", async () => {
  for (const role of billingRoles) {
    currentUser.id = "same-user";
    currentUser.role = role;
    activationEnabled = false;
    const response = await postDirectReversal();
    assert.equal(response.status, 409, `${role} inactive baseline reversal should reach financial evidence validation`);
    assert.match((await response.json()).error, /missing its immutable receipt ledger entry/i, role);
  }

  activationEnabled = true;
  currentUser.id = "same-user";
  currentUser.role = "BILLING_ADMIN";
  const sameUser = await postDirectReversal();
  assert.equal(sameUser.status, 403);
  assert.match((await sameUser.json()).error, /different billing administrator or accounting reviewer/i);

  currentUser.id = "different-user";
  const differentAccountingReviewer = await postDirectReversal();
  assert.equal(differentAccountingReviewer.status, 409);
  assert.match((await differentAccountingReviewer.json()).error, /missing its immutable receipt ledger entry/i);

  currentUser.role = "CENTER_DIRECTOR";
  const nonAccountingReviewer = await postDirectReversal();
  assert.equal(nonAccountingReviewer.status, 403);
  assert.match((await nonAccountingReviewer.json()).error, /different billing administrator or accounting reviewer/i);
});

test("all-location workspace keeps exact-school reads separate and rejects crafted mutations before data access", async () => {
  currentUser.id = "same-user";
  currentUser.role = "PLATFORM_OWNER";
  currentUser.centerIds = ["center-test", "center-other"];
  currentUser.workspace = { mode: "all", activeCenterId: null };
  const before = claimReads;
  const response = await post("recordRemittance");
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /switch the global workspace to one authorized school/i);
  assert.equal(claimReads, before, "An all-location mutation must fail before reading any school financial record.");

  currentUser.workspace = { mode: "center", activeCenterId: "center-other" };
  const mismatchedSelection = await post("recordRemittance");
  assert.equal(mismatchedSelection.status, 403);
  assert.equal(claimReads, before, "A body school that differs from the selected global workspace must fail before data access.");

  currentUser.role = "BILLING_ADMIN";
  currentUser.workspace = { mode: "fixed", activeCenterId: "center-test" };
});
