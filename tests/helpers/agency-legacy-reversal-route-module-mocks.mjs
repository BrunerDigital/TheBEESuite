import assert from "node:assert/strict";
import { mock, test } from "node:test";

const ids = {
  center: "center-test",
  program: "program-test",
  authorization: "authorization-test",
  family: "family-test",
  child: "child-test",
  account: "billing-account-test",
  agencyAccount: "agency-ledger-account-test",
  claim: "claim-test",
  remittance: "remittance-test",
  receipt: "agency-ledger-remittance:remittance-test",
  legacyPayment: "legacy-family-remittance-test",
};
const paidAt = new Date("2026-09-02T12:00:00.000Z");
const approvedAt = new Date("2026-09-01T12:00:00.000Z");
const currentUser = {
  id: "billing-reviewer-test",
  tenantId: "tenant-test",
  email: "reviewer@example.test",
  name: "Billing reviewer",
  role: "BILLING_ADMIN",
  centerIds: [ids.center],
  workspace: { mode: "fixed", activeCenterId: ids.center },
};
const currentProgram = {
  id: ids.program,
  centerId: ids.center,
  name: "Renamed Agency",
  receivableGlCode: "1200",
  cashGlCode: "1010",
  adjustmentGlCode: "6900",
  costCenterCode: "school-test",
};
const authorizationScope = {
  id: ids.authorization,
  centerId: ids.center,
  agencyProgramId: ids.program,
  familyId: ids.family,
  childId: ids.child,
  authorizationNumber: "AUTH-TEST",
  agencyProgram: { id: ids.program, centerId: ids.center },
  family: { id: ids.family, centerId: ids.center },
  child: { id: ids.child, familyId: ids.family },
};
const routeClaim = {
  id: ids.claim,
  centerId: ids.center,
  agencyProgramId: ids.program,
  authorizationId: ids.authorization,
  number: "CLAIM-TEST",
  status: "partially_paid",
  claimedCents: 5_000,
  approvedCents: 5_000,
  paidCents: 1_000,
  approvedAt,
  createdAt: approvedAt,
  externalReference: "DECISION-TEST",
  agencyProgram: currentProgram,
  authorization: authorizationScope,
  lines: [{ childId: ids.child }],
  documents: [],
};

let mode = "success";
let activeStage = null;
let committed = freshWrites();

function freshWrites() {
  return {
    remittanceCas: [],
    periodChecks: [],
    allocationUpdates: [],
    dedicatedEntries: [],
    familyAccountUpdates: [],
    familyEntries: [],
    familyBalanceUpdates: [],
    claimUpdates: [],
    agencyAccountUpdates: [],
    audits: [],
  };
}

function commitStage(stage) {
  for (const key of Object.keys(committed)) committed[key].push(...stage[key]);
}

function billingAccount() {
  return { id: ids.account, familyId: ids.family, balanceCents: 4_000 };
}

function postingClaim() {
  return {
    ...routeClaim,
    authorization: {
      id: ids.authorization,
      centerId: ids.center,
      agencyProgramId: ids.program,
      familyId: ids.family,
      authorizationNumber: "AUTH-TEST",
      family: { id: ids.family, centerId: ids.center, billingAccount: billingAccount() },
    },
    remittances: [{ amountCents: 1_000, reversedAt: null }],
  };
}

function remittanceRecord() {
  return {
    id: ids.remittance,
    claimId: ids.claim,
    amountCents: 1_000,
    paidAt,
    paymentMethod: "ach",
    externalReference: "BANK-REF-TEST",
    enteredById: "original-operator",
    reversedAt: null,
    claim: postingClaim(),
    allocation: null,
  };
}

function approvalEntry() {
  return {
    id: "claim-approval-entry",
    agencyLedgerAccountId: ids.agencyAccount,
    claimId: ids.claim,
    remittanceId: null,
    type: "claim_approved",
    amountCents: 5_000,
    effectiveAt: approvedAt,
    externalReference: "DECISION-TEST",
    agencyLedgerAccount: { centerId: ids.center, agencyProgramId: ids.program },
  };
}

