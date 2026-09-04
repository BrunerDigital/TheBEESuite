import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { mock, test } from "node:test";

const currentUser = {
  id: "billing-user",
  tenantId: "tenant-test",
  email: "billing@example.test",
  name: "Billing User",
  role: "BILLING_ADMIN",
  centerIds: ["center-test", "center-other"],
};

const program = {
  id: "program-test",
  centerId: "center-test",
  name: "Test Agency",
  status: "active",
  providerNumber: "provider-test",
  vendorNumber: null,
  submissionMethod: "manual",
  portalUrl: null,
  paymentInstructions: "Verified test payment instructions",
  receivableGlCode: "1200",
  cashGlCode: "1000",
  adjustmentGlCode: "6900",
  costCenterCode: "center-test",
};

const batchTemplate = {
  id: "batch-test",
  centerId: "center-test",
  agencyProgramId: program.id,
  externalReference: "DEPOSIT-TEST",
  referenceKey: "ach:deposit-test",
  paidAt: new Date("2026-09-01T12:00:00.000Z"),
  paymentMethod: "ach",
  cashGlCodeSnapshot: "1000",
  costCenterCodeSnapshot: "center-test",
  totalCents: 10_000,
  allocatedCents: 0,
  unappliedCents: 10_000,
  status: "unmatched",
  notes: null,
  evidenceName: "Bank advice",
  evidenceReference: "evidence-test",
  evidenceStorageKey: null,
  enteredById: currentUser.id,
  reviewedById: "reviewer-test",
  reviewedAt: new Date("2026-09-02T12:00:00.000Z"),
  reviewNotes: null,
  followUpOwnerId: currentUser.id,
  followUpDueAt: new Date("2026-09-10T12:00:00.000Z"),
  reversedAt: null,
  reversedById: null,
  reversalReason: null,
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
  updatedAt: new Date("2026-09-01T12:00:00.000Z"),
  agencyProgram: program,
};

const claim = {
  id: "claim-test",
  number: "SUB-TEST",
  centerId: "center-test",
  agencyProgramId: program.id,
  status: "approved",
  claimedCents: 10_000,
  approvedCents: 10_000,
  remittances: [],
  agencyProgram: program,
};

const account = {
  id: "account-test",
  centerId: "center-test",
  agencyProgramId: program.id,
  balanceCents: 0,
  agencyProgram: program,
};

const stores = {
  batch: new Map(),
  allocation: new Map(),
  adjustment: new Map(),
};

const raceWaiters = {
  batch: new Map(),
  allocation: new Map(),
  adjustment: new Map(),
};

let activationEnabled = true;
let programReady = true;
let activationLookups = 0;
let auditWrites = 0;

function prismaError(code) {
  return new Prisma.PrismaClientKnownRequestError("simulated concurrent write conflict", {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta: code === "P2002" ? { target: ["idempotencyKey"] } : undefined,
  });
}

function storedRecord(kind, data) {
  const id = `${kind}-${data.idempotencyKey}`;
  const timestamps = {
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
  };
  if (kind === "batch") {
    return {
      id,
      ...data,
      allocatedCents: 0,
      unappliedCents: 0,
      status: "pending_review",
      reviewedById: null,
      reviewedAt: null,
      reviewNotes: null,
      reversedAt: null,
      reversedById: null,
      reversalReason: null,
      ...timestamps,
    };
  }
  if (kind === "allocation") {
    return {
      id,
      ...data,
      remittanceId: null,
      status: "pending_review",
      reviewedById: null,
      reviewedAt: null,
      reviewNotes: null,
      batch: { ...batchTemplate },
      ...timestamps,
    };
  }
  return {
    id,
    ...data,
    status: "pending_review",
    reviewedById: null,
    reviewedAt: null,
    reviewNotes: null,
    reversedAt: null,
    reversedById: null,
    reversalReason: null,
    ...timestamps,
  };
}

