import { familyCheckoutSessionIdentityMatches } from "../src/lib/family-payment-receipt";
import assert from "node:assert/strict";
import test from "node:test";
import { parentCheckoutResumeCandidate, parentCheckoutResumeReceipt, resumeParentCheckout, type ParentCheckoutResumeSnapshot } from "../src/lib/parent-checkout-resume";
import { parentPaymentStatus } from "../src/lib/parent-payment-status";
import type { StripeCheckoutSessionSnapshot } from "../src/lib/integrations";

function fixture() {
  const topology = { tenantId: "tenant_test", centerId: "center_test", familyId: "family_test", billingAccountId: "account_test", connectedAccountId: "acct_test" };
  const metadata = { tenantId: topology.tenantId, centerId: topology.centerId, familyId: topology.familyId, billingAccountId: topology.billingAccountId,
    paymentScope: "family_balance", paymentId: "payment_test", stripeConnectedAccountId: "acct_test", stripeCustomerId: "cus_synthetic123", invoiceAmountCents: "1000",
    checkoutTotalCents: "1000", parentSurchargeAmountCents: "0", applicationFeeAmountCents: "0", feeDisclosureVersion: "v1", requestedPaymentMethodCategory: "card",
    paymentMethodCategory: "card", source: "parent_portal", collectionMode: "parent_card_checkout" };
  const snapshot: ParentCheckoutResumeSnapshot = { topology, customerId: "cus_synthetic123", familyName: "Synthetic", collectableCents: 1000, canAcceptPayments: true,
    payments: [{ id: "payment_test", billingAccountId: "account_test", status: "DRAFT", provider: "stripe", amountCents: 1000, externalIdPlaceholder: "cs_test",
      customFields: { ...metadata, stripeCustomerConnectedAccountId: "acct_test", status: "checkout_created", stripeCheckoutSessionId: "cs_test" } }] };
  const session: StripeCheckoutSessionSnapshot = { id: "cs_test", url: "https://checkout.stripe.com/c/pay/cs_test", status: "open", paymentStatus: "unpaid",
    paymentIntentId: null, paymentIntentStatus: null, amountTotalCents: 1000,
    raw: { id: "cs_test", object: "checkout.session", mode: "payment", client_reference_id: "Synthetic family payment", currency: "usd", livemode: false,
      customer: "cus_synthetic123", amount_total: 1000, metadata, status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_test", expires_at: Math.floor(Date.now()/1000)+3600 } };
  return { snapshot, session };
}

test("reproduces returned-parent blocker and safely resumes exactly the existing checkout", async () => {
  const { snapshot, session } = fixture();
  const blocked = parentPaymentStatus(snapshot.payments).accountPaymentBlocker;
  assert.equal(blocked?.phase, "payment_pending"); assert.equal(blocked?.blocksInvoicePayments, true);
  assert.ok(parentCheckoutResumeCandidate(snapshot), "candidate valid");
  assert.ok(familyCheckoutSessionIdentityMatches({session,sessionId:"cs_test",paymentId:"payment_test",customerId:snapshot.customerId!,topology:snapshot.topology,originalPrincipalCents:1000,invoiceNumber:"Synthetic family payment"}), "identity valid");
  assert.ok(parentCheckoutResumeReceipt(snapshot, session), "receipt valid");
  let reads = 0, retrieves = 0;
  const result = await resumeParentCheckout({ read: async () => { reads++; return structuredClone(snapshot); }, retrieve: async input => {
    retrieves++; assert.deepEqual(input, { sessionId: "cs_test", connectedAccountId: "acct_test", tenantId: "tenant_test" }); return { ok: true, session };
  } });
  assert.deepEqual(result, { ok: true, paymentId: "payment_test", stripeSessionId: "cs_test", url: session.url });
  assert.equal(reads, 2); assert.equal(retrieves, 1);
  assert.equal(snapshot.payments[0].status, "DRAFT");
});

for (const [name, mutate] of Object.entries({
  "ACH processing": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, status: "paid_processing", stripePaymentIntentStatus: "processing", paymentMethodCategory: "ach" }; },
  "unknown submission": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, submissionStateUnknownAt: "2026-10-16" }; },
  "competing attempt": (s: ParentCheckoutResumeSnapshot) => { s.payments.push({ ...s.payments[0], id: "other" }); },
  "school not ready": (s: ParentCheckoutResumeSnapshot) => { s.canAcceptPayments = false; },
  "balance reduced": (s: ParentCheckoutResumeSnapshot) => { s.collectableCents = 999; },
  "foreign tenant": (s: ParentCheckoutResumeSnapshot) => { s.topology.tenantId = "foreign"; },
  "Connect cutover": (s: ParentCheckoutResumeSnapshot) => { s.topology.connectedAccountId = "acct_new"; },
  "customer changed": (s: ParentCheckoutResumeSnapshot) => { s.customerId = "cus_new"; },
  "wrong session reference": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].externalIdPlaceholder = "cs_other"; },
  "invoice attempt": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, invoiceId: "invoice_test" }; },
})) test(`${name} remains blocked before provider access`, async () => {
  const { snapshot } = fixture(); mutate(snapshot); assert.equal(parentCheckoutResumeCandidate(snapshot), null);
  assert.equal(await resumeParentCheckout({ read: async () => snapshot, retrieve: async () => { throw new Error("must not call provider"); } }), null);
});

