import assert from "node:assert/strict";
import { mock, test } from "node:test";

let transactionCalls = 0;

const currentUser = {
  id: "billing-user",
  tenantId: "tenant-test",
  email: "billing@example.test",
  name: "Billing User",
  role: "BILLING_ADMIN",
  centerIds: ["center-test"],
};

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      subsidyClaim: {
        async findUnique() {
          return {
            id: "claim-test",
            centerId: "center-test",
            agencyProgramId: "program-test",
            authorizationId: null,
            status: "approved",
            agencyProgram: { id: "program-test", centerId: "center-test" },
            authorization: null,
            lines: [],
          };
        },
      },
      async $transaction() {
        transactionCalls += 1;
        throw new Error("A rejected future-dated request must not start a database transaction");
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
    async writeAuditLog() {
      throw new Error("A rejected future-dated request must not write an audit event");
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

function futureUtcDay() {
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 1);
  return future.toISOString().slice(0, 10);
}

async function post(body) {
  return POST(new Request("https://app.test/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("direct remittance rejects a future paid date", async () => {
  const before = transactionCalls;
  const response = await post({
    action: "recordRemittance",
    centerId: "center-test",
    claimId: "claim-test",
    amountDollars: "10.00",
    externalReference: "future-direct",
    paidAt: futureUtcDay(),
    paymentMethod: "ach",
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /cannot be after the current UTC accounting day/i);
  assert.equal(transactionCalls, before);
});

test("reviewed deposit batch rejects a future paid date", async () => {
  const before = transactionCalls;
  const response = await post({
    action: "prepareRemittanceBatch",
    centerId: "center-test",
    agencyProgramId: "program-test",
    totalDollars: "10.00",
    externalReference: "future-batch",
    paidAt: futureUtcDay(),
    paymentMethod: "ach",
    evidenceName: "Bank advice",
    evidenceReference: "evidence-test",
    followUpDueAt: futureUtcDay(),
    allocations: [],
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /cannot be after the current UTC accounting day/i);
  assert.equal(transactionCalls, before);
});

test("adjustment request rejects a future effective date", async () => {
  const before = transactionCalls;
  const response = await post({
    action: "requestLedgerAdjustment",
    centerId: "center-test",
    ledgerAccountId: "account-test",
    adjustmentType: "write_off",
    amountDollars: "10.00",
    effectiveAt: futureUtcDay(),
    reason: "Future adjustment should fail",
    evidenceName: "Adjustment evidence",
    evidenceReference: "evidence-test",
    followUpDueAt: futureUtcDay(),
    idempotencyKey: "future-adjustment-test",
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /cannot be effective after the current UTC accounting day/i);
  assert.equal(transactionCalls, before);
});
