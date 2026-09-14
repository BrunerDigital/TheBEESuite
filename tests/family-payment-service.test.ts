import assert from "node:assert/strict";
import test from "node:test";
import { PaymentStatus, type Prisma } from "@prisma/client";
import { startFamilyPayment, FAMILY_PAYMENT_ID_TOKEN } from "@/lib/family-payment-service";
import { FAMILY_PAYMENT_RETRY_MS } from "@/lib/family-payment-attempt";
import { stripeBillingApprovalCustomFieldPatch } from "@/lib/stripe-billing-approval";
import { stripeCustomerCustomFieldPatch } from "@/lib/stripe-customer-scope";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import type { IntegrationSendResult, StripeCheckoutSessionSnapshot, StripePaymentIntentSnapshot } from "@/lib/integrations";
import { matchesPrismaWhere } from "./helpers/matches-prisma-where";

type Input = Parameters<typeof startFamilyPayment>[0];
type CheckoutInput = Extract<Input, { kind: "checkout" }>;
type IntentInput = Extract<Input, { kind: "saved_method" }>;
type FakePayment = { id: string; billingAccountId: string; amountCents: number; provider: string; status: PaymentStatus;
  externalIdPlaceholder: string | null; paidAt: Date | null; customFields: Record<string, unknown> };
