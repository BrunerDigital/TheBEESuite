import assert from "node:assert/strict";
import test from "node:test";
import { PaymentStatus, UserRole, type Prisma } from "@prisma/client";
import { startInvoiceCheckout } from "@/lib/invoice-checkout-service";
import { INVOICE_CHECKOUT_RETRY_MS, invoiceCheckoutAttemptMatches, invoiceCheckoutRequestDigest, invoiceCheckoutTenant } from "@/lib/invoice-checkout-attempt";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import { stripeBillingApprovalCustomFieldPatch } from "@/lib/stripe-billing-approval";
import type { CurrentUser } from "@/lib/auth";
import type { IntegrationSendResult, StripeCheckoutSessionSnapshot } from "@/lib/integrations";
import { createStripeCheckoutSession } from "@/lib/integrations";

type Input = Parameters<typeof startInvoiceCheckout>[0];
type FakePayment = { id: string; billingAccountId: string; amountCents: number; provider: string; status: PaymentStatus;
  externalIdPlaceholder: string | null; customFields: Record<string, unknown> };
const instant = new Date("2026-09-12T10:00:00.000Z");
const clone = <T,>(value: T): T => structuredClone(value);
function fixture() {
  let clock = new Date(instant), allowed = true, auditFails = false, serializeFailures = 0;
  const topology = { tenantId: "fake-tenant", familyId: "fake-family", centerId: "fake-school", connectedAccountId: "acct_fake" };
  const ready = { stripeConnectAccountId: "acct_fake", stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true,
    stripePayoutRequirementFields: [], stripeMerchantCapabilityStatus: "active", stripeMerchantPayoutCapabilityStatus: "active",
    stripePayoutBankLast4: "1234", stripePayoutBankDefaultConfirmed: true, livePaymentsEnabled: true, tuitionBillingEnabled: true,
    ...stripeBillingApprovalCustomFieldPatch({ approved: true, approvedAt: instant.toISOString(), approvedBy: "Fake reviewer",
      billingPreviewApprovedAt: instant.toISOString(), accountingApprovedAt: instant.toISOString(), cutoverApprovedAt: instant.toISOString() }) };
  let state = {
    account: { id: "fake-account", familyId: topology.familyId, balanceCents: 10000, customFields: {} as Record<string, unknown>,
      family: { centerId: topology.centerId } },
    center: { id: topology.centerId, name: "Fake school", tenantId: topology.tenantId, customFields: ready as Record<string, unknown> },
    invoice: { id: "fake-invoice", billingAccountId: "fake-account", status: PaymentStatus.OPEN as PaymentStatus, totalCents: 10000, customFields: {}, items: [] },
    payments: [] as FakePayment[], audits: [] as string[], refreshes: 0,
  };
  const events: string[] = [], customerCalls: Parameters<NonNullable<Input["submitCustomer"]>>[0][] = [], checkoutCalls: Parameters<NonNullable<Input["submitCheckout"]>>[0][] = [];
  let tail = Promise.resolve();
  const paymentDelegate = (current: typeof state) => ({
    async findMany() { return clone(current.payments.filter(payment => payment.status === PaymentStatus.DRAFT)); },
    async findUnique({ where }: { where: { id: string } }) { return clone(current.payments.find(payment => payment.id === where.id) ?? null); },
    async findUniqueOrThrow({ where }: { where: { id: string } }) { const row = current.payments.find(payment => payment.id === where.id); assert.ok(row); return clone(row); },
    async create({ data }: { data: Omit<FakePayment, "id"> }) { events.push("create"); const row = { ...clone(data), id: `fake-payment-${current.payments.length + 1}` }; current.payments.push(row); return clone(row); },
    async update({ where, data }: { where: { id: string }; data: Partial<FakePayment> }) { const row = current.payments.find(payment => payment.id === where.id); assert.ok(row); Object.assign(row, clone(data)); return clone(row); },
    async updateMany({ where, data }: { where: Prisma.PaymentWhereInput; data: Partial<FakePayment> }) {
      const row = current.payments.find(payment => payment.id === where.id);
      if (!row || row.status !== where.status || row.provider !== where.provider
        || (where.externalIdPlaceholder !== undefined && row.externalIdPlaceholder !== where.externalIdPlaceholder)
        || JSON.stringify(row.customFields) !== JSON.stringify((where.customFields as { equals: unknown }).equals)) return { count: 0 };
      Object.assign(row, clone(data)); return { count: 1 };
    },
  });
  const accountDelegate = (current: typeof state) => ({
    async findUnique() { return clone(current.account); }, async findUniqueOrThrow() { return clone(current.account); },
    async update({ data }: { data: Partial<typeof state.account> }) { Object.assign(current.account, clone(data)); return clone(current.account); },
  });
  const centerDelegate = (current: typeof state) => ({
    async findFirst({ where }: { where: { id: string; organization: { tenantId: string } } }) {
      return where.id === current.center.id && where.organization.tenantId === current.center.tenantId ? clone(current.center) : null;
    },
    async update() { current.refreshes++; return current.center; },
  });
  const db = {
    get payment() { return paymentDelegate(state); }, get billingAccount() { return accountDelegate(state); },
    async $transaction<T>(run: (tx: unknown) => Promise<T>, options: { isolationLevel: string }) {
      assert.equal(options.isolationLevel, "Serializable");
      const previous = tail; let unlock!: () => void; tail = new Promise<void>(resolve => { unlock = resolve; }); await previous;
      const staged = clone(state);
      try {
        if (serializeFailures-- > 0) throw Object.assign(new Error("fake serialization conflict"), { code: "P2034" });
        const tx = { payment: paymentDelegate(staged), billingAccount: accountDelegate(staged), center: centerDelegate(staged),
          invoice: {
            async findFirst({ where }: { where: { id: string; billingAccountId: string; status: PaymentStatus; totalCents: number } }) {
              return Object.entries(where).every(([key, value]) => staged.invoice[key as keyof typeof staged.invoice] === value)
                ? clone({ ...staged.invoice, billingAccount: { ...staged.account, family: { ...staged.account.family, children: [] }, ledgerEntries: [] } }) : null;
            },
            async aggregate() { return { _sum: { totalCents: staged.invoice.totalCents } }; },
          },
          async $queryRaw(query: Prisma.Sql) {
            const sql = query.strings.join("?");
            if (sql.includes('FROM "BillingAccount"')) { events.push("account-lock"); return clone([staged.account]); }
            if (sql.includes('FROM "Invoice"')) { events.push("invoice-lock"); return clone([staged.invoice]); }
            if (sql.includes('FROM "Payment"')) { events.push("payment-lock"); return [{ id: query.values[0] }]; }
            throw new Error("Unexpected fake query");
          },
          auditLog: { async create({ data }: { data: { paymentId: string } }) { if (auditFails) throw new Error("fake audit rollback"); staged.audits.push(data.paymentId); } },
        };
        const value = await run(tx); state = staged; return value;
      } finally { unlock(); }
    },
  };
  const metadata = { tenantId: topology.tenantId, familyId: topology.familyId, centerId: topology.centerId, invoiceId: "fake-invoice", stripeConnectedAccountId: "acct_fake",
    invoiceAmountCents: "10000", checkoutTotalCents: "10000", parentSurchargeAmountCents: "0", applicationFeeAmountCents: "100",
    feeDisclosureVersion: "fake-fee-v1", requestedPaymentMethodCategory: "card", paymentMethodCategory: "card", source: "parent_portal", collectionMode: "parent_checkout" };
  const base: Input = {
    topology, billingAccountId: "fake-account", invoiceId: "fake-invoice", invoiceTotalCents: 10000, keyPrefix: "checkout",
    request: { amountCents: 10000, invoiceAmountCents: 10000, parentSurchargeAmountCents: 0, applicationFeeAmountCents: 100,
      invoiceNumber: "FAKE-100", customerEmail: "fake@example.test", centerName: "Fake school", connectedAccountId: "acct_fake", tenantId: "fake-tenant",
      successUrl: "https://thebeesuite.io/parents?payment=success", cancelUrl: "https://thebeesuite.io/parents?payment=cancelled", paymentMethodCategory: "card",
      metadata },
    customer: { email: "fake@example.test", name: "Fake Family", connectedAccountId: "acct_fake", tenantId: "fake-tenant",
      metadata: { tenantId: "fake-tenant", familyId: "fake-family", centerId: "fake-school", billingAccountId: "fake-account", stripeConnectedAccountId: "acct_fake", environment: "test" } },
    fields: { invoiceAmountCents: 10000, checkoutTotalCents: 10000, parentSurchargeAmountCents: 0, applicationFeeAmountCents: 100,
      requestedPaymentMethodCategory: "card", paymentMethodCategory: "card", feeDisclosureVersion: "fake-fee-v1", source: "parent_portal", collectionMode: "parent_checkout" },
    database: db as unknown as Input["database"], now: () => clock,
    authorize: async () => allowed,
    audit: async (tx, paymentId) => { await tx.auditLog.create({ data: { paymentId } } as never); },
    submitCustomer: async args => { customerCalls.push(clone(args)); events.push("customer"); return { ok: true, provider: "stripe", configured: true, id: "cus_fake" }; },
    submitCheckout: async args => { checkoutCalls.push(clone(args)); events.push("checkout"); return { ok: true, provider: "stripe", configured: true,
      id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake", status: "open", paymentStatus: "unpaid" }; },
  };
  function session(overrides: Partial<StripeCheckoutSessionSnapshot> = {}): StripeCheckoutSessionSnapshot {
    const request = checkoutCalls[0]; assert.ok(request);
    return { id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake", status: "open", paymentStatus: "unpaid", amountTotalCents: 10000,
      createdAt: clock.toISOString(), paymentIntentId: null, raw: { id: "cs_fake", object: "checkout.session", mode: "payment", currency: "usd",
        customer: "cus_fake", livemode: false, client_reference_id: "fake-invoice", amount_total: 10000, metadata: request.metadata,
        success_url: request.successUrl, cancel_url: request.cancelUrl, payment_intent: null }, ...overrides };
  }
  base.resolveDraft = args => resolveStripeCheckoutDraftBlocker({ ...args, now: clock,
    retrieve: async () => ({ ok: true, configured: true, provider: "stripe", session: session() }),
    expire: async () => ({ ok: true, configured: true, provider: "stripe", session: session({ status: "expired" }) }) });
  return { base, events, customerCalls, checkoutCalls, session, get state() { return state; },
    setAllowed(value: boolean) { allowed = value; }, setAuditFailure(value: boolean) { auditFails = value; },
    setClock(value: Date) { clock = value; }, setSerializationFailures(value: number) { serializeFailures = value; } };
}

test("concurrent same-invoice requests claim once before customer and checkout; credit policy remains preserve", async () => {
  const f = fixture(); f.state.account.balanceCents = 5000;
  const results = await Promise.all([startInvoiceCheckout(f.base), startInvoiceCheckout(f.base)]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(f.state.payments.length, 1);
  assert.equal(f.customerCalls.length, 1); assert.equal(f.checkoutCalls.length, 1); assert.equal(f.state.audits.length, 1);
  assert.ok(f.events.indexOf("account-lock") < f.events.indexOf("create")); assert.ok(f.events.indexOf("create") < f.events.indexOf("customer"));
  assert.equal(f.state.payments[0].amountCents, 10000); assert.equal(f.state.payments[0].customFields.accountCreditAppliedCents, 0);
  assert.equal(f.state.account.balanceCents, 5000);
  assert.equal(f.checkoutCalls[0].allowPaymentMethodFallback, false);
});

test("lost Checkout response retries the identical payload and key", async () => {
  const f = fixture(), requests: unknown[] = []; let attempts = 0;
  const result = await startInvoiceCheckout({ ...f.base, submitCheckout: async args => {
    requests.push(clone(args)); if (++attempts === 1) throw new Error("fake network loss"); return f.base.submitCheckout!(args);
  } });
  assert.equal(result.ok, true); assert.equal(attempts, 2); assert.deepEqual(requests[0], requests[1]); assert.equal(f.state.payments.length, 1);
});

test("ambiguous outcomes remain DRAFT and retry within the original 23-hour window only", async () => {
  const f = fixture(); const unknown = async (): Promise<IntegrationSendResult> => ({ ok: false, configured: true, provider: "stripe", providerStatus: 500, error: "fake private provider error" });
  const first = await startInvoiceCheckout({ ...f.base, submitCheckout: unknown });
  assert.equal(first.status, "confirmation_pending"); assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT);
  assert.equal(f.state.payments[0].customFields.status, "checkout_submission_unknown");
  assert.ok(!JSON.stringify(first).includes("fake private"));
  const original = clone(f.state.payments[0].customFields.checkoutPreparationV1);
  f.setClock(new Date(instant.getTime() + 3600000));
  const recovered = await startInvoiceCheckout(f.base); assert.equal(recovered.ok, true);
  assert.equal(f.state.payments.length, 1); assert.deepEqual(f.state.payments[0].customFields.checkoutPreparationV1, original);
  const attempt = f.state.payments[0].customFields.checkoutAttemptV1 as { startedAt: string; retryUntil: string };
  assert.equal(attempt.startedAt, instant.toISOString()); assert.equal(Date.parse(attempt.retryUntil) - Date.parse(attempt.startedAt), INVOICE_CHECKOUT_RETRY_MS);
});

for (const change of ["expired", "url", "recipient", "customer", "topology", "attempt"] as const) test(`unknown attempt rejects changed ${change} without another provider create`, async () => {
  const f = fixture(); await startInvoiceCheckout({ ...f.base, submitCheckout: async () => { throw new Error("fake loss"); } });
  const input = { ...f.base, request: clone(f.base.request) };
  if (change === "expired") f.setClock(new Date(instant.getTime() + INVOICE_CHECKOUT_RETRY_MS));
  if (change === "url") input.request.successUrl += "&changed=1";
  if (change === "recipient") input.request.customerEmail = "different@example.test";
  if (change === "customer") f.state.account.customFields.stripeCustomerIdsByConnectedAccount = { acct_fake: "cus_changed" };
  if (change === "topology") f.state.center.customFields.stripeConnectAccountId = "acct_changed";
  if (change === "attempt") (f.state.payments[0].customFields.checkoutAttemptV1 as Record<string, unknown>).requestDigest = "changed";
  const result = await startInvoiceCheckout(input); assert.equal(result.ok, false); assert.equal(f.checkoutCalls.length, 0); assert.equal(f.state.payments.length, 1);
});

test("a webhook winning during Checkout is not overwritten or audited as a new session", async () => {
  const f = fixture(); const result = await startInvoiceCheckout({ ...f.base, submitCheckout: async args => {
    f.state.payments[0].status = PaymentStatus.PAID; f.state.payments[0].customFields.webhookEvidence = "confirmed";
    return f.base.submitCheckout!(args);
  } });
  assert.equal(result.ok, false); assert.equal(f.state.payments[0].status, PaymentStatus.PAID);
  assert.equal(f.state.payments[0].customFields.webhookEvidence, "confirmed"); assert.equal(f.state.audits.length, 0);
});

test("changed actual attempt cannot be finalized or marked unknown by a stale handler", async () => {
  const f = fixture(); const result = await startInvoiceCheckout({ ...f.base, submitCheckout: async args => {
    (f.state.payments[0].customFields.checkoutAttemptV1 as Record<string, unknown>).requestDigest = "different";
    return f.base.submitCheckout!(args);
  } });
  assert.equal(result.ok, false); assert.equal(f.state.payments[0].customFields.status, "checkout_pending"); assert.equal(f.state.audits.length, 0);
});

test("definitive failure is sanitized and refreshes billing; audit rollback recovers the same attempt", async () => {
  const f = fixture(); const result = await startInvoiceCheckout({ ...f.base, submitCheckout: async () => ({ ok: false, configured: true, provider: "stripe", providerStatus: 400, error: "fake private details" }) });
  assert.equal(result.ok, false); assert.equal(f.state.payments[0].status, PaymentStatus.FAILED); assert.equal(f.state.refreshes, 1);
  assert.ok(!JSON.stringify([result, f.state.payments]).includes("fake private"));
  const g = fixture(); g.setAuditFailure(true); await assert.rejects(startInvoiceCheckout(g.base), /fake audit rollback/);
  assert.equal(g.state.payments[0].customFields.status, "checkout_pending"); assert.equal(g.state.audits.length, 0);
  g.setAuditFailure(false); assert.equal((await startInvoiceCheckout(g.base)).ok, true); assert.equal(g.state.payments.length, 1);
  assert.equal(g.checkoutCalls[0].idempotencyKey, g.checkoutCalls[1].idempotencyKey);
});

for (const mutation of ["amount", "fee", "metadata", "token", "url", "object", "unsafeInteger"] as const) test(`reject invalid ${mutation} before claims or provider calls`, async () => {
  const f = fixture(), request = clone(f.base.request), fields = clone(f.base.fields);
  if (mutation === "amount") request.invoiceAmountCents = 9999;
  if (mutation === "fee") fields.applicationFeeAmountCents = 99;
  if (mutation === "metadata") request.metadata.stripeConnectedAccountId = "acct_foreign";
  if (mutation === "token") fields.token = "fake-bearer-sentinel";
  if (mutation === "url") fields.description = "https://thebeesuite.io/payment-method-form/fake-bearer-sentinel";
  if (mutation === "object") fields.description = { token: "fake-bearer-sentinel" };
  if (mutation === "unsafeInteger") request.amountCents = Number.MAX_SAFE_INTEGER + 1;
  assert.equal((await startInvoiceCheckout({ ...f.base, request, fields })).ok, false);
  assert.equal(f.state.payments.length, 0); assert.equal(f.customerCalls.length, 0); assert.equal(f.checkoutCalls.length, 0);
});

test("authorization, invoice and school gates are rechecked before provider mutation", async () => {
  for (const change of ["actor", "invoice", "school", "family"] as const) {
    const f = fixture();
    if (change === "actor") f.setAllowed(false);
    if (change === "invoice") f.state.invoice.status = PaymentStatus.PAID;
    if (change === "school") f.state.center.customFields.livePaymentsEnabled = false;
    if (change === "family") f.state.account.family.centerId = "foreign-school";
    assert.equal((await startInvoiceCheckout(f.base)).ok, false); assert.equal(f.customerCalls.length, 0); assert.equal(f.checkoutCalls.length, 0);
  }
});

test("known session is reused only for the exact account, customer, route and return request", async () => {
  const f = fixture(); await startInvoiceCheckout(f.base);
  assert.equal((await startInvoiceCheckout(f.base)).status, "checkout_session_reused"); assert.equal(f.checkoutCalls.length, 1);
  for (const change of ["return", "prefix", "customer", "providerIdentity"] as const) {
    const g = fixture(); await startInvoiceCheckout(g.base);
    const input = { ...g.base, request: clone(g.base.request) };
    if (change === "return") input.request.successUrl += "&other=1";
    if (change === "prefix") input.keyPrefix = "payment-request-checkout";
    if (change === "customer") g.state.account.customFields.stripeCustomerIdsByConnectedAccount = { acct_fake: "cus_other" };
    if (change === "providerIdentity") input.resolveDraft = args => resolveStripeCheckoutDraftBlocker({ ...args, retrieve: async () => ({
      ok: true, configured: true, provider: "stripe", session: g.session({ raw: { ...g.session().raw as object, customer: "cus_other" } }),
    }) });
    assert.equal((await startInvoiceCheckout(input)).ok, false); assert.equal(g.checkoutCalls.length, 1); assert.equal(g.state.payments.length, 1);
  }
});

test("known session can be inspected beyond create-retry window without replaying create", async () => {
  const f = fixture(); await startInvoiceCheckout(f.base); f.setClock(new Date(instant.getTime() + INVOICE_CHECKOUT_RETRY_MS));
  assert.equal((await startInvoiceCheckout(f.base)).status, "checkout_session_reused"); assert.equal(f.checkoutCalls.length, 1);
});

test("expired-session response cannot overwrite a webhook or an unexpired provider result", async () => {
  for (const mode of ["webhook", "stillOpen", "metadata"] as const) {
    const f = fixture(); await startInvoiceCheckout(f.base);
    const result = await startInvoiceCheckout({ ...f.base, resolveDraft: args => resolveStripeCheckoutDraftBlocker({ ...args,
      now: new Date(instant.getTime() + 3600000), retrieve: async () => ({ ok: true, configured: true, provider: "stripe", session: f.session() }),
      expire: async () => {
        if (mode === "webhook") { f.state.payments[0].status = PaymentStatus.PAID; f.state.payments[0].customFields.status = "paid"; }
        if (mode === "metadata") f.state.payments[0].customFields.newEvidence = true;
        return { ok: true, configured: true, provider: "stripe", session: f.session({ status: mode === "stillOpen" ? "open" : "expired" }) };
      },
    }) });
    assert.equal(result.ok, false); assert.equal(f.checkoutCalls.length, 1); assert.equal(f.state.payments.length, 1);
    assert.notEqual(f.state.payments[0].status, PaymentStatus.VOID);
    if (mode === "webhook") assert.equal(f.state.payments[0].status, PaymentStatus.PAID);
    if (mode === "metadata") assert.equal(f.state.payments[0].customFields.newEvidence, true);
  }
});

test("canonical digest ignores object key order but includes every request value; window is bounded", () => {
  const f = fixture();
  assert.equal(invoiceCheckoutRequestDigest(f.base.request, "checkout"), invoiceCheckoutRequestDigest({ ...f.base.request, metadata: Object.fromEntries(Object.entries(f.base.request.metadata).reverse()) }, "checkout"));
  assert.notEqual(invoiceCheckoutRequestDigest(f.base.request, "checkout"), invoiceCheckoutRequestDigest({ ...f.base.request, cancelUrl: f.base.request.cancelUrl + "&changed=1" }, "checkout"));
  assert.equal(invoiceCheckoutAttemptMatches({}, {} as never, instant), false);
});

test("tenant-wide billing cannot reach a foreign tenant; platform requires an explicit selected school", () => {
  const user = { role: UserRole.BRAND_ADMIN, tenantId: "own", centerIds: ["foreign"], workspace: { mode: "all" } } as unknown as CurrentUser;
  const target = { id: "foreign", tenantId: "other" };
  assert.equal(invoiceCheckoutTenant(user, target), null);
  assert.equal(invoiceCheckoutTenant({ ...user, role: UserRole.PLATFORM_OWNER }, target), null);
  assert.equal(invoiceCheckoutTenant({ ...user, role: UserRole.PLATFORM_OWNER, workspace: { mode: "center", activeCenterId: "foreign" } as CurrentUser["workspace"] }, target), "other");
  assert.equal(invoiceCheckoutTenant(user, null), null);
});

test("known serialization rollbacks retry before providers and remain bounded", async () => {
  const f = fixture(); f.setSerializationFailures(2);
  assert.equal((await startInvoiceCheckout(f.base)).ok, true); assert.equal(f.state.payments.length, 1); assert.equal(f.checkoutCalls.length, 1);
  const g = fixture(); g.setSerializationFailures(3);
  await assert.rejects(startInvoiceCheckout(g.base), /serialization conflict/); assert.equal(g.state.payments.length, 0); assert.equal(g.customerCalls.length, 0);
});

test("customer mapping reconciliation preserves a different winner and blocks a cutover", async () => {
  for (const change of ["mapping", "school"] as const) {
    const f = fixture(); const result = await startInvoiceCheckout({ ...f.base, submitCustomer: async args => {
      if (change === "mapping") f.state.account.customFields.stripeCustomerIdsByConnectedAccount = { acct_fake: "cus_winner" };
      else f.state.center.customFields.stripeConnectAccountId = "acct_new";
      return f.base.submitCustomer!(args);
    } });
    assert.equal(result.ok, false); assert.equal(f.checkoutCalls.length, 0); assert.equal(f.state.account.customFields.stripeCustomerId, undefined);
    if (change === "mapping") assert.deepEqual(f.state.account.customFields.stripeCustomerIdsByConnectedAccount, { acct_fake: "cus_winner" });
  }
});

test("the last authority recheck can revoke access after customer preparation without submitting Checkout", async () => {
  const f = fixture(); let checks = 0;
  const result = await startInvoiceCheckout({ ...f.base, authorizeRequest: async () => ++checks < 3 });
  assert.equal(result.ok, false); assert.equal(f.customerCalls.length, 1); assert.equal(f.checkoutCalls.length, 0);
});

test("paid-processing confirmation and different returned session are never offered as new checkout URLs", async () => {
  for (const status of ["paid_processing", "checkout_created"]) {
    const f = fixture(); const result = await startInvoiceCheckout({ ...f.base, submitCheckout: async args => {
      f.state.payments[0].customFields.status = status; f.state.payments[0].customFields.stripeCheckoutSessionId = "cs_winner";
      return f.base.submitCheckout!(args);
    } });
    assert.equal(result.ok, false); assert.equal(result.url, undefined); assert.equal(f.state.payments[0].customFields.stripeCheckoutSessionId, "cs_winner");
  }
});

test("an ambiguous call followed by Stripe idempotency mismatch never permits a fresh payment key", async () => {
  const original = globalThis.fetch, keys: string[] = [], f = fixture();
  globalThis.fetch = (async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    if (keys.length === 1) throw new Error("fake accepted-response loss");
    return new Response(JSON.stringify({ error: { type: "idempotency_error", message: "Different parameters" } }), { status: 400 });
  }) as typeof fetch;
  try {
    const input = { ...f.base, submitCheckout: (args: Parameters<typeof createStripeCheckoutSession>[0]) => createStripeCheckoutSession({ ...args, credentials: { STRIPE_SECRET_KEY: "sk_test_fake" } }) };
    assert.equal((await startInvoiceCheckout(input)).status, "confirmation_pending");
    assert.equal((await startInvoiceCheckout(input)).status, "confirmation_pending");
    assert.equal(keys.length, 4); assert.equal(new Set(keys).size, 1); assert.equal(f.state.payments.length, 1);
    assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT); assert.equal(f.state.payments[0].customFields.status, "checkout_submission_unknown");
  } finally { globalThis.fetch = original; }
});

