import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";

const clone = value => structuredClone(value);
const baseFields = {
  stripeConnectAccountId: "acct_school_a",
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripePayoutRequirementFields: [],
  stripePayoutBankLast4: "1234",
  stripePayoutBankDefaultConfirmed: true,
  unrelatedSetting: "preserve",
};
let currentFields, user, allowed, retrievedId, retrieveFails, linkFails, changeDuringLink;
let bankReadFails, bankReadThrows, bankPresent, links, bankReads, writes, audits;
beforeEach(() => {
  currentFields = clone(baseFields);
  user = { tenantId: "tenant_a", primaryCenterId: "school_a" };
  allowed = true; retrievedId = "acct_school_a"; retrieveFails = false;
  linkFails = false; changeDuringLink = false;
  bankReadFails = false; bankReadThrows = false; bankPresent = true;
  links = []; bankReads = 0; writes = []; audits = [];
});
mock.module("@/lib/auth", { namedExports: {
  getCurrentUser: async () => user,
  canManageBilling: () => true, canManageOperations: () => true,
  canAccessCenter: (_user, id) => allowed && id === "school_a",
} });
mock.module("@/lib/prisma", { namedExports: { prisma: { center: {
  findUnique: async () => ({ id: "school_a", name: "School A", customFields: clone(currentFields) }),
  update: async () => { throw Error("Unconditional writes are forbidden"); },
  updateMany: async input => {
    assert.equal(input.where.id, "school_a");
    if (JSON.stringify(input.where.customFields.equals) !== JSON.stringify(currentFields)) return { count: 0 };
    writes.push(clone(input)); currentFields = clone(input.data.customFields);
    return { count: 1 };
  },
} } } });
mock.module("@/lib/audit", { namedExports: { writeAuditLog: async (_user, entry) => audits.push(entry) } });
mock.module("@/lib/payment-redirect-security", { namedExports: { getSecurePaymentAppBaseUrl: () => "https://thebeesuite.io" } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });
mock.module("@/lib/integrations", { namedExports: {
  getStripeSecretKey: async () => "synthetic_configured",
  readStripeConnectedAccountId: fields => fields.stripeConnectAccountId,
  retrieveStripeConnectedAccount: async (id, input) => {
    assert.equal(id, "acct_school_a"); assert.equal(input.tenantId, "tenant_a");
    if (retrieveFails) throw Error("Synthetic provider timeout");
    return { ok: true, configured: true, account: {
      id: retrievedId, livemode: true, dashboard: "full", chargesEnabled: true,
      payoutsEnabled: true, detailsSubmitted: true, requirementFields: [], currentlyDueRequirementFields: [],
      pendingVerificationFields: [], merchantCapabilityStatus: "active", merchantPayoutCapabilityStatus: "active",
    } };
  },
  createStripeAccountLink: async input => {
    links.push(input);
    if (changeDuringLink) currentFields = { ...currentFields, stripeConnectAccountId: "acct_replacement", cutoverNote: "keep" };
    return linkFails ? { ok: false, configured: true, error: "Synthetic link rejected" }
      : { ok: true, url: "https://connect.stripe.com/synthetic" };
  },
  listStripeConnectedAccountPayoutBanks: async input => {
    assert.equal(input.accountId, "acct_school_a"); assert.equal(input.tenantId, "tenant_a"); bankReads++;
    if (bankReadThrows) throw Error("Synthetic bank lookup timeout");
    if (bankReadFails) return { ok: false, configured: true, error: "Synthetic bank lookup rejected", banks: [], defaultBank: null };
    const bank = { bankName: "Synthetic Bank", last4: "9876", defaultForCurrency: true, status: "new", currency: "usd" };
    return { ok: true, configured: true, banks: bankPresent ? [bank] : [], defaultBank: bankPresent ? bank : null };
  },
} });
const { GET: refresh } = await import("../../src/app/api/billing/connect/refresh/route.ts");
const { GET: status } = await import("../../src/app/api/billing/connect/status/route.ts");
const request = path => new NextRequest("https://thebeesuite.io" + path);
const refreshRequest = () => request("/api/billing/connect/refresh?centerId=school_a");
const statusRequest = () => request("/api/billing/connect/status?centerId=school_a");

