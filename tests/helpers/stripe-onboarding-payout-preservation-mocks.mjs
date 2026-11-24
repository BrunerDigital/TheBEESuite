import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";

const clone = value => structuredClone(value);
const baseFields = {
  stripeConnectAccountId: "acct_existing",
  stripePayoutCollectionMode: "manual",
  stripePayoutSchedulePreference: "keep_current",
  stripePayoutScheduleInterval: "weekly",
  stripePayoutDelayPolicy: "reviewed_delay",
  stripePayoutScheduleStatus: "reviewed_hold",
  stripePayoutScheduleLastSyncedAt: "2026-11-01T00:00:00.000Z",
  stripePayoutScheduleLastError: "Retain the reviewed hold",
  stripePayoutSettlementDelayDaysOverride: 7,
  stripeConnectMigrationSourceAccountId: "acct_previous",
  stripeConnectMigrationSourcePayoutHoldStatus: "manual_confirmed",
  stripeConnectMigrationTargetPayoutHoldStatus: "manual_confirmed",
  stripePayoutBankLast4: "4242",
  stripePayoutBankDefaultConfirmed: true,
  stripeBillingApproved: true,
  stripeParentPaymentsEnabled: true,
  unrelatedSetting: "preserve",
};
const protectedKeys = Object.keys(baseFields);
let currentFields, user, canManage, allowed, centerReads, writes, audits;
let providerCalls, settingsWrites, providerSettings, retrievedId, retrieveFails, linkFails;
const snapshot = id => ({
  id, dashboard: "full", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
  requirementFields: [], currentlyDueRequirementFields: [], pendingVerificationFields: [],
  merchantCapabilityStatus: "active", merchantPayoutCapabilityStatus: "active",
});
beforeEach(() => {
  currentFields = clone(baseFields);
  user = { id: "fixture_director", tenantId: "fixture_tenant", primaryCenterId: "fixture_school" };
  canManage = true; allowed = true; centerReads = 0; writes = []; audits = [];
  providerCalls = []; settingsWrites = [];
  providerSettings = { payouts: { schedule: { interval: "weekly", weeklyPayoutDays: ["friday"] }, status: "paused" },
    settlementTiming: { delayDaysOverride: 7 }, bank: "fixture_bank", activation: "unchanged" };
  retrievedId = "acct_existing"; retrieveFails = false; linkFails = false;
});
mock.module("@/lib/auth", { namedExports: {
  getCurrentUser: async () => user,
  canManageBilling: () => canManage, canManageOperations: () => false,
  canAccessCenter: (_user, id) => allowed && id === "fixture_school",
} });
mock.module("@/lib/prisma", { namedExports: { prisma: { center: {
  findUnique: async ({ where: { id } }) => {
    assert.equal(id, "fixture_school"); centerReads++;
    return { id, name: "Fictional School", crmLocationId: null, email: "school@example.invalid",
      phone: "+17655551234", address: "123 Example Street", city: "Kokomo", state: "IN", postalCode: "46901",
      customFields: clone(currentFields) };
  },
  update: async () => { throw Error("Unconditional Center writes are forbidden"); },
  updateMany: async input => {
    assert.equal(input.where.id, "fixture_school");
    if (JSON.stringify(input.where.customFields.equals) !== JSON.stringify(currentFields)) return { count: 0 };
    writes.push(clone(input)); currentFields = clone(input.data.customFields);
    return { count: 1 };
  },
} } } });
mock.module("@/lib/audit", { namedExports: { writeAuditLog: async (_user, entry) => audits.push(entry) } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });
mock.module("@/lib/payment-redirect-security", { namedExports: { getSecurePaymentAppBaseUrl: () => "https://thebeesuite.io" } });
mock.module("@/lib/integrations", { namedExports: {
  readStripeConnectedAccountId: fields => fields.stripeConnectAccountId,
  getStripeSecretKey: async input => {
    assert.equal(input.tenantId, "fixture_tenant"); providerCalls.push("credentials"); return "synthetic_only";
  },
  stripeAccountCreationIdempotencyKey: () => "synthetic_creation_key",
  createStripeConnectedAccount: async input => {
    assert.equal(input.tenantId, "fixture_tenant"); providerCalls.push("create");
    return { ok: true, configured: true, id: "acct_created", account: snapshot("acct_created") };
  },
  retrieveStripeConnectedAccount: async (id, input) => {
    assert.equal(id, "acct_existing"); assert.equal(input.tenantId, "fixture_tenant"); providerCalls.push("retrieve");
    return retrieveFails ? { ok: false, configured: true, error: "Synthetic account read failed" }
      : { ok: true, configured: true, account: snapshot(retrievedId) };
  },
  setStripeConnectedAccountDailyPayouts: async input => {
    assert.equal(input.tenantId, "fixture_tenant"); settingsWrites.push(clone(input));
    providerSettings.payouts.schedule = { interval: "daily" };
    delete providerSettings.settlementTiming.delayDaysOverride;
    return { ok: true, configured: true };
  },
  createStripeAccountLink: async input => {
    assert.equal(input.tenantId, "fixture_tenant"); providerCalls.push("link");
    assert.equal(input.accountId, currentFields.stripeConnectAccountId);
    return linkFails ? { ok: false, configured: true, error: "Synthetic link rejection" }
      : { ok: true, configured: true, url: "https://connect.stripe.com/fixture-only" };
  },
} });
const { POST: onboard } = await import("../../src/app/api/billing/connect/onboard/route.ts");
const request = () => new NextRequest("https://thebeesuite.io/api/billing/connect/onboard", {
  method: "POST", body: JSON.stringify({ centerId: "fixture_school" }),
});
function assertLocalPayoutStateUnchanged(before) {
  for (const key of protectedKeys) assert.deepEqual(currentFields[key], before[key], key);
}

