import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import approvalModule from "@/lib/stripe-billing-approval";
import targetingModule from "@/lib/app-review-targeting";
const { stripeBillingApprovalCustomFieldPatch } = approvalModule;
const { APP_REVIEW_PARENT_CONTACT } = targetingModule;

let user, center, family, invoice, details, providers, captured, currentActor, currentDevice, guardianLinked;
let familyRouteMode = false, familyDrafts = [], familyClaims = [], familyResolutions = [];
function reset() {
  familyRouteMode = false; familyDrafts = []; familyClaims = []; familyResolutions = [];
  const now = new Date().toISOString();
  user = { id: "fake-director", tenantId: "fake-tenant", email: "fake-director@example.test", role: "CENTER_DIRECTOR", centerIds: ["fake-school"],
    deviceSessionId: "fake-device", workspace: { mode: "center", activeCenterId: "fake-school" } };
  center = { id: "fake-school", name: "Fake school", crmLocationId: "Fake school", organization: { tenantId: "fake-tenant",
    tenant: { name: "Fake Tenant", slug: "fake-tenant" }, brand: { name: "Fake Brand", slug: "fake-brand" } }, customFields: {
    stripeConnectAccountId: "acct_fake", stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true,
    stripePayoutRequirementFields: [], stripeMerchantCapabilityStatus: "active", stripeMerchantPayoutCapabilityStatus: "active",
    stripePayoutBankLast4: "1234", stripePayoutBankDefaultConfirmed: true, livePaymentsEnabled: true, tuitionBillingEnabled: true,
    ...stripeBillingApprovalCustomFieldPatch({ approved: true, approvedAt: now, approvedBy: "Fake reviewer", billingPreviewApprovedAt: now, accountingApprovedAt: now, cutoverApprovedAt: now }),
  } };
  family = { id: "fake-family", centerId: "fake-school", name: "Fake Family", billingEmail: "fake-family@example.test", customFields: {},
    guardians: [{ id: "fake-guardian", userId: "fake-parent", fullName: "Fake Guardian", email: "fake-parent@example.test", user: { email: "fake-parent@example.test" } }], children: [],
    billingAccount: { id: "fake-account", familyId: "fake-family", balanceCents: 10000, customFields: {}, ledgerEntries: [] } };
  invoice = { id: "fake-invoice", number: "FAKE-1", billingAccountId: "fake-account", totalCents: 10000, status: "OPEN", customFields: {}, items: [],
    billingAccount: { ...family.billingAccount, family } };
  details = 0; providers = []; captured = []; currentActor = true; currentDevice = true; guardianLinked = true;
}
reset();
const prisma = {
  invoice: {
    async findUnique({ select }) { assert.ok(select); assert.equal(select.billingAccount.select.family.select.centerId, true);
      return { billingAccountId: "fake-account", billingAccount: { familyId: "fake-family", family: { centerId: "fake-school" } } }; },
    async findFirst({ where }) { details++; assert.equal(where.billingAccountId, "fake-account"); return invoice; },
  },
  center: { async findUnique() { return center; }, async findFirst({ where }) { assert.equal(where.organization.tenantId, center.organization.tenantId); return center; },
    async update() { if (familyRouteMode) return center; throw new Error("School config must not be written during provider readiness inspection"); } },
  family: { async findUnique() { return family; }, async findFirst() { return family; } },
  guardian: { async findFirst() { return guardianLinked ? { id: "fake-guardian" } : null; } },
  user: { async findFirst() { return currentActor ? { id: user.id } : null; } },
  deviceSession: { async findFirst() { return currentDevice ? { id: "fake-device" } : null; } },
  billingAccount: { async upsert() { throw new Error("No synthetic account creation expected"); },
    async findFirst() { return { ...family.billingAccount, family: { ...family, _count: { children: 0 } }, invoices: [], autopayPlaceholder: false }; } },
  payment: { async findMany() { return familyDrafts; } },
  ledgerEntry: { async findMany() { return []; } },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { return user; }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; },
  canManageBilling(value) { return ["CENTER_DIRECTOR", "BILLING_ADMIN", "BRAND_ADMIN", "PLATFORM_OWNER"].includes(value.role); },
  canAccessAllCenters(value) { return ["BRAND_ADMIN", "PLATFORM_OWNER"].includes(value.role) && value.workspace?.mode === "all"; },
  canAccessCenter(value, centerId) { return value.centerIds.includes(centerId); },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