test("an expired link is recreated for the same verified school and preserves unrelated settings", async () => {
  const response = await refresh(refreshRequest());
  assert.equal(response.headers.get("location"), "https://connect.stripe.com/synthetic");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(links.length, 1); assert.equal(links[0].accountId, "acct_school_a");
  assert.equal(new URL(links[0].returnUrl).searchParams.get("center"), "school_a");
  assert.equal(new URL(links[0].refreshUrl).searchParams.get("centerId"), "school_a");
  assert.equal(currentFields.unrelatedSetting, "preserve"); assert.equal(writes.length, 1);
});

test("refresh does not open a link for a mismatched retrieved account", async () => {
  retrievedId = "acct_other_school";
  const response = await refresh(refreshRequest());
  assert.match(response.headers.get("location"), /stripeConnect=refresh_failed/);
  assert.equal(links.length, 0); assert.equal(writes.length, 0);
});

test("a user outside the school's scope cannot refresh or inspect its payout bank", async () => {
  allowed = false;
  const refreshed = await refresh(refreshRequest());
  assert.match(refreshed.headers.get("location"), /stripeConnect=forbidden/);
  const checked = await status(statusRequest());
  assert.equal(checked.status, 403); assert.equal((await checked.json()).ok, false);
  assert.equal(links.length, 0); assert.equal(bankReads, 0); assert.equal(writes.length, 0);
});

test("refresh recovers from a provider timeout without creating a link or writing cached settings", async () => {
  retrieveFails = true;
  const response = await refresh(refreshRequest());
  assert.match(response.headers.get("location"), /stripeConnect=refresh_failed/);
  assert.equal(links.length, 0); assert.equal(writes.length, 0);
});

test("a concurrent cutover survives both a successful and a rejected stale link", async () => {
  for (const failed of [false, true]) {
    currentFields = clone(baseFields); writes = []; audits = [];
    changeDuringLink = true; linkFails = failed;
    const response = await refresh(refreshRequest());
    assert.match(response.headers.get("location"), /stripeConnect=connection_changed/);
    assert.equal(currentFields.stripeConnectAccountId, "acct_replacement");
    assert.equal(currentFields.cutoverNote, "keep"); assert.equal(writes.length, 0); assert.equal(audits.length, 0);
  }
});

test("fresh payout status rejects account mismatches before any bank read or sync", async () => {
  retrievedId = "acct_other_school";
  const response = await status(statusRequest()); const payload = await response.json();
  assert.equal(response.status, 409); assert.equal(payload.ok, false);
  assert.equal(bankReads, 0); assert.equal(writes.length, 0);
});

test("failed and timed-out bank checks cannot return cached payout readiness", async () => {
  for (const throws of [false, true]) {
    bankReadFails = !throws; bankReadThrows = throws;
    const response = await status(statusRequest()); const payload = await response.json();
    assert.equal(response.status, 502); assert.equal(payload.ok, false);
    assert.equal(payload.centerId, "school_a"); assert.equal(typeof payload.payoutBankError, "string");
    assert.equal(payload.flow, undefined); assert.equal(writes.length, 0);
    assert.equal(currentFields.stripePayoutBankLast4, "1234");
  }
});

test("a successful empty bank list clears stale confirmation and requires a payout bank", async () => {
  bankPresent = false;
  const response = await status(statusRequest()); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.flow.stage, "payout_bank_required");
  assert.equal(payload.flow.payoutBankConfirmed, false); assert.equal(currentFields.stripePayoutBankLast4, null);
  assert.equal(currentFields.stripePayoutBankDefaultConfirmed, false);
});

test("fresh bank confirmation is synced for the same school", async () => {
  const response = await status(statusRequest()); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.flow.payoutBankConfirmed, true);
  assert.equal(payload.payoutBank.last4, "9876"); assert.equal(currentFields.unrelatedSetting, "preserve");
});
