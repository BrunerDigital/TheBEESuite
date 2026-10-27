import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let state, actor, authorized, failSerialization, failAfterTransaction, failAudit, locks, gate = Promise.resolve();
function reset() {
  actor = { id: "fake-operator", email: "operator@example.test", role: "BRAND_ADMIN", tenantId: "fake-tenant",
    identityTenantId: "fake-tenant", sessionVersion: 1, centerIds: ["fake-school"], workspace: { mode: "center", activeCenterId: "fake-school" } };
  authorized = true; failSerialization = 0; failAfterTransaction = 0; failAudit = false; locks = [];
  state = {
    invoice: { id: "fake-invoice", number: "FAKE-1", billingAccountId: "fake-account", totalCents: 22000,
      status: "PAID", dueDate: new Date("2026-01-01T00:00:00Z"), customFields: {},
      items: [{ id: "fake-item", description: "Synthetic tuition", amountCents: 22000, productId: null }] },
    account: { id: "fake-account", familyId: "fake-family", balanceCents: 0, family: { id: "fake-family", name: "Synthetic household",
      centerId: "fake-school", center: { organization: { tenantId: "fake-tenant" } } }, payments: [] },
    payment: { id: "fake-payment", billingAccountId: "fake-account", amountCents: 22000, status: "PAID", customFields: {} },
    ledger: [{ id: "fake-invoice-entry", invoiceId: "fake-invoice", paymentId: null, type: "invoice", amountCents: 22000 },
      { id: "fake-payment-entry", invoiceId: "fake-invoice", paymentId: "fake-payment", type: "payment", amountCents: -22000 }],
    audit: [],
  };
}
const snapshot = () => structuredClone({ ...state.invoice, ledgerEntries: state.ledger.filter(row => row.invoiceId === state.invoice.id), billingAccount: state.account });
const prisma = {
  async $queryRaw(query) { locks.push(query.strings.join("?")); return [{ id: "locked" }]; },
  async $transaction(fn) {
    const previous = gate; let release; gate = new Promise(resolve => { release = resolve; });
    await previous; const before = structuredClone(state);
    try {
      if (failSerialization > 0) { failSerialization--; throw Object.assign(new Error("synthetic conflict"), { code: "P2034" }); }
      const result = await fn(prisma);
      if (failAfterTransaction > 0) { failAfterTransaction--; throw Object.assign(new Error("synthetic commit conflict"), { code: "P2034" }); }
      return result;
    } catch (error) { state = before; throw error; } finally { release(); }
  },
  invoice: {
    async findUnique() { return snapshot(); }, async findUniqueOrThrow() { return snapshot(); },
    async update({ data }) { Object.assign(state.invoice, data); return snapshot(); },
    async updateMany({ where, data }) {
      if (where.status && where.status !== state.invoice.status) return { count: 0 };
      Object.assign(state.invoice, data); return { count: 1 };
    },
    async aggregate() { return { _sum: { totalCents: state.invoice.status === "OPEN" ? state.invoice.totalCents : 0 } }; },
    async findMany() { return []; },
  },
  billingAccount: {
    async findFirst({ where }) { return where.id === state.account.id && where.familyId === state.account.familyId ? structuredClone(state.account) : null; },
    async update({ data }) { state.account.balanceCents += data.balanceCents.increment ?? -data.balanceCents.decrement; return structuredClone(state.account); },
  },
  invoiceItem: {
    async update({ data }) { Object.assign(state.invoice.items[0], data); return state.invoice.items[0]; },
    async deleteMany() { state.invoice.items = state.invoice.items.slice(0, 1); },
    async create({ data }) { state.invoice.items.push({ ...data, id: "fake-new-item" }); },
  },
  payment: { async findUniqueOrThrow() { return structuredClone(state.payment); }, async update({ data }) { Object.assign(state.payment, data); return state.payment; } },
  ledgerEntry: {
    async findFirst() { return state.ledger.find(row => row.invoiceId === null && row.type === "refund" && row.amountCents > 0) ?? null; },
    async create({ data }) { const row = { ...data, id: `fake-ledger-${state.ledger.length}` }; state.ledger.push(row); return row; }
  },
  auditLog: { async create({ data }) { if (failAudit) throw new Error("synthetic audit failure"); state.audit.push(data); return data; } },
  user: { async findFirst() { return authorized ? { id: actor.id } : null; } },
  center: {
    async findUnique() { return { id: state.account.family.centerId, organization: state.account.family.center.organization }; },
    async findFirst({ where }) { return where.id === state.account.family.centerId && where.organization.tenantId === state.account.family.center.organization.tenantId ? { id: where.id } : null; },
  },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { return structuredClone(actor); }, canAccessCenter(user, id) { return user.centerIds.includes(id); },
  canManageBilling(user) { return ["BRAND_ADMIN", "BILLING_ADMIN", "CENTER_DIRECTOR"].includes(user.role); },
  canAccessAllCenters() { return false; },
} });
mock.module("@/lib/audit", { namedExports: { async writeAuditLog(user, input) { return prisma.auditLog.create({ data: { ...input, tenantId: user.tenantId, userId: user.id } }); } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
globalThis.fetch = async () => { throw new Error("Unexpected network request in synthetic invoice test"); };
const route = await import(process.env.BEE_INVOICE_CORRECTION_ROUTE ?? "../../src/app/api/billing/invoices/route.ts");
const { applyFamilyPaymentRefund } = await import("../../src/lib/family-payment-refund.ts");
const { invoicePaymentActionBlockReason } = await import("../../src/lib/invoice-payment-actions.ts");
async function refund(cents = 17000) {
  return applyFamilyPaymentRefund(prisma, { paymentId: "fake-payment", invoiceId: "fake-invoice", cumulativeRefundedCents: cents,
    chargeId: "ch_synthetic", paymentIntentId: "pi_synthetic", eventId: "evt_synthetic", refundId: `re_synthetic_${cents}` });
}
async function patch(fields = {}) {
  return route.PATCH(new NextRequest("https://example.test/api/billing/invoices", { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId: "fake-invoice", familyId: "fake-family", amountCents: 5000, reason: "Synthetic tuition correction", ...fields }) }));
}

test("220 paid minus 170 refund then revised 50 is PAID, zero owed, and unavailable for collection", async () => {
  reset(); await refund(); assert.equal(state.invoice.status, "OPEN"); assert.equal(state.account.balanceCents, 17000);
  const response = await patch(); assert.equal(response.status, 200);
  assert.equal(state.invoice.status, "PAID"); assert.equal(state.invoice.totalCents, 5000); assert.equal(state.account.balanceCents, 0);
  assert.equal(state.ledger.reduce((sum, row) => sum + row.amountCents, 0), 0);
  assert.equal(state.ledger.filter(row => row.type === "invoice_adjustment").length, 1);
  assert.equal(state.audit.length, 1); assert.equal(state.audit[0].action, "billing.invoice.updated");
  assert.equal(state.audit[0].metadata.previousTotalCents, 22000); assert.equal(state.audit[0].metadata.updatedTotalCents, 5000);
  assert.equal(state.audit[0].metadata.updatedStatus, "PAID");
  assert.match(invoicePaymentActionBlockReason({ invoiceStatus: state.invoice.status, invoiceTotalCents: state.invoice.totalCents }), /not open/);
});
test("full refund, underpayment and no payment remain OPEN; overpayment remains credited and PAID", async () => {
  for (const [refunded, revised, status, balance] of [[22000, 5000, "OPEN", 5000], [17000, 10000, "OPEN", 5000], [17000, 4000, "PAID", -1000]]) {
    reset(); await refund(refunded); assert.equal((await patch({ amountCents: revised })).status, 200);
    assert.equal(state.invoice.status, status); assert.equal(state.account.balanceCents, balance);
  }
  reset(); state.ledger = state.ledger.slice(0, 1); state.invoice.status = "OPEN"; state.account.balanceCents = 22000;
  await patch(); assert.equal(state.invoice.status, "OPEN"); assert.equal(state.account.balanceCents, 5000);
});
test("repeated and concurrent identical PATCHes write one adjustment/audit and never repeat a refund", async () => {
  reset(); await refund(); const before = state.ledger.filter(row => row.type === "refund").length;
  const responses = await Promise.all([patch(), patch()]); assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal((await patch()).status, 200); assert.equal(state.audit.length, 1);
  assert.equal(state.ledger.filter(row => row.type === "invoice_adjustment").length, 1);
  assert.equal(state.ledger.filter(row => row.type === "refund").length, before); assert.equal(state.account.balanceCents, 0);
});
test("successive concurrent corrections compute deltas from locked current totals", async () => {
  reset(); await refund(); const responses = await Promise.all([patch({ amountCents: 10000 }), patch()]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]); assert.equal(state.account.balanceCents, 0);
  assert.equal(state.ledger.filter(row => row.type === "invoice_adjustment").reduce((sum, row) => sum + row.amountCents, 0), -17000);
});
test("unauthorized role, school, foreign tenant, changed authority and mismatched family cannot mutate", async () => {
  for (const change of [() => { actor.role = "TEACHER"; }, () => { actor.centerIds = []; },
    () => { state.account.family.center.organization.tenantId = "foreign-tenant"; }, () => { authorized = false; }]) {
    reset(); await refund(); change(); const response = await patch(); assert.ok([403, 404].includes(response.status));
    assert.equal(state.invoice.totalCents, 22000); assert.equal(state.audit.length, 0);
  }
  reset(); await refund(); assert.equal((await patch({ familyId: "foreign-family" })).status, 403);
});
test("voided and paid invoices cannot be changed, zero is rejected, and payment activity still blocks void", async () => {
  reset(); assert.equal((await patch()).status, 400);
  reset(); state.invoice.status = "VOID"; assert.equal((await patch()).status, 400);
  reset(); await refund(); assert.equal((await patch({ amountCents: 0 })).status, 400);
  assert.equal((await patch({ mode: "void", reason: "Synthetic invalid void" })).status, 409);
});
test("serialization retries recompute once, and audit failure rolls back the entire correction", async () => {
  reset(); await refund(); locks = []; failSerialization = 1; assert.equal((await patch()).status, 200); assert.equal(state.audit.length, 1);
  assert.match(locks[0], /BillingAccount/); assert.match(locks[1], /Invoice/);
  reset(); await refund(); failAfterTransaction = 1; assert.equal((await patch()).status, 200);
  assert.equal(state.account.balanceCents, 0); assert.equal(state.audit.length, 1);
  assert.equal(state.ledger.filter(row => row.type === "invoice_adjustment").length, 1);
  reset(); await refund(); failAudit = true; await assert.rejects(patch(), /synthetic audit failure/);
  assert.equal(state.invoice.totalCents, 22000); assert.equal(state.invoice.status, "OPEN"); assert.equal(state.account.balanceCents, 17000);
  assert.equal(state.ledger.filter(row => row.type === "invoice_adjustment").length, 0);
});
test("only this invoice's payment allocation is counted, net of its refund", async () => {
  reset(); state.invoice.totalCents = 12000; state.invoice.items[0].amountCents = 12000;
  state.ledger[0].amountCents = 12000; state.ledger[1].amountCents = -12000;
  // The same gross 220 payment allocated the other 100 to another invoice.
  state.ledger.push({ invoiceId: "other-invoice", paymentId: null, type: "invoice", amountCents: 10000 },
    { invoiceId: "other-invoice", paymentId: "fake-payment", type: "payment", amountCents: -10000 });
  await refund(7000); assert.equal((await patch()).status, 200);
  assert.equal(state.invoice.status, "PAID"); assert.equal(state.account.balanceCents, 0);
  assert.equal(state.ledger.filter(row => row.invoiceId === "other-invoice").length, 2);
});
test("an unrelated family credit or absent invoice ledger cannot prove this invoice paid", async () => {
  reset(); state.invoice.status = "OPEN"; state.ledger = []; await patch(); assert.equal(state.invoice.status, "OPEN");
  reset(); await refund(); state.account.balanceCents = 0; await patch({ amountCents: 10000 }); assert.equal(state.invoice.status, "OPEN");
});