for (const [name, mutate] of Object.entries({
  "processing intent": (s: StripeCheckoutSessionSnapshot) => { s.paymentIntentId = "pi_test"; s.paymentIntentStatus = "processing"; },
  "completed checkout": (s: StripeCheckoutSessionSnapshot) => { s.status = "complete"; },
  "paid checkout": (s: StripeCheckoutSessionSnapshot) => { s.paymentStatus = "paid"; },
  "expired checkout": (s: StripeCheckoutSessionSnapshot) => { (s.raw as Record<string, unknown>).expires_at = 1; },
  "wrong provider identity": (s: StripeCheckoutSessionSnapshot) => { s.id = "cs_other"; },
  "wrong principal": (s: StripeCheckoutSessionSnapshot) => { ((s.raw as Record<string, unknown>).metadata as Record<string, unknown>).invoiceAmountCents = "999"; },
  "wrong amount": (s: StripeCheckoutSessionSnapshot) => { s.amountTotalCents = 1001; },
  "inconsistent raw status": (s: StripeCheckoutSessionSnapshot) => { (s.raw as Record<string, unknown>).status = "complete"; },
  "inconsistent URL": (s: StripeCheckoutSessionSnapshot) => { s.url = "https://other.example/"; },
  "unsafe URL": (s: StripeCheckoutSessionSnapshot) => { s.url = "javascript:alert(1)"; (s.raw as Record<string, unknown>).url = s.url; },
})) test(`${name} never yields a redirect`, () => { const { snapshot, session } = fixture(); mutate(session); assert.equal(parentCheckoutResumeReceipt(snapshot, session), null); });

for (const [name, change] of Object.entries({
  "access revoked": () => null,
  "webhook advanced payment": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, status: "paid_processing" }; return s; },
  "new competing claim": (s: ParentCheckoutResumeSnapshot) => { s.payments.push({ ...s.payments[0], id: "other" }); return s; },
  "balance changed": (s: ParentCheckoutResumeSnapshot) => { s.collectableCents = 0; return s; },
})) test(`${name} during provider read prevents resume`, async () => {
  const { snapshot, session } = fixture(); let reads = 0;
  assert.equal(await resumeParentCheckout({ read: async () => ++reads === 1 ? structuredClone(snapshot) : change(structuredClone(snapshot)), retrieve: async () => ({ ok: true, session }) }), null);
});

test("unavailable provider leaves the claim held", async () => { const { snapshot } = fixture(); assert.equal(await resumeParentCheckout({ read: async () => snapshot, retrieve: async () => ({ ok: false }) }), null); });

for (const [name, mutate] of Object.entries({
  "stored paid receipt": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, stripeCheckoutPaymentStatus: "paid" }; },
  "stored complete session": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, stripeCheckoutSessionStatus: "complete" }; },
  "non-finite collectable": (s: ParentCheckoutResumeSnapshot) => { s.collectableCents = Infinity; },
  "disputed attempt": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, stripeDisputeLedgerActive: true }; },
  "returned attempt": (s: ParentCheckoutResumeSnapshot) => { s.payments[0].customFields = { ...s.payments[0].customFields as object, achReturnReason: "insufficient_funds" }; },
})) test(`${name} remains blocked`, () => { const { snapshot } = fixture(); mutate(snapshot); assert.equal(parentCheckoutResumeCandidate(snapshot), null); });

test("stored intent must match provider intent", () => { const { snapshot, session } = fixture(); snapshot.payments[0].customFields = { ...snapshot.payments[0].customFields as object, stripePaymentIntentId: "pi_different" }; assert.equal(parentCheckoutResumeReceipt(snapshot, session), null); });
for (const expiry of [Infinity, NaN, null, "9999999999", 1.2]) test(`invalid expiry ${String(expiry)} remains blocked`, () => { const { snapshot, session } = fixture(); (session.raw as Record<string, unknown>).expires_at = expiry; assert.equal(parentCheckoutResumeReceipt(snapshot, session), null); });