function receiptEntry() {
  return {
    id: ids.receipt,
    agencyLedgerAccountId: ids.agencyAccount,
    claimId: ids.claim,
    remittanceId: ids.remittance,
    remittanceBatchId: null,
    adjustmentId: null,
    type: "remittance_received",
    amountCents: -1_000,
    balanceAfterCents: 4_000,
    effectiveAt: paidAt,
    createdAt: paidAt,
    externalReference: "BANK-REF-TEST",
    glCodeSnapshot: "1010",
    costCenterCodeSnapshot: "school-test",
    sourceSystem: "subsidy_agency",
    externalId: `remittance:${ids.remittance}`,
    agencyLedgerAccount: { centerId: ids.center, agencyProgramId: ids.program },
  };
}

function legacyPaymentEntry() {
  return {
    id: ids.legacyPayment,
    billingAccountId: ids.account,
    type: "agency_payment",
    description: "Original Agency remittance for CLAIM-TEST",
    amountCents: -1_000,
    balanceAfterCents: 4_000,
    effectiveAt: paidAt,
    createdAt: paidAt,
    sourceSystem: "subsidy_agency",
    externalId: `agency-remittance:${ids.remittance}`,
    metadata: {
      remittanceId: ids.remittance,
      claimId: ids.claim,
      claimNumber: "CLAIM-TEST",
      agencyName: "Original Agency",
      authorizationNumber: "AUTH-TEST",
      externalReference: mode === "mismatch" ? "WRONG-REFERENCE" : "BANK-REF-TEST",
    },
  };
}

const database = {
  center: {
    async findUnique() { return { agencyReconciliationEnabled: false }; },
  },
  subsidyClaim: {
    async findUnique() { return routeClaim; },
    async update({ data }) {
      activeStage.claimUpdates.push(data);
      return { ...routeClaim, ...data };
    },
  },
  subsidyRemittance: {
    async findUnique() { return remittanceRecord(); },
    async updateMany({ data }) {
      activeStage.remittanceCas.push(data);
      return { count: 1 };
    },
    async findMany() { return []; },
  },
  agencyRemittanceAllocation: {
    async update({ data }) {
      activeStage.allocationUpdates.push(data);
      return data;
    },
  },
  agencyAccountingPeriod: {
    async findFirst(args) {
      activeStage.periodChecks.push(args);
      return mode === "closed" ? { name: "Closed September" } : null;
    },
  },
  agencyLedgerEntry: {
    async findUnique({ where }) {
      const externalId = where?.sourceSystem_externalId?.externalId;
      return externalId?.startsWith("claim-approved:") ? approvalEntry() : receiptEntry();
    },
    async create({ data }) {
      const entry = { id: "dedicated-reversal-entry", ...data };
      activeStage.dedicatedEntries.push(entry);
      return entry;
    },
    async findFirst() { return { balanceAfterCents: 5_000 }; },
  },
  agencyLedgerAccount: {
    async upsert() {
      return { id: ids.agencyAccount, balanceCents: 4_000, agencyProgram: currentProgram };
    },
    async update({ data }) {
      activeStage.agencyAccountUpdates.push(data);
      return { id: ids.agencyAccount, balanceCents: 5_000, agencyProgram: currentProgram };
    },
  },
  ledgerEntry: {
    async findUnique() { return legacyPaymentEntry(); },
    async findMany({ orderBy }) {
      if (!orderBy) {
        return mode === "negative"
          ? [{ amountCents: -1_000 }]
          : [{ amountCents: 5_000 }, { amountCents: -1_000 }];
      }
      return [
        { id: "family-agency-receivable", amountCents: 5_000, balanceAfterCents: 5_000 },
        { id: ids.legacyPayment, amountCents: -1_000, balanceAfterCents: 4_000 },
        { id: "family-reversal-entry", amountCents: 1_000, balanceAfterCents: 5_000 },
      ];
    },
    async create({ data }) {
      const entry = { id: "family-reversal-entry", ...data };
      activeStage.familyEntries.push(entry);
      return entry;
    },
    async update({ where, data }) {
      activeStage.familyBalanceUpdates.push({ where, data });
      return { id: where.id, ...data };
    },
  },
  billingAccount: {
    async update({ data }) {
      activeStage.familyAccountUpdates.push(data);
      return { ...billingAccount(), balanceCents: 5_000 };
    },
  },
  async $queryRaw() {
    return [{ minimumBalanceCents: 0n, maximumBalanceCents: 5_000n }];
  },
  async $executeRaw() { return 0; },
};

