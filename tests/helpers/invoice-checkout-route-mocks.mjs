import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import approvalModule from "@/lib/stripe-billing-approval";
import targetingModule from "@/lib/app-review-targeting";
import matcherModule from "./matches-prisma-where.ts";
const { matchesPrismaWhere } = matcherModule;
const { stripeBillingApprovalCustomFieldPatch } = approvalModule;
const { APP_REVIEW_PARENT_CONTACT } = targetingModule;

let user, center, family, invoice, details, providers, captured, currentActor, currentDevice, guardianLinked;
let persistedActor, persistedDevice, authorityQueries;
let familyDrafts = [], familyClaims = [], familyResolutions = [], familyInputs = [], captureFamily = false, agencyRows = [];
function reset() {
  familyDrafts = []; familyClaims = []; familyResolutions = []; familyInputs = []; captureFamily = false; agencyRows = [];
  const now = new Date().toISOString();
  user = { id: "fake-director", tenantId: "fake-tenant", email: "fake-director@example.test", role: "CENTER_DIRECTOR", centerIds: ["fake-school"],
    identityTenantId: "fake-tenant", sessionVersion: 7,
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
  authorityQueries = [];
  persistedActor = { id: user.id, tenantId: user.identityTenantId, email: user.email, role: user.role, sessionVersion: 7,
    isActive: true, mustResetPassword: false, staffProfile: { centerId: center.id, center }, accessGrants: [] };
  persistedDevice = { id: "fake-device", userId: user.id, tenantId: user.identityTenantId, revokedAt: null };
}
reset();
const prisma = {
  async $transaction(run, options) { assert.equal(options.isolationLevel, "RepeatableRead"); return run(prisma); },
  invoice: {
    async findUnique({ select }) { assert.ok(select); assert.equal(select.billingAccount.select.family.select.centerId, true);
      return { billingAccountId: "fake-account", billingAccount: { familyId: "fake-family", family: { centerId: "fake-school" } } }; },
    async findFirst({ where }) { details++; assert.equal(where.billingAccountId, "fake-account"); return invoice; },
  },
  center: { async findUnique() { return structuredClone(center); }, async findFirst({ where }) { return matchesPrismaWhere(center, where) ? structuredClone(center) : null; },
    async update() { throw new Error("School config must not be written during provider readiness inspection"); } },
  family: { async findUnique() { return family; }, async findFirst() { return family; } },
  guardian: { async findFirst({ where }) { return guardianLinked && matchesPrismaWhere({ userId: "fake-parent", familyId: family.id, family }, where) ? { id: "fake-guardian" } : null; } },
  user: { async findFirst({ where }) { authorityQueries.push({ model: "user", where }); return currentActor && matchesPrismaWhere(persistedActor, where) ? { id: persistedActor.id } : null; } },
  deviceSession: { async findFirst({ where }) { authorityQueries.push({ model: "deviceSession", where }); return currentDevice && matchesPrismaWhere(persistedDevice, where) ? { id: persistedDevice.id } : null; } },
  billingAccount: { async upsert() { throw new Error("No synthetic account creation expected"); },
    async findFirst({ where, include }) { const account = { ...family.billingAccount, family: { ...family, _count: { children: 0 } }, invoices: [], autopayPlaceholder: false };
      if (include) details++; return matchesPrismaWhere(account, where) ? structuredClone(account) : null; },
    async findUnique() { return family.billingAccount; } },
  payment: { async findMany({ where }) { return familyDrafts.filter(row => matchesPrismaWhere(row, where)); } },
  ledgerEntry: { async findMany() { return agencyRows; } },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { return structuredClone(user); }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; },
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
const familyServiceModule = await import("@/lib/family-payment-service");
const realFamilyService = familyServiceModule.default ?? familyServiceModule;
mock.module("@/lib/family-payment-service", { namedExports: { ...realFamilyService,
  async startFamilyPayment(input) { familyInputs.push(input); return captureFamily
    ? { ok: true, statusCode: 200, paymentId: "fake-payment", stripeSessionId: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake" }
    : realFamilyService.startFamilyPayment(input); },
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
  reset(); user.role = persistedActor.role = "PLATFORM_OWNER";
  user.identityTenantId = persistedActor.tenantId = persistedDevice.tenantId = "platform-tenant";
  const response = await direct.POST(request({ invoiceId: "fake-invoice" }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(captured[0].topology.tenantId, "fake-tenant"); assert.ok(providers.every(call => call.tenantId === "fake-tenant"));
  assert.equal(await captured[0].authorizeRequest(), true);
  assert.equal(await captured[0].authorize(prisma), true);
  assert.ok(authorityQueries.every(query => query.where.tenantId === "platform-tenant"));
  persistedDevice.tenantId = "fake-tenant"; assert.equal(await captured[0].authorize(prisma), false);
  persistedDevice.tenantId = "platform-tenant"; currentActor = false; assert.equal(await captured[0].authorize(prisma), false);
});

test("fresh resolver changes cannot silently replace invoice actor identity or session version", async () => {
  for (const key of ["identityTenantId", "sessionVersion"]) {
    reset(); assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 200);
    user[key] = key === "sessionVersion" ? 8 : "changed-identity";
    assert.equal(await captured[0].authorizeRequest(), false);
  }
});

test("real transactional claim denies revoked invoice actor before payment creation", async () => {
  for (const change of ["version", "role", "password", "device", "assignment", "family"]) {
    reset(); assert.equal((await direct.POST(request({ invoiceId: "fake-invoice" }))).status, 200);
    if (change === "version") persistedActor.sessionVersion++;
    if (change === "role") persistedActor.role = "TEACHER";
    if (change === "password") persistedActor.mustResetPassword = true;
    if (change === "device") persistedDevice.revokedAt = new Date();
    if (change === "assignment") persistedActor.staffProfile = null;
    if (change === "family") family.centerId = "other-school";
    let writes = 0;
    const tx = { ...prisma, async $queryRaw() { return [{ id: "fake-account", balanceCents: 10000 }]; },
      payment: { async create() { writes++; throw new Error("Unauthorized payment creation"); } } };
    const result = await (claimModule.default ?? claimModule).createStripePaymentClaim({
      billingAccountId: "fake-account", scope: "invoice_collection", invoiceId: "fake-invoice",
      authorize: captured[0].authorize, paymentData: { amountCents: 10000, status: "DRAFT", provider: "stripe" },
      database: { async $transaction(run) { return run(tx); } },
    });
    assert.equal(result.created, false); assert.equal(result.reason, "payment_authority_changed"); assert.equal(writes, 0);
    assert.ok(providers.every(call => ["key-read", "account-read"].includes(call.operation)));
  }
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

function parentFamily() {
  user.role = persistedActor.role = "PARENT_GUARDIAN"; user.id = persistedActor.id = persistedDevice.userId = "fake-parent";
}
for (const kind of ["unknown-no-session", "unknown-known-session", "pending-no-session", "created-no-session"]) test(`family Checkout routes ${kind} to its correct recovery boundary`, async () => {
  reset(); parentFamily();
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
  if (kind === "unknown-known-session") {
    assert.equal(familyResolutions.length, 0); assert.equal(familyClaims.length, 2);
    assert.ok(familyClaims.every(claim => claim.existingPaymentId === "fake-original-payment" && claim.scope === "family_balance"));
    assert.ok(familyClaims.every(claim => claim.paymentData.amountCents === 10000));
  } else { assert.equal(familyResolutions.length, 0); assert.equal(familyClaims.length, 0); }
  assert.equal(familyDrafts.length, 1); // The fake claim boundary refuses writes/provider submission.
});

const familyBody = () => ({ familyId: "fake-family", billingAccountId: "fake-account", method: "card_checkout", amountCents: 10000 });
test("family Checkout preserves exact bank verification metadata for downstream receipts", async () => {
  for (const method of ["card_checkout", "instant_bank_checkout", "ach_checkout"]) {
    reset(); parentFamily(); captureFamily = true;
    const response = await familyPayment.POST(request({ ...familyBody(), method }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const input = familyInputs[0], expected = null;
    assert.equal(input.request.bankAccountVerificationMethod, expected);
    assert.equal(input.request.metadata.bankAccountVerificationMethod, expected ?? "");
    assert.equal(input.fields.bankAccountVerificationMethod, expected);
  }
});
test("family route denies foreign topology and stale actor before financial detail or provider inspection", async () => {
  for (const change of ["tenant", "family", "role", "version", "device", "assignment", "inactive"]) {
    reset(); captureFamily = true;
    if (change === "tenant") center.organization.tenantId = "foreign-tenant";
    if (change === "family") family.centerId = "foreign-school";
    if (change === "role") persistedActor.role = "TEACHER";
    if (change === "version") persistedActor.sessionVersion++;
    if (change === "device") persistedDevice.revokedAt = new Date();
    if (change === "assignment") persistedActor.staffProfile = null;
    if (change === "inactive") persistedActor.isActive = false;
    const response = await familyPayment.POST(request(familyBody()));
    assert.equal(response.status, 403, change); assert.equal(details, 0, change); assert.equal(providers.length, 0); assert.equal(familyInputs.length, 0);
  }
});
test("family route input and CSRF failures never reach financial or provider work", async () => {
  for (const body of [null, [], {}, { ...familyBody(), method: "typo" }, { ...familyBody(), amountCents: "10000junk" },
    { ...familyBody(), amountCents: 10000.4 }, { ...familyBody(), amountCents: -1 }, { ...familyBody(), amountDollars: "100" },
    { ...familyBody(), billingAccountId: {} }, { ...familyBody(), familyId: "wrong-family" }]) {
    reset(); captureFamily = true; const response = await familyPayment.POST(request(body));
    assert.ok([400, 403].includes(response.status)); assert.equal(details, 0); assert.equal(providers.length, 0); assert.equal(familyInputs.length, 0);
  }
  reset(); assert.equal((await familyPayment.POST(request(familyBody(), "https://foreign.example.test"))).status, 403);
  assert.equal(details, 0); assert.equal(providers.length, 0);
});
test("family route parent cannot use saved methods; historical one-time balance still works", async () => {
  reset(); parentFamily(); captureFamily = true;
  assert.equal((await familyPayment.POST(request({ ...familyBody(), method: "saved_method" }))).status, 400); assert.equal(details, 0);
  const response = await familyPayment.POST(request(familyBody())); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(familyInputs[0].kind, "checkout"); assert.equal(familyInputs[0].request.metadata.source, "parent_portal");
  assert.equal(await familyInputs[0].authorizeRequest(), true); assert.equal(await familyInputs[0].authorize(prisma), true);
  guardianLinked = false; assert.equal(await familyInputs[0].authorizeRequest(), false); assert.equal(await familyInputs[0].authorize(prisma), false);
});
test("family route uses selected target tenant and current identity/device authority", async () => {
  reset(); captureFamily = true; user.role = persistedActor.role = "PLATFORM_OWNER";
  user.identityTenantId = persistedActor.tenantId = persistedDevice.tenantId = "platform-tenant";
  const response = await familyPayment.POST(request(familyBody())); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const input = familyInputs[0]; assert.equal(input.topology.tenantId, "fake-tenant"); assert.ok(providers.every(call => call.tenantId === "fake-tenant"));
  assert.equal(await input.authorizeRequest(), true); assert.equal(await input.authorize(prisma), true);
  user.deviceSessionId = "changed-device"; assert.equal(await input.authorizeRequest(), false);
  persistedDevice.tenantId = "fake-tenant"; assert.equal(await input.authorize(prisma), false);
});
test("family collection rechecks amount responsibility and saved method identity inside claim", async () => {
  for (const change of ["balance", "agency", "family", "email", "school", "account", "approval", "role", "device"]) {
    reset(); captureFamily = true; assert.equal((await familyPayment.POST(request(familyBody()))).status, 200);
    if (change === "balance") family.billingAccount.balanceCents = 5000;
    if (change === "agency") agencyRows = [{ type: "subsidy_charge", sourceSystem: "subsidy_agency", amountCents: 5000 }];
    if (change === "family") family.centerId = "changed-school";
    if (change === "email") family.billingEmail = "changed@example.test";
    if (change === "school") center.name = "Changed school";
    if (change === "account") center.customFields.stripeConnectAccountId = "acct_changed";
    if (change === "approval") center.customFields.livePaymentsEnabled = false;
    if (change === "role") persistedActor.role = "TEACHER";
    if (change === "device") persistedDevice.revokedAt = new Date();
    assert.equal(await familyInputs[0].authorize(prisma), false, change);
  }
});
test("family return paths keep an internal destination and one server payment identity", async () => {
  for (const path of ["/\\foreign.example.test/path", "//foreign.example.test/path", "/parents\u0001", "/parents?payment=forged&familyPayment=forged&session_id=forged#billing"]) {
    reset(); parentFamily(); captureFamily = true;
    assert.equal((await familyPayment.POST(request({ ...familyBody(), returnPath: path }))).status, 200);
    const href = familyInputs[0].request.successUrl, url = new URL(href); assert.equal(url.origin, "https://thebeesuite.io");
    assert.deepEqual(url.searchParams.getAll("familyPayment"), [realFamilyService.FAMILY_PAYMENT_ID_TOKEN]);
    assert.deepEqual(url.searchParams.getAll("payment"), ["success"]); assert.deepEqual(url.searchParams.getAll("session_id"), ["{CHECKOUT_SESSION_ID}"]);
    assert.ok(!href.includes("forged"));
  }
});


test("all wallet entry points prove direct Stripe fees and persist neutral wallet intent", async () => {
  const previous = process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT;
  process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT = "false";
  try {
    for (const kind of ["direct", "signed", "family"]) {
      reset(); captureFamily = true;
      const response = kind === "direct"
        ? await direct.POST(request({ invoiceId: "fake-invoice", paymentMethodCategory: "link_bank" }))
        : kind === "signed"
          ? await signed.POST(request({ invoiceId: "fake-invoice", token: token(), paymentMethodCategory: "link_bank" }))
          : await familyPayment.POST(request({ familyId: "fake-family", amountCents: 10000, method: "instant_bank_checkout" }));
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      assert.ok(providers.some(call => call.operation === "account-read"));
      const input = kind === "family" ? familyInputs[0] : captured[0];
      if (kind === "direct") { assert.equal(input.request.metadata.collectionMode, "director_instant_bank_checkout"); assert.equal(input.fields.collectionMode, "director_instant_bank_checkout"); }
      assert.equal(input.request.paymentMethodCategory, "link");
      assert.equal(input.request.metadata.paymentMethodCategory, "link");
      assert.equal(input.request.metadata.stripeFeesCollector, "stripe");
      assert.equal(input.request.metadata.schoolProcessingFeeAmountCents, "0");
      assert.equal(input.request.metadata.parentProcessingRecoveryAmountCents, "0");
      assert.equal(input.request.metadata.bankAccountVerificationMethod, "");
      assert.equal(input.request.amountCents, 10000);
    }
  } finally {
    if (previous === undefined) delete process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT;
    else process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT = previous;
  }
});