function creditFirstPayment() {
  reset(); state.payment.amountCents = 5000; state.ledger[1].amountCents = -5000;
  state.invoice.customFields = { paidWithAccountCredit: true, accountCreditAppliedCents: 17000 };
  state.ledger.push({ invoiceId: "fake-invoice", paymentId: "fake-payment", type: "account_credit_application", amountCents: 0,
    sourceSystem: "bee_suite", externalId: "account-credit:invoice:fake-invoice",
    metadata: { accountCreditAppliedCents: 17000, invoiceTotalCents: 22000, stripeChargePrincipalCents: 5000 } });
}
test("canonical zero-dollar allocated credit plus net payment settles the corrected invoice without another balance debit", async () => {
  creditFirstPayment(); await refund(5000); assert.equal(state.account.balanceCents, 5000);
  assert.equal((await patch({ amountCents: 17000 })).status, 200);
  assert.equal(state.invoice.status, "PAID"); assert.equal(state.account.balanceCents, 0);
  assert.equal(state.audit[0].metadata.accountCreditAllocatedCents, 17000);
  assert.equal(state.audit[0].metadata.invoiceOutstandingAfterCents, 0);
  assert.equal(state.ledger.filter(row => row.type === "account_credit_application").length, 1);
});
test("duplicate or malformed credit markers fail closed; a nonzero credit is not subtracted twice", async () => {
  for (const malformed of [false, true]) {
    creditFirstPayment(); await refund(5000);
    if (malformed) state.ledger.at(-2).metadata = {};
    else state.ledger.push(structuredClone(state.ledger.find(row => row.type === "account_credit_application")));
    assert.equal((await patch({ amountCents: 17000 })).status, 409);
    assert.equal(state.invoice.totalCents, 22000); assert.equal(state.audit.length, 0);
  }
  creditFirstPayment(); state.ledger[2].amountCents = -17000; await refund(5000);
  assert.equal((await patch({ amountCents: 17000 })).status, 200);
  assert.equal(state.invoice.status, "PAID"); assert.equal(state.account.balanceCents, 0);
  assert.equal(state.audit[0].metadata.accountCreditAllocatedCents, 0);
});
test("unallocated household refunds and pool-settled invoices cannot manufacture invoice coverage", async () => {
  creditFirstPayment(); await refund(5000);
  state.ledger.push({ invoiceId: null, type: "refund", amountCents: 17000 }); state.account.balanceCents += 17000;
  assert.equal((await patch({ amountCents: 17000 })).status, 409); assert.equal(state.invoice.totalCents, 22000);
  for (const flag of ["paidByBalancePayment", "paidByAccountCredit", "paidWithAccountCredit"]) {
    reset(); state.invoice.status = "OPEN"; state.invoice.customFields[flag] = true;
    state.ledger[1].invoiceId = null;
    assert.equal((await patch()).status, 409, `Missing allocation marker must fail closed for ${flag}`);
    assert.equal(state.audit.length, 0);
  }
});
