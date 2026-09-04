import assert from "node:assert/strict";
import { mock, test } from "node:test";

const currentUser = {
  id: "reviewer-user",
  tenantId: "tenant-test",
  email: "reviewer@example.test",
  name: "Reviewer User",
  role: "BILLING_ADMIN",
  centerIds: ["center-test"],
};

let scenario = "none";
let periodCreates = 0;
let remittanceCreates = 0;
let adjustmentCreates = 0;
let recoveredRows = 0;
const sqlLog = [];

function reset(nextScenario) {
  scenario = nextScenario;
  periodCreates = 0;
  remittanceCreates = 0;
  adjustmentCreates = 0;
  recoveredRows = 0;
  sqlLog.length = 0;
}

function sqlText(first) {
  if (Array.isArray(first)) return first.join("?");
  return String(first ?? "");
}

function sourceClaim() {
  const createdAt = new Date("2026-08-01T12:00:00.000Z");
  return {
    id: "claim-test",
    centerId: "center-test",
    agencyProgramId: "program-test",
    authorizationId: null,
    number: "TEST-CLAIM",
    status: "approved",
    claimedCents: 10_000,
    approvedCents: 10_000,
    paidCents: 0,
    approvedAt: createdAt,
    externalReference: "approval-test",
    createdAt,
    updatedAt: createdAt,
    agencyProgram: {
      id: "program-test",
      centerId: "center-test",
      name: "Test Agency",
      status: "active",
      receivableGlCode: "1100",
      cashGlCode: "1000",
      adjustmentGlCode: "1190",
      costCenterCode: "CENTER-TEST",
    },
    authorization: null,
    remittances: [],
    lines: [],
    documents: [],
  };
}

const tx = {
  center: {
    async findUnique() {
      if (scenario === "direct-closed-period") return { agencyReconciliationEnabled: false };
      return {
        agencyReconciliationEnabled: true,
        agencyPrograms: [{
          name: "Test Agency",
          status: "active",
          receivableGlCode: "1100",
          cashGlCode: "1000",
          adjustmentGlCode: "1190",
          costCenterCode: "CENTER-TEST",
        }],
      };
    },
  },
  subsidyClaim: {
    async findUnique() {
      return sourceClaim();
    },
    async findFirst() {
      return scenario === "adjustment-draft-claim" ? null : { id: "claim-test" };
    },
  },
  subsidyRemittance: {
    async create() {
      remittanceCreates += 1;
      throw new Error("A closed-period direct receipt must not be inserted");
    },
  },
  agencyAccountingPeriod: {
    async findFirst(args) {
      if (scenario === "direct-closed-period" && args?.where?.status === "closed") {
        return { name: "August 2026" };
      }
      return null;
    },
    async create({ data }) {
      periodCreates += 1;
      return { id: "period-test", ...data };
    },
  },
  agencyRemittanceBatch: {
    async count() { return 0; },
    async findFirst() { return { id: "batch-test" }; },
  },
  agencyRemittanceAllocation: { async count() { return 0; } },
  agencyLedgerAdjustment: {
    async count() { return 0; },
    async create() {
      adjustmentCreates += 1;
      throw new Error("An adjustment linked to a nonfinancial claim must not be inserted");
    },
  },
  agencyLedgerEntry: {
    async findFirst() {
      return { balanceAfterCents: -1_000 };
    },
    async findUnique() {
      throw new Error("A closed-period direct receipt must not create or recover ledger evidence");
    },
    async create() {
      throw new Error("A closed-period direct receipt must not create ledger evidence");
    },
  },
  agencyLedgerAccount: {
    async findUnique() {
      return {
        id: "account-test",
        centerId: "center-test",
        agencyProgramId: "program-test",
        agencyProgram: sourceClaim().agencyProgram,
      };
    },
    async update({ data }) {
      return { id: "account-test", balanceCents: data.balanceCents };
    },
    async upsert() {
      throw new Error("A closed-period direct receipt must not create an agency account");
    },
  },
  async $queryRaw(first) {
    const text = sqlText(first);
    sqlLog.push(text);
    const marker = text.match(/agency-close:[a-z-]+/)?.[0] ?? "";
    if (marker === "agency-close:scope-evidence") return [{ conflictCount: scenario === "scope-conflict" ? 1n : 0n }];
    if (marker === "agency-close:claim-evidence") return [{ conflictCount: scenario === "claim-conflict" ? 1n : 0n }];
    if (marker === "agency-close:direct-receipt-evidence") return [{ conflictCount: scenario === "direct-conflict" ? 1n : 0n }];
    if (marker === "agency-close:controlled-receipt-precheck") return [{ conflictCount: scenario === "controlled-conflict" ? 1n : 0n }];
    if (marker === "agency-close:controlled-receipt-recovery") {
      if (scenario !== "controlled-valid") return [];
      recoveredRows += 1;
      return [{ agencyLedgerAccountId: "account-test" }];
    }
    if (marker === "agency-close:controlled-receipt-postcheck") return [{ conflictCount: 0n }];
    if (marker === "agency-close:remittance-reversal-evidence") return [{ conflictCount: scenario === "reversal-conflict" ? 1n : 0n }];
    if (marker === "agency-close:adjustment-evidence") return [{ conflictCount: scenario === "adjustment-conflict" ? 1n : 0n }];
    if (text.includes("WITH running AS")) return [{ minimumBalanceCents: -1_000n, maximumBalanceCents: 0n }];
    if (text.includes("WITH claim_sources AS")) return [{ conflictCount: 0n }];
    return [];
  },
  async $executeRaw() {
    return 0;
  },
};

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      subsidyClaim: {
        async findUnique() {
          return sourceClaim();
        },
      },
      async $transaction(callback) {
        return callback(tx);
      },
    },
  },
});

mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() {
      return currentUser;
    },
    canManageBilling() {
      return true;
    },
    canAccessCenter(_user, centerId) {
      return centerId === "center-test";
    },
  },
});

mock.module("@/lib/audit", {
  namedExports: {
    async writeAuditLog() {},
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

async function post(body) {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function closePeriod() {
  return post({
    action: "closeAccountingPeriod",
    centerId: "center-test",
    name: "August 2026",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    reason: "Monthly close test",
  });
}

for (const [caseName, errorPattern] of [
  ["claim-conflict", /claim-approval event/i],
  ["direct-conflict", /direct-remittance receipt/i],
  ["controlled-conflict", /controlled-batch source facts|conflicting receipt evidence/i],
  ["reversal-conflict", /remittance reversal/i],
  ["adjustment-conflict", /adjustment evidence/i],
]) {
  test(`period close fails closed for ${caseName}`, { concurrency: false }, async () => {
    reset(caseName);
    const response = await closePeriod();
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, errorPattern);
    assert.equal(recoveredRows, 0);
    assert.equal(periodCreates, 0);
  });
}

test("period close recovers only a fully evidenced controlled-batch receipt", { concurrency: false }, async () => {
  reset("controlled-valid");
  const response = await closePeriod();
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const body = await response.json();
  assert.equal(body.recoveredClaimReceivableCount, 0);
  assert.equal(body.recoveredRemittanceReceivedCount, 1);
  assert.equal(body.recoveredRemittanceReversalCount, 0);
  assert.equal(recoveredRows, 1);
  assert.equal(periodCreates, 1);
  const recoverySql = sqlLog.find((text) => text.includes("agency-close:controlled-receipt-recovery"));
  assert.ok(recoverySql);
  assert.match(recoverySql, /JOIN "AgencyRemittanceAllocation" allocation/);
  assert.match(recoverySql, /allocation\.status IN \('posted', 'reversed'\)/);
  assert.match(recoverySql, /batch\."cashGlCodeSnapshot"/);
  assert.match(recoverySql, /batch\."costCenterCodeSnapshot"/);
  assert.doesNotMatch(recoverySql, /program\."cashGlCode"/);
  assert.doesNotMatch(recoverySql, /program\."costCenterCode"/);
});

test("baseline direct remittance is blocked before writes when a later period is closed", { concurrency: false }, async () => {
  reset("direct-closed-period");
  const response = await post({
    action: "recordRemittance",
    centerId: "center-test",
    claimId: "claim-test",
    amountDollars: "10.00",
    externalReference: "receipt-test",
    paidAt: "2026-08-15",
    paymentMethod: "ach",
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /or a later accounting period is closed/i);
  assert.equal(remittanceCreates, 0);
  assert.equal(recoveredRows, 0);
});

test("claim-linked adjustment rejects a draft or otherwise nonfinancial claim before writes", { concurrency: false }, async () => {
  reset("adjustment-draft-claim");
  const response = await post({
    action: "requestLedgerAdjustment",
    centerId: "center-test",
    ledgerAccountId: "account-test",
    claimId: "draft-claim",
    adjustmentType: "correction_increase",
    amountDollars: "10.00",
    effectiveAt: "2026-08-15",
    reason: "Claim lifecycle guard test",
    evidenceName: "Correction approval",
    evidenceReference: "evidence-test",
    followUpDueAt: "2026-09-30",
    idempotencyKey: "adjustment-draft-claim-test",
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /requires an approved, partially paid, or paid claim/i);
  assert.equal(adjustmentCreates, 0);
});