mock.module("@/lib/parent-portal-family-scope", { namedExports: {
  async getParentPortalPaymentFamilyScope() { return { ok: guardianLinked, familyId: "fake-family", guardianIds: ["fake-guardian"] }; },
  async getParentPortalFamilyScope() { return { ok: guardianLinked, familyId: "fake-family", guardianIds: ["fake-guardian"] }; },
} });
const integrationModule = await import("@/lib/integrations");
const realIntegrations = integrationModule.default ?? integrationModule;
mock.module("@/lib/integrations", { namedExports: { ...realIntegrations,
  async getStripeSecretKey(context) { providers.push({ operation: "key-read", tenantId: context.tenantId }); return "sk_test_fake"; },
  async getStripeWebhookSecret() { return "whsec_fake"; },
  async retrieveStripeConnectedAccount(id, context) { providers.push({ operation: "account-read", id, tenantId: context.tenantId });
    return { ok: true, configured: true, account: { id, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
      currentlyDue: [], pastDue: [], pendingVerification: [], merchantCapabilityStatus: "active", merchantPayoutCapabilityStatus: "active", feesCollector: "stripe" } }; },
} });
mock.module("@/lib/invoice-checkout-service", { namedExports: {
  async startInvoiceCheckout(input) { captured.push(input); return { ok: true, statusCode: 200, paymentId: "fake-payment", stripeSessionId: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake" }; },
} });
const claimModule = await import("@/lib/stripe-payment-claims");
mock.module("@/lib/stripe-payment-claims", { namedExports: { ...(claimModule.default ?? claimModule),
  async createStripePaymentClaim(input) { familyClaims.push(input); return { created: false, reason: "active_family_balance", blockingPaymentId: "fake-boundary-stop" }; },
} });
mock.module("@/lib/stripe-checkout-drafts", { namedExports: {
  async resolveStripeCheckoutDraftBlocker(input) { familyResolutions.push(input); return { blocked: true, message: "Fake existing session is pending" }; },
} });
const { createPaymentMethodRequestToken } = await import("@/lib/payment-method-request-forms");
const direct = await import("../../src/app/api/billing/checkout-session/route.ts");
const signed = await import("../../src/app/api/billing/payment-method-request/checkout/route.ts");
const familyPayment = await import("../../src/app/api/billing/family-payment/route.ts");
globalThis.fetch = async () => { throw new Error("Unexpected network request in fake route harness"); };
function request(body, origin = "https://thebeesuite.io") { return new NextRequest("https://thebeesuite.io/api/billing/checkout-session", {
  method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
}); }
function token(extra = {}) { return createPaymentMethodRequestToken({ familyId: "fake-family", centerId: "fake-school", tenantId: "fake-tenant", email: "fake-parent@example.test", ...extra }); }

test("foreign invoice stops before full detail for a tenant-wide operator", async () => {
  reset(); user.role = "BRAND_ADMIN"; user.workspace.mode = "all"; center.organization.tenantId = "foreign-tenant";
  const response = await direct.POST(request({ invoiceId: "fake-invoice" }));
  assert.equal(response.status, 404); assert.equal(details, 0); assert.equal(providers.length, 0); assert.equal(captured.length, 0);
});

test("reserved identities stop before shared Checkout for both authenticated and signed links", async () => {
  reset(); user.email = APP_REVIEW_PARENT_CONTACT.email;
  assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 403);
  assert.equal(captured.length, 0); assert.equal(providers.length, 0);
  reset(); assert.equal((await signed.POST(request({ token: token({ email: APP_REVIEW_PARENT_CONTACT.email }), invoiceId: "fake-invoice" }))).status, 403);
  assert.equal(captured.length, 0); assert.equal(providers.length, 0);
  reset(); family.guardians[0].user.email = APP_REVIEW_PARENT_CONTACT.email;
  assert.equal((await signed.POST(request({ token: token(), invoiceId: "fake-invoice" }))).status, 403); assert.equal(captured.length, 0); assert.equal(providers.length, 0);
});

test("untrusted origins, pickup role, unlinked parent and no-charge-only links cannot start checkout", async () => {
  reset(); assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }, "https://evil.example.test"))).status, 403);
  assert.equal((await signed.POST(request({ token: token() }, "https://evil.example.test"))).status, 403);
  user.role = "AUTHORIZED_PICKUP"; assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 403);
  user.role = "PARENT_GUARDIAN"; guardianLinked = false; assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 403);
  assert.equal((await signed.POST(request({ token: token({ intent: "payment_method_reauthorization" }), invoiceId: "fake-invoice" }))).status, 409);
  assert.equal(captured.length, 0); assert.equal(providers.length, 0);
});