function recoveryRecord(kind, data) {
  if (data.idempotencyKey.startsWith("missing-")) return null;
  const record = storedRecord(kind, data);
  if (data.idempotencyKey.startsWith("mismatch-")) {
    if (kind === "batch") record.reconciliationFingerprint = "different-fingerprint";
    else record.fingerprint = "different-fingerprint";
  }
  if (data.idempotencyKey.startsWith("owner-")) {
    if (kind === "batch") record.enteredById = "other-user";
    else record.requestedById = "other-user";
  }
  if (data.idempotencyKey.startsWith("center-")) {
    if (kind === "allocation") record.batch = { ...record.batch, centerId: "center-other" };
    else record.centerId = "center-other";
  }
  return record;
}

async function createWithConflict(kind, data) {
  const record = recoveryRecord(kind, data);
  if (data.idempotencyKey.startsWith("race-")) {
    return new Promise((resolve, reject) => {
      const waiters = raceWaiters[kind].get(data.idempotencyKey) ?? [];
      waiters.push({ resolve, reject, record });
      raceWaiters[kind].set(data.idempotencyKey, waiters);
      if (waiters.length === 2) {
        stores[kind].set(data.idempotencyKey, waiters[0].record);
        waiters[0].resolve(waiters[0].record);
        waiters[1].reject(prismaError("P2002"));
        raceWaiters[kind].delete(data.idempotencyKey);
      }
    });
  }
  if (record) stores[kind].set(data.idempotencyKey, record);
  throw prismaError(data.idempotencyKey.startsWith("p2034-") ? "P2034" : "P2002");
}

const database = {
  agencyProgram: {
    async findFirst() {
      return { ...program, ...(programReady ? {} : { status: "setup_required", providerNumber: null, paymentInstructions: null }) };
    },
  },
  center: {
    async findUnique() {
      activationLookups += 1;
      return { agencyReconciliationEnabled: activationEnabled, agencyPrograms: [{ ...program, ...(programReady ? {} : { status: "setup_required", providerNumber: null, paymentInstructions: null }) }] };
    },
  },
  agencyAccountingPeriod: {
    async findFirst() {
      return null;
    },
  },
  subsidyClaim: {
    async findUnique() {
      return claim;
    },
    async findFirst() {
      return claim;
    },
  },
  agencyLedgerAccount: {
    async findUnique() {
      return { ...account, agencyProgram: { ...program, ...(programReady ? {} : { status: "setup_required", providerNumber: null, paymentInstructions: null }) } };
    },
  },
  agencyRemittanceBatch: {
    async findUnique({ where }) {
      if (where.idempotencyKey) return stores.batch.get(where.idempotencyKey) ?? null;
      if (where.id === batchTemplate.id) return { ...batchTemplate, agencyProgram: { ...program } };
      return null;
    },
    async findFirst() {
      return null;
    },
    async create({ data }) {
      return createWithConflict("batch", data);
    },
    async update({ data }) {
      return { ...batchTemplate, ...data };
    },
  },
  agencyRemittanceAllocation: {
    async findUnique({ where }) {
      return where.idempotencyKey ? stores.allocation.get(where.idempotencyKey) ?? null : null;
    },
    async findFirst() {
      return null;
    },
    async create({ data }) {
      return createWithConflict("allocation", data);
    },
    async createMany() {
      return { count: 0 };
    },
  },
  agencyLedgerAdjustment: {
    async findUnique({ where }) {
      return where.idempotencyKey ? stores.adjustment.get(where.idempotencyKey) ?? null : null;
    },
    async create({ data }) {
      return createWithConflict("adjustment", data);
    },
  },
};

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      ...database,
      async $transaction(callback) {
        return callback(database);
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
      return currentUser.centerIds.includes(centerId);
    },
  },
});