test("legacy known session with expanded unpaid intent can expire and be replaced once", async () => {
  const f = fixture(); await startInvoiceCheckout(f.base);
  delete f.state.payments[0].customFields.checkoutPreparationV1; delete f.state.payments[0].customFields.checkoutAttemptV1;
  const withIntent = (status: "open" | "expired"): StripeCheckoutSessionSnapshot => {
    const original = f.session(), raw = original.raw as Record<string, unknown>;
    return { ...original, status, createdAt: instant.toISOString(), paymentIntentId: "pi_fake", paymentIntentStatus: "requires_payment_method",
      raw: { ...raw, payment_intent: { id: "pi_fake", object: "payment_intent", currency: "usd", amount: 10000, customer: "cus_fake",
        status: "requires_payment_method", metadata: raw.metadata } } };
  };
  const result = await startInvoiceCheckout({ ...f.base, resolveDraft: args => resolveStripeCheckoutDraftBlocker({ ...args,
    now: new Date(instant.getTime() + 3600000), retrieve: async () => ({ ok: true, configured: true, provider: "stripe", session: withIntent("open") }),
    expire: async () => ({ ok: true, configured: true, provider: "stripe", session: withIntent("expired") }),
  }) });
  assert.equal(result.ok, true); assert.equal(f.state.payments.length, 2); assert.equal(f.state.payments[0].status, PaymentStatus.VOID);
  assert.equal(f.checkoutCalls.length, 2); assert.notEqual(f.checkoutCalls[0].idempotencyKey, f.checkoutCalls[1].idempotencyKey);
});