for (const interval of ["weekly", "monthly", "manual"]) {
  test(`existing ${interval} payout account keeps cadence, settlement delay, paused state and bank`, async () => {
    currentFields.stripePayoutScheduleInterval = interval;
    providerSettings.payouts.schedule = { interval, ...(interval === "monthly" ? { monthlyPayoutDays: [5, 20] } : {}) };
    const beforeFields = clone(currentFields), beforeProvider = clone(providerSettings);
    const response = await onboard(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).createdAccount, false);
    assert.deepEqual(settingsWrites, [], "An existing account must receive no Balance Settings writes");
    assert.deepEqual(providerSettings, beforeProvider);
    assertLocalPayoutStateUnchanged(beforeFields);
    assert.deepEqual(providerCalls, ["credentials", "retrieve", "link"]);
    assert.equal(audits[0].action, "billing.connect.onboarding_link_created");
  });
}

test("a completed-cutover replacement keeps source and target manual holds", async () => {
  currentFields.stripeConnectMigrationTargetAccountId = "acct_existing";
  currentFields.stripeConnectMigrationCutoverAt = "2026-08-13T12:00:00.000Z";
  const before = clone(currentFields);
  const response = await onboard(request());
  assert.equal(response.status, 200);
  assert.deepEqual(settingsWrites, []);
  assertLocalPayoutStateUnchanged(before);
  assert.equal(currentFields.stripeConnectMigrationTargetAccountId, before.stripeConnectMigrationTargetAccountId);
  assert.equal(currentFields.stripeConnectMigrationCutoverAt, before.stripeConnectMigrationCutoverAt);
});

test("a prepared replacement is rejected before profile or provider changes", async () => {
  currentFields.stripeConnectMigrationTargetAccountId = "acct_prepared_replacement";
  const before = clone(currentFields);
  const response = await onboard(request());
  assert.equal(response.status, 409);
  assert.deepEqual(currentFields, before);
  assert.deepEqual(providerCalls, []); assert.deepEqual(settingsWrites, []); assert.deepEqual(writes, []);
});

test("new account creation retains the existing daily payout initialization policy", async () => {
  currentFields = {};
  const response = await onboard(request()), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.createdAccount, true);
  assert.deepEqual(providerCalls, ["credentials", "create", "link"]);
  assert.deepEqual(settingsWrites, [{ accountId: "acct_created", tenantId: "fixture_tenant" }]);
  assert.equal(currentFields.stripePayoutCollectionMode, "stripe_automatic");
  assert.equal(currentFields.stripePayoutSchedulePreference, "fastest_available");
  assert.equal(currentFields.stripePayoutScheduleInterval, "daily");
  assert.equal(currentFields.stripePayoutDelayPolicy, "lowest_available");
  assert.equal(currentFields.stripePayoutScheduleStatus, "daily_automatic_configured");
  assert.equal(audits[0].action, "billing.connect.account_created");
});

for (const scenario of ["mismatched_account", "account_read_failure", "link_failure"]) {
  test(`${scenario} never changes an existing account's payout settings`, async () => {
    if (scenario === "mismatched_account") retrievedId = "acct_foreign";
    if (scenario === "account_read_failure") retrieveFails = true;
    if (scenario === "link_failure") linkFails = true;
    const beforeFields = clone(currentFields), beforeProvider = clone(providerSettings);
    const response = await onboard(request());
    assert.equal(response.status, scenario === "mismatched_account" ? 409 : 502);
    assert.deepEqual(settingsWrites, []); assert.deepEqual(providerSettings, beforeProvider);
    assertLocalPayoutStateUnchanged(beforeFields);
    assert.equal(providerCalls.includes("link"), scenario === "link_failure");
  });
}

for (const scenario of ["signed_out", "wrong_role", "foreign_school"]) {
  test(`${scenario} is rejected before any school or provider access`, async () => {
    if (scenario === "signed_out") user = null;
    if (scenario === "wrong_role") canManage = false;
    if (scenario === "foreign_school") allowed = false;
    const response = await onboard(request());
    assert.equal(response.status, scenario === "signed_out" ? 401 : 403);
    assert.equal(centerReads, 0); assert.deepEqual(writes, []);
    assert.deepEqual(providerCalls, []); assert.deepEqual(settingsWrites, []); assert.deepEqual(audits, []);
  });
}