const prisma = {
  ...database,
  async $transaction(callback, options) {
    assert.deepEqual(options, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
    const stage = freshWrites();
    activeStage = stage;
    try {
      const result = await callback(database);
      commitStage(stage);
      return result;
    } finally {
      activeStage = null;
    }
  },
};

mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() { return currentUser; },
    canManageBilling() { return true; },
    canAccessCenter(_user, centerId) { return centerId === ids.center; },
  },
});
mock.module("@/lib/audit", {
  namedExports: {
    async writeAuditLog(user, input, client) {
      assert.equal(client, database);
      activeStage.audits.push({ userId: user.id, input });
    },
  },
});
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });

const { POST } = await import("../../src/app/api/billing/agency-claims/route.ts");

function postReversal() {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "reverseRemittance",
      centerId: ids.center,
      claimId: ids.claim,
      remittanceId: ids.remittance,
      reason: "Correct historical remittance",
    }),
  }));
}

function reset(nextMode) {
  mode = nextMode;
  committed = freshWrites();
}

async function withFixedNow(isoTimestamp, callback) {
  const NativeDate = globalThis.Date;
  const fixedTime = new NativeDate(isoTimestamp).getTime();
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedTime] : args));
    }

    static now() { return fixedTime; }
  }
  globalThis.Date = FixedDate;
  try {
    return await callback();
  } finally {
    globalThis.Date = NativeDate;
  }
}

function assertNoCommittedWrites() {
  assert.deepEqual(committed, freshWrites());
}