test("unsubmitted ACH is resumable without provisional credit or a new payment", () => {
  const { snapshot, session } = fixture();
  const fields = snapshot.payments[0].customFields as Record<string, unknown>, metadata = (session.raw as Record<string, unknown>).metadata as Record<string, unknown>;
  for (const target of [fields, metadata]) Object.assign(target, { paymentMethodCategory: "ach", requestedPaymentMethodCategory: "ach", collectionMode: "parent_ach_checkout" });
  assert.equal(parentPaymentStatus(snapshot.payments).accountPaymentBlocker?.phase, "payment_pending");
  assert.ok(parentCheckoutResumeReceipt(snapshot, session));
});

for (const collectableCents of [0, 500]) test(`explicit advance checkout resumes above collectable ${collectableCents}`, async () => {
  const { snapshot, session } = fixture(); snapshot.collectableCents = collectableCents;
  (snapshot.payments[0].customFields as Record<string, unknown>).advancePayment = "true";
  ((session.raw as Record<string, unknown>).metadata as Record<string, unknown>).advancePayment = "true";
  let reads = 0;
  assert.ok(await resumeParentCheckout({ read: async () => { reads++; return structuredClone(snapshot); }, retrieve: async () => ({ ok: true, session }) }));
  assert.equal(reads, 2); assert.equal(snapshot.payments[0].status, "DRAFT");
});
for (const intent of [undefined, "false", true, "TRUE", 1]) test(`ordinary or malformed advance intent ${String(intent)} cannot exceed zero balance`, async () => {
  const { snapshot } = fixture(); snapshot.collectableCents = 0;
  (snapshot.payments[0].customFields as Record<string, unknown>).advancePayment = intent;
  assert.equal(await resumeParentCheckout({ read: async () => snapshot, retrieve: async () => { throw Error("must not reach provider"); } }), null);
});
for (const providerIntent of [undefined, "false", true]) test(`advance checkout requires exact provider intent ${String(providerIntent)}`, () => {
  const { snapshot, session } = fixture(); snapshot.collectableCents = 0;
  (snapshot.payments[0].customFields as Record<string, unknown>).advancePayment = "true";
  ((session.raw as Record<string, unknown>).metadata as Record<string, unknown>).advancePayment = providerIntent;
  assert.equal(parentCheckoutResumeReceipt(snapshot, session), null);
});
test("advance intent removed during retrieval remains held", async () => {
  const { snapshot, session } = fixture(); snapshot.collectableCents = 0;
  (snapshot.payments[0].customFields as Record<string, unknown>).advancePayment = "true";
  ((session.raw as Record<string, unknown>).metadata as Record<string, unknown>).advancePayment = "true";
  let reads = 0;
  assert.equal(await resumeParentCheckout({ read: async () => { const s = structuredClone(snapshot); if (++reads === 2) (s.payments[0].customFields as Record<string, unknown>).advancePayment = "false"; return s; }, retrieve: async () => ({ ok: true, session }) }), null);
});
for (const intent of ["true", undefined, "false", true]) test(`expanded advance intent requires exact proof ${String(intent)} (${typeof intent})`, () => {
  const { snapshot, session } = fixture(); snapshot.collectableCents = 0;
  (snapshot.payments[0].customFields as Record<string, unknown>).advancePayment = "true";
  const raw = session.raw as Record<string, unknown>, metadata = raw.metadata as Record<string, unknown>;
  metadata.advancePayment = "true";
  session.paymentIntentId = "pi_test"; session.paymentIntentStatus = "requires_payment_method";
  raw.payment_intent = { id: "pi_test", object: "payment_intent", currency: "usd", amount: 1000, customer: "cus_synthetic123", status: "requires_payment_method", metadata: { ...metadata, advancePayment: intent } };
  assert.equal(Boolean(parentCheckoutResumeReceipt(snapshot, session)), intent === "true");
});
test("verified advance checkout preserves explicit intent when collectible balance falls to zero", async () => {
  const { snapshot, session } = fixture(); snapshot.collectableCents = 500;
  (snapshot.payments[0].customFields as Record<string, unknown>).advancePayment = "true";
  ((session.raw as Record<string, unknown>).metadata as Record<string, unknown>).advancePayment = "true";
  let reads = 0;
  assert.ok(await resumeParentCheckout({ read: async () => { const s = structuredClone(snapshot); if (++reads === 2) s.collectableCents = 0; return s; }, retrieve: async () => ({ ok: true, session }) }));
  assert.equal(reads, 2);
});
