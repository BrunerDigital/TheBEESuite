import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let user = null, allowed = true, targetId = "acct_target", links = [];
const center = { id: "school_a", customFields: {
  stripeConnectedAccountId: "acct_source",
  stripeConnectMigrationSourceAccountId: "acct_source",
  stripeConnectMigrationTargetAccountId: "acct_target",
}, organization: { tenantId: "tenant_a" } };
mock.module("@/lib/auth", { namedExports: {
  getCurrentUser: async () => user,
  canManageBilling: () => true, canManageOperations: () => true,
  canAccessCenter: (_user, id) => allowed && id === "school_a",
} });
mock.module("@/lib/prisma", { namedExports: { prisma: { center: {
  findUnique: async () => center,
  update: async () => { throw Error("Unexpected write"); },
} } } });
mock.module("@/lib/audit", { namedExports: { writeAuditLog: async () => {} } });
mock.module("@/lib/payment-redirect-security", { namedExports: {
  getSecurePaymentAppBaseUrl: () => "https://thebeesuite.io",
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });
mock.module("@/lib/integrations", { namedExports: {
  readStripeConnectedAccountId: fields => fields.stripeConnectedAccountId,
  retrieveStripeConnectedAccount: async id => {
    assert.equal(id, "acct_target");
    return { ok: true, account: { id: targetId, feesCollector: "stripe", lossesCollector: "stripe" } };
  },
  listStripeConnectedAccountPayoutBanks: async () => { throw Error("Unexpected bank read"); },
  createStripeAccountLink: async input => { links.push(input); return { ok: true, url: "https://connect.stripe.com/synthetic" }; },
} });
mock.module("@/lib/corporate-stripe-verification", { namedExports: {
  readCorporateStripeVerificationTarget: () => null,
  authorizeCorporateStripeVerificationCenter: async () => ({ ok: false }),
  corporateStripePayoutBankIsConfirmed: () => false,
  corporateStripeVerificationBindingIsValid: () => false,
  stripeVerificationState: () => "stripe_verification_required",
} });
const { GET: migrationRefresh } = await import("../../src/app/api/billing/connect/migration/refresh/route.ts");
const { GET: connectRefresh } = await import("../../src/app/api/billing/connect/refresh/route.ts");
const request = path => new NextRequest("https://thebeesuite.io" + path);
test("signed-out expired links retain the exact school through login", async () => {
  const migrated = await migrationRefresh(request("/api/billing/connect/migration/refresh?centerId=school_a"));
  assert.equal(new URL(migrated.headers.get("location")).searchParams.get("next"), "/stripe-reauthorization?center=school_a");
  const initial = await connectRefresh(request("/api/billing/connect/refresh?centerId=school_a"));
  assert.equal(new URL(initial.headers.get("location")).searchParams.get("next"), "/billing-settings?center=school_a");
  assert.equal(links.length, 0);
});
test("owner scope and retrieved account ID are checked before a refreshed handoff", async () => {
  user = { tenantId: "tenant_a", primaryCenterId: "school_a" };
  allowed = false;
  let response = await migrationRefresh(request("/api/billing/connect/migration/refresh?centerId=school_a"));
  assert.match(response.headers.get("location"), /forbidden/);
  assert.equal(links.length, 0);
  allowed = true; targetId = "acct_other_school";
  response = await migrationRefresh(request("/api/billing/connect/migration/refresh?centerId=school_a"));
  assert.match(response.headers.get("location"), /refresh_failed/);
  assert.equal(links.length, 0);
  targetId = "acct_target";
  response = await migrationRefresh(request("/api/billing/connect/migration/refresh?centerId=school_a"));
  assert.equal(response.headers.get("location"), "https://connect.stripe.com/synthetic");
  assert.equal(links.length, 1);
  assert.equal(links[0].accountId, "acct_target");
  assert.match(links[0].returnUrl, /center=school_a/);
  assert.match(links[0].refreshUrl, /centerId=school_a/);
  assert.equal(center.customFields.stripeConnectedAccountId, "acct_source");
});