test("explicit platform-selected school uses its target tenant for provider and audit input", async () => {
  reset(); user.role = "PLATFORM_OWNER"; user.tenantId = "platform-tenant";
  const response = await direct.POST(request({ invoiceId: "fake-invoice" }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(captured[0].topology.tenantId, "fake-tenant"); assert.ok(providers.every(call => call.tenantId === "fake-tenant"));
  assert.equal(await captured[0].authorize(prisma), true); currentActor = false; assert.equal(await captured[0].authorize(prisma), false);
});

test("both routes preserve canonical customer and distinct return destinations", async () => {
  reset(); const directResponse = await direct.POST(request({ invoiceId: "fake-invoice", paymentMethodCategory: "card", returnPath: "/billing-invoices?tab=open#summary" }));
  assert.equal(directResponse.status, 200, JSON.stringify(await directResponse.clone().json()));
  const directInput = captured[0], signedToken = token();
  const signedResponse = await signed.POST(request({ invoiceId: "fake-invoice", paymentMethodCategory: "card", token: signedToken }));
  assert.equal(signedResponse.status, 200, JSON.stringify(await signedResponse.clone().json())); const signedInput = captured[1];
  assert.deepEqual(directInput.customer, signedInput.customer);
  assert.equal(directInput.keyPrefix, "checkout"); assert.equal(signedInput.keyPrefix, "payment-request-checkout");
  assert.match(directInput.request.successUrl, /billing-invoices\?tab=open&payment=success&invoice=fake-invoice&session_id=\{CHECKOUT_SESSION_ID\}#summary$/);
  assert.ok(signedInput.request.successUrl.includes(encodeURIComponent(signedToken))); assert.equal(signedInput.request.metadata.paymentRequestRecipientEmail, "fake-parent@example.test");
  assert.equal(directInput.request.amountCents, 10000); assert.equal(signedInput.request.amountCents, 10000);
  assert.ok(!JSON.stringify(signedInput.fields).includes(signedToken));
  assert.equal(await signedInput.authorize(prisma), true); family.guardians[0].email = "removed@example.test";
  assert.equal(await signedInput.authorize(prisma), false);
  currentDevice = false; assert.equal(await directInput.authorize(prisma), false);
});

test("ordinary parent invoice checkout remains product-only", async () => {
  reset(); user.role = "PARENT_GUARDIAN"; user.id = "fake-parent";
  assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 409); assert.equal(captured.length, 0); assert.equal(providers.length, 0);
  invoice.customFields = { checkoutPurpose: "product_purchase", itemSummary: "Fake school shirt", productId: "fake-shirt" };
  assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 200);
  assert.equal(captured[0].request.metadata.productId, "fake-shirt"); assert.match(captured[0].request.checkoutBranding.productDescription, /Fake school shirt/);
});

for (const kind of ["unknown-no-session", "unknown-known-session", "pending-no-session", "created-no-session"]) test(`family Checkout routes ${kind} to its correct recovery boundary`, async () => {
  reset(); familyRouteMode = true; user.role = "PARENT_GUARDIAN"; user.id = "fake-parent";
  familyDrafts = [{ id: "fake-original-payment", billingAccountId: "fake-account", amountCents: 10000, provider: "stripe", status: "DRAFT",
    externalIdPlaceholder: "checkout_session_pending", customFields: { paymentScope: "family_balance",
      status: kind === "created-no-session" ? "checkout_created" : kind === "pending-no-session" ? "checkout_pending" : "checkout_submission_unknown",
      stripeCustomerId: "cus_fake", stripeConnectedAccountId: "acct_fake", familyPaymentMethod: "card_checkout", paymentMethodCategory: "card",
      ...(kind === "unknown-known-session" ? { stripeCheckoutSessionId: "cs_fake" } : {}) } }];
  const customerScopeModule = await import("@/lib/stripe-customer-scope");
  const { stripeCustomerCustomFieldPatch } = customerScopeModule.default ?? customerScopeModule;
  family.billingAccount.customFields = stripeCustomerCustomFieldPatch({}, "cus_fake", "acct_fake");
  for (let retry = 0; retry < 2; retry++) {
    const response = await familyPayment.POST(request({ familyId: "fake-family", billingAccountId: "fake-account", method: "card_checkout", amountCents: 10000 }));
    assert.equal(response.status, 409, JSON.stringify(await response.clone().json()));
  }
  if (kind === "unknown-no-session") {
    assert.equal(familyResolutions.length, 0); assert.equal(familyClaims.length, 2);
    assert.ok(familyClaims.every(claim => claim.existingPaymentId === "fake-original-payment" && claim.scope === "family_balance"));
    assert.ok(familyClaims.every(claim => claim.paymentData.amountCents === 10000));
  } else { assert.equal(familyResolutions.length, 2); assert.equal(familyClaims.length, 0); }
  assert.equal(familyDrafts.length, 1); // The fake claim boundary refuses writes/provider submission.
});
