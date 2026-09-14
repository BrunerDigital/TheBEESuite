import assert from "node:assert/strict";
import test from "node:test";
import { FAMILY_PAYMENT_RETRY_MS, familyPaymentAttemptIdentityMatches, familyPaymentAttemptMatches, newFamilyPaymentAttempt } from "../src/lib/family-payment-attempt";

type Input = Parameters<typeof newFamilyPaymentAttempt>[0];
const now = new Date("2026-09-14T00:00:00.000Z");
function fixture(): Extract<Input, { kind: "checkout" }> {
  const topology = { tenantId: "fake-tenant", centerId: "fake-school", familyId: "fake-family", billingAccountId: "fake-account", connectedAccountId: "acct_fake" };
  const metadata = { ...topology, stripeConnectedAccountId: topology.connectedAccountId, stripeCustomerId: "cus_fake", paymentScope: "family_balance",
    invoiceAmountCents: "10000", parentSurchargeAmountCents: "300", checkoutTotalCents: "10300", applicationFeeAmountCents: "100", requestedByUserId: "fake-user" };
  return { topology, kind: "checkout", phase: "submit", now, request: { amountCents: 10300, invoiceAmountCents: 10000, parentSurchargeAmountCents: 300,
    invoiceNumber: "Fake family balance", centerName: "Fake School", customerId: "cus_fake", customerEmail: "fake-family@example.invalid",
    successUrl: "https://thebeesuite.io/parent-portal?payment=success", cancelUrl: "https://thebeesuite.io/parent-portal?payment=cancelled",
    metadata, connectedAccountId: topology.connectedAccountId, applicationFeeAmountCents: 100, paymentMethodCategory: "card", paymentMethodConfigurationId: "pmc_fake",
    tenantId: topology.tenantId, allowPaymentMethodFallback: false, onBehalfOfConnectedAccount: false } };
}
test("family attempts hash complete actual requests without persisting email URLs or raw payload", () => {
  const input = fixture(), attempt = newFamilyPaymentAttempt(input);
  assert.equal(familyPaymentAttemptMatches(attempt, newFamilyPaymentAttempt(fixture()), now), true);
  assert.equal(attempt.requestDigest.length, 64);
  assert.doesNotMatch(JSON.stringify(attempt), /example.invalid|https:|Fake family balance|pmc_fake|requestedByUserId/);
  const reordered = fixture(); reordered.request.metadata = Object.fromEntries(Object.entries(reordered.request.metadata).reverse());
  assert.equal(newFamilyPaymentAttempt(reordered).requestDigest, attempt.requestDigest);
});
test("changed provider parameters never match an existing family attempt", () => {
  const original = newFamilyPaymentAttempt(fixture());
  for (const patch of [{ customerEmail: "new@example.invalid" }, { invoiceNumber: "Changed family" }, { centerName: "Changed school" },
    { successUrl: "https://thebeesuite.io/parent-portal?changed=true" }, { cancelUrl: "https://thebeesuite.io/billing-invoices" },
    { paymentMethodConfigurationId: "pmc_changed" }, { paymentMethodCategory: "ach" as const }, { onBehalfOfConnectedAccount: true }]) {
    const input = fixture(); Object.assign(input.request, patch); assert.equal(familyPaymentAttemptMatches(original, newFamilyPaymentAttempt(input), now), false);
  }
  const actor = fixture(); actor.request.metadata.requestedByUserId = "other-user";
  assert.equal(familyPaymentAttemptMatches(original, newFamilyPaymentAttempt(actor), now), false);
});
test("family retry deadline stays original and cannot be renewed past 23 hours", () => {
  const original = newFamilyPaymentAttempt(fixture()), later = new Date(now.getTime() + FAMILY_PAYMENT_RETRY_MS - 1);
  const candidate = newFamilyPaymentAttempt({ ...fixture(), now: later });
  assert.equal(familyPaymentAttemptMatches(original, candidate, later), true);
  assert.equal(familyPaymentAttemptMatches(original, candidate, new Date(later.getTime() + 1)), false);
  assert.equal(familyPaymentAttemptMatches({ ...original, retryUntil: candidate.retryUntil }, candidate, later), false);
  assert.equal(familyPaymentAttemptMatches(original, candidate, new Date(now.getTime() - 1)), false);
  assert.equal(familyPaymentAttemptMatches({}, candidate, now), false);
  assert.equal(familyPaymentAttemptIdentityMatches(original, candidate), true, "Identity may support read-only known-object retrieval after submission window");
});
test("family preparation binds Customer fields and exact target before any provider call", () => {
  const input = fixture(); input.phase = "prepare"; delete input.request.customerId; input.request.metadata.stripeCustomerId = "";
  assert.throws(() => newFamilyPaymentAttempt(input), /incomplete/);
  input.customer = { email: "fake-family@example.invalid", name: "Fake Family", tenantId: input.topology.tenantId, connectedAccountId: input.topology.connectedAccountId,
    metadata: { tenantId: input.topology.tenantId, centerId: input.topology.centerId, familyId: input.topology.familyId, billingAccountId: input.topology.billingAccountId, stripeConnectedAccountId: input.topology.connectedAccountId! } };
  const original = newFamilyPaymentAttempt(input); assert.equal(original.customerId, null);
  input.customer.email = "changed@example.invalid";
  assert.equal(familyPaymentAttemptMatches(original, newFamilyPaymentAttempt(input), now), false);
  input.customer.metadata!.familyId = "foreign"; assert.throws(() => newFamilyPaymentAttempt(input), /does not match/);
});
test("unscoped inconsistent credential-bearing and fallback family requests fail closed", () => {
  for (const change of ["tenant", "family", "customer", "payment-id", "invoice-id", "scope", "amount", "fee", "fraction", "fallback", "credentials", "key"] as const) {
    const input = fixture();
    if (change === "tenant") input.request.tenantId = "foreign";
    if (change === "family") input.request.metadata.familyId = "foreign";
    if (change === "customer") input.request.metadata.stripeCustomerId = "cus_other";
    if (change === "payment-id") input.request.metadata.paymentId = "mutable-id";
    if (change === "invoice-id") input.request.metadata.invoiceId = "unrelated-invoice";
    if (change === "scope") input.request.metadata.paymentScope = "invoice";
    if (change === "amount") input.request.amountCents++;
    if (change === "fee") input.request.applicationFeeAmountCents = 10001;
    if (change === "fraction") input.request.invoiceAmountCents = 10000.1;
    if (change === "fallback") input.request.allowPaymentMethodFallback = true;
    if (change === "credentials") Object.assign(input.request, { credentials: {} });
    if (change === "key") Object.assign(input.request, { idempotencyKey: "mutable" });
    assert.throws(() => newFamilyPaymentAttempt(input), /Family/, change);
  }
});
test("saved-method attempts require exact customer and payment-method identity", () => {
  const base = fixture();
  const input: Extract<Input, { kind: "saved_method" }> = { topology: base.topology, phase: "submit", kind: "saved_method", now,
    request: { amountCents: 10300, invoiceAmountCents: 10000, parentSurchargeAmountCents: 300, invoiceNumber: "Fake balance", centerName: "Fake School",
      customerId: "cus_fake", paymentMethodId: "pm_fake", paymentMethodType: "card", customerEmail: "fake-family@example.invalid", metadata: base.request.metadata,
      connectedAccountId: base.topology.connectedAccountId, applicationFeeAmountCents: 100, tenantId: base.topology.tenantId } };
  const original = newFamilyPaymentAttempt(input); input.request.paymentMethodId = "pm_other";
  assert.equal(familyPaymentAttemptMatches(original, newFamilyPaymentAttempt(input), now), false);
  input.request.paymentMethodId = ""; assert.throws(() => newFamilyPaymentAttempt(input), /invalid/);
});