const clone = <T,>(value: T): T => structuredClone(value);
const instant = new Date("2026-09-13T22:00:00.000Z");
const unknown = async (): Promise<IntegrationSendResult> => ({ ok: false, configured: true, provider: "stripe", providerStatus: 500, error: "private fake provider text" });
function fixture() {
  let clock = new Date(instant), allowed = true, auditFails = false, requestAllowed = true, transactions = 0, inTransaction = false;
  const topology = { tenantId: "fake-tenant", familyId: "fake-family", centerId: "fake-school", billingAccountId: "fake-account", connectedAccountId: "acct_fake" };
  const ready = { stripeConnectAccountId: "acct_fake", stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true,
    stripePayoutRequirementFields: [], stripeMerchantCapabilityStatus: "active", stripeMerchantPayoutCapabilityStatus: "active",
    stripePayoutBankLast4: "1234", stripePayoutBankDefaultConfirmed: true, livePaymentsEnabled: true, tuitionBillingEnabled: true,
    ...stripeBillingApprovalCustomFieldPatch({ approved: true, approvedAt: instant.toISOString(), approvedBy: "Fake reviewer",
      billingPreviewApprovedAt: instant.toISOString(), accountingApprovedAt: instant.toISOString(), cutoverApprovedAt: instant.toISOString() }) };
  let state = {
    account: { id: topology.billingAccountId, familyId: topology.familyId, balanceCents: 10000,
      family: { centerId: topology.centerId }, customFields: {} as Record<string, unknown> },
    center: { id: topology.centerId, name: "Fake school", organization: { tenantId: topology.tenantId }, customFields: ready as Record<string, unknown> },
    payments: [] as FakePayment[], ledger: [] as Array<Record<string, unknown>>, audits: [] as Array<Record<string, unknown>>,
    invoices: [{ id: "fake-invoice", billingAccountId: topology.billingAccountId, totalCents: 10000, status: PaymentStatus.OPEN as PaymentStatus, customFields: {} as Record<string, unknown> }],
  };
  const events: string[] = [], customerCalls: Parameters<NonNullable<Input["submitCustomer"]>>[0][] = [], checkoutCalls: Parameters<NonNullable<Input["submitCheckout"]>>[0][] = [], intentCalls: Parameters<NonNullable<Input["submitIntent"]>>[0][] = [];
  let tail = Promise.resolve();
  const paymentDelegate = (s: typeof state) => ({
    async findMany({ where }: { where: Prisma.PaymentWhereInput }) { return clone(s.payments.filter(row => matchesPrismaWhere(row, where))); },
    async findUnique({ where }: { where: { id: string } }) { return clone(s.payments.find(row => row.id === where.id) ?? null); },
    async findUniqueOrThrow({ where }: { where: { id: string } }) { const row = s.payments.find(row => row.id === where.id); assert.ok(row); return clone(row); },
    async create({ data }: { data: Omit<FakePayment, "id" | "paidAt"> }) { events.push("create"); const row = { paidAt: null, ...clone(data), id: `fake-payment-${s.payments.length + 1}` }; s.payments.push(row); return clone(row); },
    async update({ where, data }: { where: { id: string }; data: Partial<FakePayment> }) { const row = s.payments.find(row => row.id === where.id); assert.ok(row); Object.assign(row, clone(data)); return clone(row); },
    async updateMany({ where, data }: { where: Prisma.PaymentWhereInput; data: Partial<FakePayment> }) {
      const { customFields, ...rest } = where;
      const rows = s.payments.filter(row => matchesPrismaWhere(row, rest) && (customFields === undefined
        || JSON.stringify(row.customFields) === JSON.stringify((customFields as { equals: unknown }).equals)));
      rows.forEach(row => Object.assign(row, clone(data))); return { count: rows.length };
    },
  });
  const accountDelegate = (s: typeof state) => ({
    async findUnique() { return clone(s.account); }, async findUniqueOrThrow() { return clone(s.account); },
    async update({ data }: { data: { balanceCents?: { decrement: number }; customFields?: Record<string, unknown> } }) {
      if (data.balanceCents) s.account.balanceCents -= data.balanceCents.decrement;
      if (data.customFields) s.account.customFields = clone(data.customFields); return clone(s.account);
    },
  });
  const db = { get payment() { return paymentDelegate(state); }, get billingAccount() { return accountDelegate(state); },
    async $transaction<T>(run: (tx: unknown) => Promise<T>, options: { isolationLevel: string }) {
      assert.ok(["Serializable", "RepeatableRead"].includes(options.isolationLevel)); transactions++;
      const previous = tail; let unlock!: () => void; tail = new Promise<void>(resolve => { unlock = resolve; }); await previous;
      const staged = clone(state); inTransaction = true;
      try {
        const tx = { payment: paymentDelegate(staged), billingAccount: accountDelegate(staged),
          center: { async findFirst({ where }: { where: object }) { return matchesPrismaWhere(staged.center, where) ? clone(staged.center) : null; } },
          async $queryRaw(query: Prisma.Sql) { const sql = query.strings.join("?");
            if (sql.includes('FROM "BillingAccount"')) { events.push("account-lock"); return clone([staged.account]); }
            if (sql.includes('FROM "Payment"')) { events.push("payment-lock"); return [{ id: query.values[0] }]; }
            throw new Error("Unexpected fake query");
          },
          invoice: {
            async findMany({ where }: { where: { billingAccountId: string; status: PaymentStatus; totalCents: { gt: number } } }) {
              assert.deepEqual(where, { billingAccountId: topology.billingAccountId, status: PaymentStatus.OPEN, totalCents: { gt: 0 } });
              return clone(staged.invoices.filter(row => row.billingAccountId === where.billingAccountId && row.status === where.status && row.totalCents > where.totalCents.gt));
            },
            async updateMany({ where, data }: { where: object; data: Partial<typeof state.invoices[number]> }) {
              const rows = staged.invoices.filter(row => matchesPrismaWhere(row, where)); rows.forEach(row => Object.assign(row, clone(data))); return { count: rows.length };
            },
          },
          ledgerEntry: { async create({ data }: { data: Record<string, unknown> }) { staged.ledger.push(clone(data)); return data; } },
          auditLog: { async create({ data }: { data: Record<string, unknown> }) { if (auditFails) throw new Error("fake audit rollback"); staged.audits.push(clone(data)); return data; } },
        };
        const result = await run(tx); state = staged; return result;
      } finally { inTransaction = false; unlock(); }
    },
  };
  const metadata = { ...topology, stripeConnectedAccountId: topology.connectedAccountId, stripeCustomerId: "", paymentScope: "family_balance",
    invoiceAmountCents: "10000", checkoutTotalCents: "10000", parentSurchargeAmountCents: "0", applicationFeeAmountCents: "100",
    requestedPaymentMethodCategory: "card", paymentMethodCategory: "card", feeDisclosureVersion: "fake-v1", collectionMode: "parent_card_checkout", source: "parent_portal" };
  const base: CheckoutInput = { topology, kind: "checkout", request: { amountCents: 10000, invoiceAmountCents: 10000, parentSurchargeAmountCents: 0, applicationFeeAmountCents: 100,
    invoiceNumber: "Fake Family family payment", customerEmail: "fake@example.test", centerName: "Fake school", connectedAccountId: "acct_fake", tenantId: "fake-tenant",
    successUrl: `https://thebeesuite.io/parents?payment=success&familyPayment=${FAMILY_PAYMENT_ID_TOKEN}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `https://thebeesuite.io/parents?payment=cancelled&familyPayment=${FAMILY_PAYMENT_ID_TOKEN}`, paymentMethodCategory: "card", allowPaymentMethodFallback: false, metadata },
    customer: { email: "fake@example.test", name: "Fake Family", tenantId: topology.tenantId, connectedAccountId: topology.connectedAccountId,
      metadata: { ...topology, stripeConnectedAccountId: topology.connectedAccountId } }, fields: clone(metadata),
    database: db as unknown as Input["database"], now: () => clock, authorize: async () => allowed, authorizeRequest: async () => requestAllowed,
    audit: async (tx, paymentId, event, providerId) => { await tx.auditLog.create({ data: { paymentId, event, providerId } } as never); },
    submitCustomer: async args => { assert.equal(inTransaction, false); customerCalls.push(clone(args)); events.push("customer"); return { ok: true, configured: true, provider: "stripe", id: "cus_fake" }; },
    submitCheckout: async args => { assert.equal(inTransaction, false); checkoutCalls.push(clone(args)); events.push("checkout"); return { ok: true, configured: true, provider: "stripe",
      id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake", status: "open", paymentStatus: "unpaid" }; },
    submitIntent: async args => { assert.equal(inTransaction, false); intentCalls.push(clone(args)); events.push("intent"); return { ok: true, configured: true, provider: "stripe", id: "pi_fake", paymentIntent: intent(args) }; },
    retrieveIntent: async () => { throw new Error("Unexpected real provider retrieval"); },
  };
  function session(): StripeCheckoutSessionSnapshot { const request = checkoutCalls[0]; assert.ok(request); return { id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake",
    status: "open", paymentStatus: "unpaid", amountTotalCents: 10000, createdAt: clock.toISOString(), paymentIntentId: null,
    raw: { id: "cs_fake", object: "checkout.session", mode: "payment", currency: "usd", livemode: false, customer: "cus_fake",
      client_reference_id: request.invoiceNumber, amount_total: 10000, metadata: request.metadata, success_url: request.successUrl, cancel_url: request.cancelUrl, payment_intent: null } }; }
  function intent(request: Parameters<NonNullable<Input["submitIntent"]>>[0], status = "succeeded"): StripePaymentIntentSnapshot {
    return { id: "pi_fake", status, amountCents: request.amountCents, raw: { id: "pi_fake", object: "payment_intent", status, currency: "usd", livemode: false,
      customer: request.customerId, payment_method: request.paymentMethodId, amount: request.amountCents, amount_received: status === "succeeded" ? request.amountCents : 0, metadata: clone(request.metadata) } };
  }
  base.resolveDraft = args => resolveStripeCheckoutDraftBlocker({ ...args, now: clock,
    retrieve: async () => ({ ok: true, configured: true, provider: "stripe", session: session() }),
    expire: async () => ({ ok: true, configured: true, provider: "stripe", session: { ...session(), status: "expired" } }) });
  function saved(): IntentInput {
    state.account.customFields = stripeCustomerCustomFieldPatch(state.account.customFields, "cus_fake", topology.connectedAccountId);
    const metadata = { ...base.request.metadata, stripeCustomerId: "cus_fake", collectionMode: "director_saved_method" };
    return { ...base, kind: "saved_method", request: { amountCents: 10000, invoiceAmountCents: 10000, parentSurchargeAmountCents: 0, applicationFeeAmountCents: 100,
      tenantId: topology.tenantId, connectedAccountId: topology.connectedAccountId, invoiceNumber: "Fake Family family payment", customerId: "cus_fake", paymentMethodId: "pm_fake", paymentMethodType: "card", metadata }, fields: clone(metadata) };
  }
  return { base, saved, session, intent, events, customerCalls, checkoutCalls, intentCalls, get state() { return state; }, get transactions() { return transactions; },
    setAllowed(value: boolean) { allowed = value; }, setRequestAllowed(value: boolean) { requestAllowed = value; }, setClock(value: Date) { clock = value; }, setAuditFailure(value: boolean) { auditFails = value; } };
}

test("concurrent family requests claim once before Customer and Checkout with frozen return identity", async () => {
  const f = fixture(), results = await Promise.all([startFamilyPayment(f.base), startFamilyPayment(f.base)]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(f.state.payments.length, 1); assert.equal(f.customerCalls.length, 1); assert.equal(f.checkoutCalls.length, 1);
  assert.equal(f.state.audits.length, 1); assert.equal(f.state.account.balanceCents, 10000);
  assert.ok(f.events.indexOf("create") < f.events.indexOf("customer")); assert.equal(f.checkoutCalls[0].allowPaymentMethodFallback, false);
  assert.match(f.checkoutCalls[0].successUrl, /familyPayment=fake-payment-1&session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.doesNotMatch(JSON.stringify(f.state.payments), /fake@example|successUrl|checkout\.stripe/);
});
test("family authority fails before financial draft read or provider work", async () => {
  const f = fixture(); f.setRequestAllowed(false); assert.equal((await startFamilyPayment(f.base)).ok, false); assert.equal(f.transactions, 0);
  f.setRequestAllowed(true); f.setAllowed(false); assert.equal((await startFamilyPayment(f.base)).ok, false); assert.equal(f.state.payments.length, 0); assert.deepEqual(f.events, []);
});
test("changed live topology rejects family claim before Customer", async () => {
  for (const change of ["family", "school", "tenant", "account", "approval"]) {
    const f = fixture(); if (change === "family") f.state.account.familyId = "changed";
    if (change === "school") f.state.account.family.centerId = "changed";
    if (change === "tenant") f.state.center.organization.tenantId = "changed";
    if (change === "account") f.state.center.customFields.stripeConnectAccountId = "acct_changed";
    if (change === "approval") f.state.center.customFields.livePaymentsEnabled = false;
    assert.equal((await startFamilyPayment(f.base)).ok, false, change); assert.equal(f.state.payments.length, 0); assert.equal(f.customerCalls.length, 0);
  }
});
for (const provider of ["stripe", "stripe_terminal"]) test(`active ${provider} invoice or unattributed payment blocks family mutation`, async () => {
  for (const scope of ["invoice", "unknown", "family_balance"]) { const f = fixture();
    f.state.payments.push({ id: "fake-blocker", billingAccountId: "fake-account", amountCents: 10000, provider, status: PaymentStatus.DRAFT, paidAt: null,
      externalIdPlaceholder: "payment_intent_pending", customFields: { paymentScope: scope, status: provider === "stripe_terminal" ? "terminal_payment_intent_created" : "checkout_pending", ...(scope === "invoice" ? { invoiceId: "fake-invoice" } : {}) } });
    assert.equal((await startFamilyPayment(f.base)).ok, false, scope); assert.equal(f.customerCalls.length, 0); assert.equal(f.state.payments.length, 1);
  }
});
test("lost family Checkout response retries identical payload and key", async () => {
  const f = fixture(), calls: unknown[] = []; const result = await startFamilyPayment({ ...f.base, submitCheckout: async args => {
    calls.push(clone(args)); if (calls.length === 1) throw new Error("fake loss"); return f.base.submitCheckout!(args);
  } }); assert.equal(result.ok, true); assert.deepEqual(calls[0], calls[1]); assert.equal(f.state.payments.length, 1);
});
test("unknown family retries preserve original deadline, parameters and payment key", async () => {
  const f = fixture(); assert.equal((await startFamilyPayment({ ...f.base, submitCheckout: unknown })).status, "confirmation_pending");
  const original = clone(f.state.payments[0].customFields.familyPaymentPreparationV1);
  f.setClock(new Date(instant.getTime() + 3600000)); assert.equal((await startFamilyPayment(f.base)).ok, true);
  assert.equal(f.state.payments.length, 1); assert.equal(f.checkoutCalls[0].idempotencyKey, "family-payment:checkout:fake-payment-1");
  assert.deepEqual(f.state.payments[0].customFields.familyPaymentPreparationV1, original);
});
test("expired, legacy or changed unknown attempts cannot reach a provider mutation", async () => {
  for (const change of ["expired", "legacy", "email", "url", "amount", "configuration"]) {
    const f = fixture(); await startFamilyPayment({ ...f.base, submitCheckout: unknown });
    if (change === "expired") f.setClock(new Date(instant.getTime() + FAMILY_PAYMENT_RETRY_MS));
    if (change === "legacy") delete f.state.payments[0].customFields.familyPaymentPreparationV1;
    if (change === "email") f.base.customer.email = "changed@example.test";
    if (change === "url") f.base.request.successUrl += "&changed=1";
    if (change === "amount") { f.base.request.amountCents++; f.base.request.parentSurchargeAmountCents = 1; f.base.request.metadata.checkoutTotalCents = "10001"; f.base.request.metadata.parentSurchargeAmountCents = "1"; }
    if (change === "configuration") f.base.request.paymentMethodConfigurationId = "pmc_changed";
    assert.equal((await startFamilyPayment(f.base)).ok, false, change); assert.equal(f.checkoutCalls.length, 0); assert.equal(f.state.payments.length, 1);
  }
});
test("Customer creation is idempotent and preserves concurrently changed account fields", async () => {
  const f = fixture(); const calls: unknown[] = []; const result = await startFamilyPayment({ ...f.base, submitCustomer: async args => {
    calls.push(clone(args)); f.state.account.customFields.concurrentPreference = true;
    if (calls.length === 1) throw new Error("fake response loss"); return f.base.submitCustomer!(args);
  } }); assert.equal(result.ok, true); assert.deepEqual(calls[0], calls[1]); assert.equal(f.state.account.customFields.concurrentPreference, true);
});
test("concurrent different Customer mapping holds the family attempt without overwrite", async () => {
  const f = fixture(); const result = await startFamilyPayment({ ...f.base, submitCustomer: async args => {
    f.state.account.customFields = { preserved: true, ...stripeCustomerCustomFieldPatch({}, "cus_winner", "acct_fake") }; return f.base.submitCustomer!(args);
  } }); assert.equal(result.ok, false); assert.equal(f.checkoutCalls.length, 0); assert.equal(f.state.account.customFields.preserved, true);
});
test("definitive Customer failure releases only untouched claim; prior unknown remains held", async () => {
  for (const priorUnknown of [false, true]) { const f = fixture(); if (priorUnknown) await startFamilyPayment({ ...f.base, submitCustomer: unknown });
    const result = await startFamilyPayment({ ...f.base, submitCustomer: async () => ({ ok: false, configured: true, provider: "stripe", providerStatus: 400, error: "private fake provider text" }) });
    assert.equal(f.state.payments[0].status, priorUnknown ? PaymentStatus.DRAFT : PaymentStatus.FAILED);
    assert.doesNotMatch(JSON.stringify(result), /private fake/); assert.equal(f.checkoutCalls.length, 0);
  }
});
for (const outcome of ["failure", "unknown", "success"]) test(`late Checkout ${outcome} preserves PAID, VOID and processing winners`, async () => {
  for (const status of [PaymentStatus.PAID, PaymentStatus.VOID, PaymentStatus.DRAFT]) { const f = fixture();
    const result = await startFamilyPayment({ ...f.base, submitCheckout: async args => {
      const row = f.state.payments[0]; row.status = status; row.customFields = { ...row.customFields, status: "paid_processing", freshEvidence: "keep" };
      return outcome === "success" ? f.base.submitCheckout!(args) : outcome === "unknown" ? unknown() : { ok: false, configured: true, provider: "stripe", providerStatus: 400 };
    } }); assert.equal(result.ok, false); assert.equal(f.state.payments[0].status, status); assert.equal(f.state.payments[0].customFields.freshEvidence, "keep"); assert.equal(f.state.audits.length, 0);
  }
});
test("known family Checkout validates provider identity and resumes without mutation after retry deadline", async () => {
  const f = fixture(); await startFamilyPayment(f.base); f.setClock(new Date(instant.getTime() + FAMILY_PAYMENT_RETRY_MS + 1));
  const result = await startFamilyPayment(f.base); assert.equal(result.status, "checkout_session_reused"); assert.equal(f.checkoutCalls.length, 1); assert.equal(f.customerCalls.length, 1);
});
test("wrong known Session identity is never resumed, expired or written", async () => {
  const f = fixture(); await startFamilyPayment(f.base); const before = clone(f.state.payments[0]);
  const result = await startFamilyPayment({ ...f.base, resolveDraft: args => resolveStripeCheckoutDraftBlocker({ ...args,
    retrieve: async () => ({ ok: true, configured: true, provider: "stripe", session: { ...f.session(), raw: { ...f.session().raw as Record<string, unknown>, customer: "cus_foreign" } } }),
    expire: async () => { throw new Error("Unsafe expire"); } }) });
  assert.equal(result.ok, false); assert.deepEqual(f.state.payments[0], before); assert.equal(f.checkoutCalls.length, 1);
});
test("valid saved-method success settles account ledger invoice and audit atomically with Payment-first locks", async () => {
  const f = fixture(); const result = await startFamilyPayment(f.saved()); assert.equal(result.status, "paid");
  assert.equal(f.state.payments[0].status, PaymentStatus.PAID); assert.equal(f.state.account.balanceCents, 0); assert.equal(f.state.ledger.length, 1);
  assert.equal(f.state.invoices[0].status, PaymentStatus.PAID); assert.equal(f.state.audits.length, 1);
  const submit = f.events.indexOf("intent"); assert.deepEqual(f.events.slice(submit + 1, submit + 3), ["payment-lock", "account-lock"]);
});
for (const change of ["amount", "customer", "method", "metadata", "object", "received", "currency", "id"]) test(`saved-method ${change} mismatch remains held without ledger writes`, async () => {
  const f = fixture(), input = f.saved(); const result = await startFamilyPayment({ ...input, submitIntent: async args => {
    const receipt = f.intent(args), raw = receipt.raw as Record<string, unknown>; if (change === "amount") receipt.amountCents = 1;
    if (change === "customer") raw.customer = "cus_foreign"; if (change === "method") raw.payment_method = "pm_foreign";
    if (change === "metadata") raw.metadata = { ...args.metadata, familyId: "foreign" }; if (change === "object") raw.object = "not_intent";
    if (change === "received") raw.amount_received = 1; if (change === "currency") raw.currency = "eur"; if (change === "id") raw.id = "pi_foreign";
    return { ok: true, configured: true, provider: "stripe", paymentIntent: receipt };
  } }); assert.equal(result.status, "confirmation_pending"); assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT); assert.equal(f.state.ledger.length, 0); assert.equal(f.state.account.balanceCents, 10000);
});
test("a valid already-sent success crossing the retry deadline still settles", async () => {
  const f = fixture(); const result = await startFamilyPayment({ ...f.saved(), submitIntent: async args => {
    f.setClock(new Date(instant.getTime() + FAMILY_PAYMENT_RETRY_MS + 1)); return f.base.submitIntent!(args);
  } }); assert.equal(result.status, "paid"); assert.equal(f.state.ledger.length, 1);
});
test("same-Intent PAID winner is recognized without double settlement; different Intent is held", async () => {
  for (const same of [true, false]) { const f = fixture(); const result = await startFamilyPayment({ ...f.saved(), submitIntent: async args => {
    const row = f.state.payments[0]; row.status = PaymentStatus.PAID; row.externalIdPlaceholder = same ? "pi_fake" : "pi_other";
    row.customFields.stripePaymentIntentId = row.externalIdPlaceholder; f.state.account.balanceCents = 0;
    return f.base.submitIntent!(args);
  } }); assert.equal(result.ok, same); assert.equal(f.state.ledger.length, 0); assert.equal(f.state.audits.length, 0); assert.equal(f.state.account.balanceCents, 0); }
});
test("same-Intent failed-to-succeeded response recovers while unrelated terminal results remain intact", async () => {
  for (const same of [true, false]) { const f = fixture(); const result = await startFamilyPayment({ ...f.saved(), submitIntent: async args => {
    const row = f.state.payments[0]; row.status = PaymentStatus.FAILED; row.customFields.stripePaymentIntentId = same ? "pi_fake" : "pi_other";
    return f.base.submitIntent!(args);
  } }); assert.equal(result.ok, same); assert.equal(f.state.ledger.length, same ? 1 : 0); }
});
test("audit failure rolls back saved-method payment ledger balance and invoice application", async () => {
  const f = fixture(); f.setAuditFailure(true); await assert.rejects(() => startFamilyPayment(f.saved()), /fake audit rollback/);
  assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT); assert.equal(f.state.account.balanceCents, 10000); assert.equal(f.state.ledger.length, 0);
  assert.equal(f.state.invoices[0].status, PaymentStatus.OPEN); assert.equal(f.state.audits.length, 0);
});
test("known saved-method processing retrieval can settle after retry deadline without new submission", async () => {
  const f = fixture(), input = f.saved(); await startFamilyPayment({ ...input, submitIntent: async args => {
    f.intentCalls.push(clone(args)); return { ok: true, configured: true, provider: "stripe", paymentIntent: f.intent(args, "processing") };
  } }); f.setClock(new Date(instant.getTime() + FAMILY_PAYMENT_RETRY_MS + 1));
  const result = await startFamilyPayment({ ...input, retrieveIntent: async () => ({ ok: true, configured: true, provider: "stripe", paymentIntent: f.intent(f.intentCalls[0]) }) });
  assert.equal(result.status, "paid"); assert.equal(f.intentCalls.length, 1); assert.equal(f.state.ledger.length, 1);
});

test("a cached saved-method decline never releases an earlier unknown outcome", async () => {
  const f = fixture(), input = f.saved(); await startFamilyPayment({ ...input, submitIntent: unknown });
  const original = clone(f.state.payments[0].customFields.familyPaymentAttemptV1);
  const result = await startFamilyPayment({ ...input, submitIntent: async args => ({ ok: false, configured: true, provider: "stripe", providerStatus: 402,
    paymentIntent: f.intent(args, "requires_payment_method") }) });
  assert.equal(result.status, "confirmation_pending"); assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT);
  assert.deepEqual(f.state.payments[0].customFields.familyPaymentAttemptV1, original); assert.equal(f.state.ledger.length, 0);
});
test("stale action-required receipt never downgrades recorded processing", async () => {
  const f = fixture(); const result = await startFamilyPayment({ ...f.saved(), submitIntent: async args => {
    const row = f.state.payments[0]; row.customFields.stripePaymentIntentId = "pi_fake"; row.customFields.stripePaymentIntentStatus = "processing";
    row.customFields.status = "director_saved_method_processing";
    return { ok: true, configured: true, provider: "stripe", paymentIntent: f.intent(args, "requires_action") };
  } }); assert.equal(result.ok, false); assert.equal(f.state.payments[0].customFields.stripePaymentIntentStatus, "processing"); assert.equal(f.state.audits.length, 0);
});
test("known changed-principal Checkout is proven and expired before a replacement claim", async () => {
  const f = fixture(); await startFamilyPayment(f.base);
  const original = clone(f.state.payments[0]);
  f.base.request.invoiceAmountCents = 5000; f.base.request.amountCents = 5000;
  f.base.request.metadata.invoiceAmountCents = "5000"; f.base.request.metadata.checkoutTotalCents = "5000";
  f.base.fields.invoiceAmountCents = "5000"; f.base.fields.checkoutTotalCents = "5000";
  const result = await startFamilyPayment(f.base);
  assert.equal(result.ok, true); assert.equal(f.state.payments.length, 2); assert.equal(f.state.payments[0].status, PaymentStatus.VOID);
  assert.equal(f.state.payments[0].amountCents, original.amountCents); assert.equal(f.state.payments[1].amountCents, 5000); assert.equal(f.checkoutCalls.length, 2);
});
for (const kind of ["checkout", "saved_method"] as const) test(`changed ownership during ${kind} response cannot retarget local payment writes`, async () => {
  for (const change of ["family", "school", "tenant"]) { const f = fixture();
    const moved = () => { if (change === "family") f.state.account.familyId = "foreign-family";
      if (change === "school") f.state.account.family.centerId = "foreign-school"; if (change === "tenant") f.state.center.organization.tenantId = "foreign-tenant"; };
    const result = kind === "checkout" ? await startFamilyPayment({ ...f.base, submitCheckout: async args => { moved(); return f.base.submitCheckout!(args); } })
      : await startFamilyPayment({ ...f.saved(), submitIntent: async args => { moved(); return f.base.submitIntent!(args); } });
    assert.equal(result.ok, false, change); assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT); assert.equal(f.state.account.balanceCents, 10000);
    assert.equal(f.state.ledger.length, 0); assert.equal(f.state.audits.length, 0);
  }
});

test("saved method requiring customer action gives an explicit held verification state", async () => {
  const f = fixture(); const result = await startFamilyPayment({ ...f.saved(), submitIntent: async args => ({ ok: true, configured: true, provider: "stripe", paymentIntent: f.intent(args, "requires_action") }) });
  assert.equal(result.ok, false); assert.equal(result.status, "confirmation_pending"); assert.match(result.error!, /additional verification/);
  assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT); assert.equal(f.state.ledger.length, 0);
});
test("conflicting persisted Intent identifiers never report a PAID winner as this payment", async () => {
  const f = fixture(); const result = await startFamilyPayment({ ...f.saved(), submitIntent: async args => {
    const row = f.state.payments[0]; row.status = PaymentStatus.PAID; row.customFields.stripePaymentIntentId = "pi_fake"; row.externalIdPlaceholder = "pi_other";
    return f.base.submitIntent!(args);
  } }); assert.equal(result.ok, false); assert.equal(f.state.ledger.length, 0); assert.equal(f.state.payments[0].externalIdPlaceholder, "pi_other");
});
test("multiple account-wide blockers hold before every provider and local mutation", async () => {
  const f = fixture(); for (const id of ["fake-a", "fake-b"]) f.state.payments.push({ id, billingAccountId: "fake-account", amountCents: 5000,
    provider: "stripe", status: PaymentStatus.DRAFT, externalIdPlaceholder: "checkout_session_pending", paidAt: null, customFields: { paymentScope: "family_balance", status: "checkout_pending" } });
  assert.equal((await startFamilyPayment(f.base)).ok, false); assert.equal(f.state.payments.length, 2); assert.deepEqual(f.events, []);
});
test("fee acceptance is recorded only after claim and preserves existing account fields", async () => {
  for (const allowed of [true, false]) { const f = fixture(), input = f.saved(); f.state.account.customFields.keep = true; f.setAllowed(allowed);
    const result = await startFamilyPayment({ ...input, acceptProcessingRecovery: { userId: "fake-director", version: "fake-v1" } });
    assert.equal(result.ok, allowed); assert.equal(Boolean(f.state.account.customFields.cardProcessingRecoveryAcceptedAt), allowed);
    assert.equal(f.state.account.customFields.keep, true); assert.equal(f.intentCalls.length, allowed ? 1 : 0);
  }
});
test("Checkout audit rollback never leaves a locally finalized unaudited receipt", async () => {
  const f = fixture(); f.setAuditFailure(true); await assert.rejects(() => startFamilyPayment(f.base), /fake audit rollback/);
  assert.equal(f.state.payments[0].status, PaymentStatus.DRAFT); assert.equal(f.state.payments[0].customFields.stripeCheckoutSessionId, undefined);
  assert.equal(f.state.payments[0].customFields.status, "checkout_pending"); assert.equal(f.state.audits.length, 0);
});