test("a pre-PR family mirror remains reversible after an agency rename", async () => {
  reset("success");
  const response = await postReversal();
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(committed.remittanceCas.length, 1);
  assert.equal(committed.remittanceCas[0].reversedById, currentUser.id);
  assert.equal(committed.remittanceCas[0].reversalReason, "Correct historical remittance");
  assert.equal(committed.dedicatedEntries.length, 1);
  const dedicatedReversal = committed.dedicatedEntries[0];
  assert.equal(dedicatedReversal.agencyLedgerAccountId, ids.agencyAccount);
  assert.equal(dedicatedReversal.claimId, ids.claim);
  assert.equal(dedicatedReversal.remittanceId, ids.remittance);
  assert.equal(dedicatedReversal.remittanceBatchId, null);
  assert.equal(dedicatedReversal.type, "remittance_reversal");
  assert.equal(dedicatedReversal.amountCents, 1_000);
  assert.equal(dedicatedReversal.sourceSystem, "subsidy_agency");
  assert.equal(dedicatedReversal.externalId, `remittance-reversal:${ids.remittance}`);
  assert.equal(dedicatedReversal.glCodeSnapshot, "1010");
  assert.equal(dedicatedReversal.costCenterCodeSnapshot, "school-test");
  assert.ok(dedicatedReversal.effectiveAt instanceof Date);
  assert.ok(dedicatedReversal.effectiveAt >= receiptEntry().effectiveAt);
  assert.equal(dedicatedReversal.metadata.originalAgencyLedgerEntryId, ids.receipt);
  assert.equal(dedicatedReversal.metadata.reason, "Correct historical remittance");
  assert.equal(dedicatedReversal.metadata.sourceReversedAt, committed.remittanceCas[0].reversedAt.toISOString());
  assert.equal(dedicatedReversal.metadata.postingRule, "later of source reversal and receipt effective time");
  assert.equal(committed.remittanceCas[0].reversedAt.getTime(), dedicatedReversal.effectiveAt.getTime());
  assert.equal(committed.allocationUpdates.length, 0);
  assert.equal(committed.familyAccountUpdates.length, 1);
  assert.deepEqual(committed.familyAccountUpdates[0], { balanceCents: { increment: 1_000 } });
  assert.equal(committed.familyEntries.length, 1);
  const familyReversal = committed.familyEntries[0];
  assert.equal(familyReversal.billingAccountId, ids.account);
  assert.equal(familyReversal.type, "agency_payment_reversal");
  assert.equal(familyReversal.amountCents, 1_000);
  assert.equal(familyReversal.sourceSystem, "subsidy_agency");
  assert.equal(familyReversal.externalId, `agency-remittance-reversal:${ids.remittance}`);
  assert.equal(familyReversal.effectiveAt.getTime(), dedicatedReversal.effectiveAt.getTime());
  assert.equal(familyReversal.metadata.agencyName, "Original Agency");
  assert.equal(familyReversal.metadata.originalLedgerEntryId, ids.legacyPayment);
  assert.equal(familyReversal.metadata.reason, "Correct historical remittance");
  assert.equal(familyReversal.metadata.sourceReversedAt, committed.remittanceCas[0].reversedAt.toISOString());
  assert.equal(familyReversal.metadata.postingRule, "later of source reversal and receipt effective time");
  assert.equal(committed.claimUpdates.length, 1);
  assert.deepEqual(committed.claimUpdates[0], { paidCents: 0, status: "approved" });
  assert.equal(committed.audits.length, 1);
  assert.equal(committed.audits[0].userId, currentUser.id);
  assert.equal(committed.audits[0].input.centerId, ids.center);
  assert.equal(committed.audits[0].input.action, "billing.subsidy_remittance.reversed");
  assert.equal(committed.audits[0].input.resource, "SubsidyRemittance");
  assert.equal(committed.audits[0].input.resourceId, ids.remittance);
  assert.equal(committed.audits[0].input.metadata.claimId, ids.claim);
  assert.equal(committed.audits[0].input.metadata.agencyLedgerEntryId, "dedicated-reversal-entry");
  assert.equal(committed.audits[0].input.metadata.agencyLedgerBalanceCents, 5_000);
  assert.equal(committed.audits[0].input.metadata.legacyFamilyReversalLedgerEntryId, "family-reversal-entry");
});

test("same-day morning source reversal stays exact while accounting posts no earlier than its noon receipt", async () => {
  reset("success");
  const response = await withFixedNow("2026-09-02T09:00:00.000Z", () => postReversal());
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(committed.remittanceCas.length, 1);
  assert.equal(committed.remittanceCas[0].reversedAt.toISOString(), "2026-09-02T09:00:00.000Z");
  assert.equal(committed.dedicatedEntries.length, 1);
  assert.equal(committed.dedicatedEntries[0].effectiveAt.toISOString(), paidAt.toISOString());
  assert.equal(committed.dedicatedEntries[0].metadata.sourceReversedAt, "2026-09-02T09:00:00.000Z");
  assert.equal(committed.dedicatedEntries[0].metadata.postingRule, "later of source reversal and receipt effective time");
  assert.equal(committed.familyEntries[0].effectiveAt.toISOString(), paidAt.toISOString());
  assert.equal(committed.periodChecks.length, 1);
  assert.equal(committed.periodChecks[0].where.endDate.gte.toISOString(), paidAt.toISOString());
});

test("same-day clamped posting honors a closed period and rolls back atomically", async () => {
  reset("closed");
  const response = await withFixedNow("2026-09-02T09:00:00.000Z", () => postReversal());
  const payload = await response.json();
  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.match(payload.error, /closed september/i);
  assertNoCommittedWrites();
});

test("conflicting legacy provenance rolls the whole reversal back", async () => {
  reset("mismatch");
  const response = await postReversal();
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.match(payload.error, /legacy family-ledger settlement conflicts/i);
  assertNoCommittedWrites();
});

test("negative agency-only history rolls the whole reversal back", async () => {
  reset("negative");
  const response = await postReversal();
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.match(payload.error, /would change parent-visible responsibility/i);
  assertNoCommittedWrites();
});