mock.module("@/lib/audit", {
  namedExports: {
    async writeAuditLog() { auditWrites += 1; },
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

function batchBody(idempotencyKey) {
  return {
    action: "prepareRemittanceBatch",
    centerId: "center-test",
    agencyProgramId: program.id,
    totalDollars: "100.00",
    externalReference: "DEPOSIT-TEST",
    paidAt: "2026-09-01",
    paymentMethod: "ach",
    evidenceName: "Bank advice",
    evidenceReference: "evidence-test",
    followUpDueAt: "2026-09-10",
    allocations: [],
    idempotencyKey,
  };
}

function allocationBody(idempotencyKey) {
  return {
    action: "requestBatchAllocation",
    centerId: "center-test",
    batchId: batchTemplate.id,
    claimId: claim.id,
    amountDollars: "25.00",
    notes: "Allocate tested unapplied cash",
    idempotencyKey,
  };
}

function adjustmentBody(idempotencyKey) {
  return {
    action: "requestLedgerAdjustment",
    centerId: "center-test",
    ledgerAccountId: account.id,
    adjustmentType: "correction_increase",
    amountDollars: "15.00",
    effectiveAt: "2026-09-01",
    reason: "Test correction",
    evidenceName: "Adjustment approval",
    evidenceReference: "evidence-test",
    followUpDueAt: "2026-09-10",
    idempotencyKey,
  };
}

const actions = [
  { name: "remittance batch", kind: "batch", body: batchBody },
  { name: "batch allocation", kind: "allocation", body: allocationBody },
  { name: "ledger adjustment", kind: "adjustment", body: adjustmentBody },
];

async function post(body) {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function reset() {
  for (const store of Object.values(stores)) store.clear();
  for (const waiters of Object.values(raceWaiters)) waiters.clear();
  activationEnabled = true;
  programReady = true;
  activationLookups = 0;
  auditWrites = 0;
}

test("same-key concurrent P2002 requests converge on one remittance batch, allocation, and adjustment", { timeout: 10_000 }, async () => {
  for (const action of actions) {
    reset();
    const body = action.body(`race-${action.kind}`);
    const responses = await Promise.all([post(body), post(body)]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200], action.name);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    const records = payloads.map((payload) => (
      action.kind === "batch" ? payload.batch : action.kind === "allocation" ? payload.allocation : payload.adjustment
    ));
    assert.equal(records[0].id, records[1].id, action.name);
    assert.deepEqual(payloads.map((payload) => payload.reused).sort(), [false, true], action.name);
    assert.equal(stores[action.kind].size, 1, action.name);
  }
});

test("P2034 retries recover only the matching owned record for every request type", async () => {
  for (const action of actions) {
    reset();
    const response = await post(action.body(`p2034-${action.kind}`));
    assert.equal(response.status, 200, action.name);
    const payload = await response.json();
    assert.equal(payload.ok, true, action.name);
    assert.equal(payload.reused, true, action.name);
  }
});

test("conflict recovery rejects mismatched fingerprints without treating domain conflicts as replays", async () => {
  for (const action of actions) {
    reset();
    const mismatch = await post(action.body(`mismatch-${action.kind}`));
    assert.equal(mismatch.status, 409, action.name);
    assert.match((await mismatch.json()).error, /retry key was already used for a different/i, action.name);

    reset();
    const missing = await post(action.body(`missing-${action.kind}`));
    assert.equal(missing.status, 409, action.name);
    assert.doesNotMatch((await missing.json()).error, /not found/i, action.name);
  }
});

test("conflict recovery hides cross-user and cross-school idempotency records behind generic 404s", async () => {
  for (const action of actions) {
    reset();
    const wrongOwner = await post(action.body(`owner-${action.kind}`));
    assert.equal(wrongOwner.status, 404, `${action.name} wrong owner`);
    assert.match((await wrongOwner.json()).error, /not found/i, action.name);

    reset();
    const auditsBeforeWrongCenter = auditWrites;
    const wrongCenter = await post(action.body(`center-${action.kind}`));
    assert.equal(wrongCenter.status, 404, `${action.name} wrong center`);
    assert.match((await wrongCenter.json()).error, /not found/i, action.name);
    assert.equal(auditWrites, auditsBeforeWrongCenter, `${action.name} stale exact-school replay must not audit the other school`);
  }
});

test("an owned exact replay remains recoverable after activation or setup state drifts", async () => {
  for (const action of actions) {
    reset();
    const body = action.body(`p2002-drift-${action.kind}`);
    const seeded = await post(body);
    assert.equal(seeded.status, 200, `${action.name} seed`);
    activationEnabled = false;
    programReady = false;
    const lookupsBeforeReplay = activationLookups;
    const replayed = await post(body);
    assert.equal(replayed.status, 200, action.name);
    const payload = await replayed.json();
    assert.equal(payload.reused, true, action.name);
    assert.equal(activationLookups, lookupsBeforeReplay, `${action.name} must replay before activation check`);
  }
});
