import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let user, linked, account, drafts, receipt, invoiceIds, reads, failQuery;
const payment = (patch = {}) => ({ id: "fake-payment", amountCents: 5000, status: "DRAFT", provider: "stripe", customFields: {
  status: "checkout_submission_unknown", invoiceId: "fake-invoice", paymentMethodCategory: "card", secret: "fake-private-do-not-return" }, ...patch });
function reset() {
  user = { id: "fake-parent", tenantId: "fake-tenant", role: "PARENT_GUARDIAN" }; linked = true; account = { id: "fake-account" };
  drafts = [payment()]; receipt = payment(); invoiceIds = ["fake-invoice"]; reads = 0; failQuery = false;
}
reset();
mock.module("@/lib/auth", { namedExports: { getCurrentUser: async () => user, isParentGuardian: value => value.role === "PARENT_GUARDIAN" } });
mock.module("@/lib/parent-portal-family-scope", { namedExports: { async getParentPortalPaymentFamilyScope(id, tenantId, familyId) {
  assert.equal(id, "fake-parent"); assert.equal(tenantId, "fake-tenant"); reads++;
  return { ok: linked && familyId === "fake-family", familyId: "fake-family" };
} } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(method, handler, options) {
  assert.equal(method, "GET"); assert.deepEqual(options, { omitRequestBody: true, omitResponseBody: true }); return handler;
} } });
const prisma = {
  billingAccount: { async findFirst({ where, select }) { reads++; assert.deepEqual(where, { familyId: "fake-family" }); assert.deepEqual(select, { id: true }); if (failQuery) throw new Error("fake database failure"); return account; } },
  invoice: {
    async findFirst({ where }) { reads++; assert.equal(where.billingAccountId, "fake-account"); return invoiceIds.includes(where.id) ? { id: where.id } : null; },
    async findMany({ where, select }) { reads++; assert.equal(where.billingAccountId, "fake-account"); assert.deepEqual(select, { id: true }); return invoiceIds.filter(id => where.id.in.includes(id)).map(id => ({ id })); },
  },
  payment: {
    async findMany({ where, select, ...rest }) { reads++; assert.deepEqual(rest, {}); assert.deepEqual(where, { billingAccountId: "fake-account", status: "DRAFT", provider: { in: ["stripe", "stripe_terminal"] } }); assert.deepEqual(Object.keys(select).sort(), ["amountCents", "customFields", "id", "provider", "status"]); return drafts; },
    async findFirst({ where }) { reads++; assert.equal(where.billingAccountId, "fake-account"); assert.deepEqual(where.provider, { in: ["stripe", "stripe_terminal"] }); return receipt?.id === where.id ? receipt : null; },
  },
};
for (const model of Object.values(prisma)) for (const method of ["create", "update", "updateMany", "delete", "upsert"]) model[method] = async () => { throw new Error("Payment observation must not mutate"); };
mock.module("@/lib/prisma", { namedExports: { prisma } });
globalThis.fetch = async () => { throw new Error("No provider/network in observation route"); };
const { GET } = await import("../../src/app/api/parent/payment-status/route.ts");
async function run(query = "familyId=fake-family&requestNonce=fake-nonce") {
  const response = await GET(new NextRequest(`https://example.test/api/parent/payment-status?${query}`));
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  return { status: response.status, body: await response.json() };
}

test("signed out and pickup/staff roles stop before any family data", async () => {
  for (const role of [null, "AUTHORIZED_PICKUP", "TEACHER", "CENTER_DIRECTOR", "BILLING_ADMIN", "PLATFORM_OWNER"]) {
    reset(); user = role ? { ...user, role } : null;
    assert.equal((await run()).status, role ? 403 : 401); assert.equal(reads, 0);
  }
});
test("explicit target, single parameters and bounded values are required", async () => {
  for (const query of ["", "familyId=fake-family", "familyId=fake-family&requestNonce=x&familyId=other", "familyId=fake-family&requestNonce=x&billingAccountId=other", "familyId=../foreign&requestNonce=x", "familyId=fake-family&requestNonce=x&paymentId="]) {
    reset(); assert.equal((await run(query)).status, 400); assert.equal(reads, 0);
  }
});
test("removed guardian and foreign family fail closed", async () => {
  reset(); linked = false; assert.equal((await run()).status, 403); assert.equal(reads, 1);
  reset(); assert.equal((await run("familyId=foreign&requestNonce=x")).status, 403); assert.equal(reads, 1);
});
test("missing account, foreign invoice and database errors cannot appear as a clear account", async () => {
  reset(); account = null; assert.equal((await run()).status, 404);
  reset(); assert.equal((await run("familyId=fake-family&requestNonce=x&invoiceId=foreign")).status, 404);
  reset(); failQuery = true; assert.equal((await run()).status, 503);
});
test("complete scoped drafts include off-page Terminal and omit raw private metadata", async () => {
  reset(); drafts = Array.from({ length: 35 }, (_, index) => payment({ id: `fake-${index}` }));
  drafts.push(payment({ id: "fake-terminal", provider: "stripe_terminal", customFields: { status: "terminal_processing", invoiceId: "fake-hidden" } })); invoiceIds.push("fake-hidden");
  const { status, body } = await run(); assert.equal(status, 200); assert.equal(body.accountPaymentBlocker.count, 36);
  assert.deepEqual(body.invoicePayments.map(item => item.invoiceId).sort(), ["fake-hidden", "fake-invoice"]);
  assert.doesNotMatch(JSON.stringify(body), /fake-private|customFields|stripePaymentIntent|secret|fake-terminal/);
});
test("cross-account invoice metadata is never echoed", async () => {
  reset(); drafts = [payment({ customFields: { status: "checkout_created", invoiceId: "foreign-invoice" } })];
  const { body } = await run(); assert.equal(body.accountPaymentBlocker.count, 1); assert.deepEqual(body.invoicePayments, []);
  assert.doesNotMatch(JSON.stringify(body), /foreign-invoice/);
});
test("empty drafts and missing receipt never proves failure", async () => {
  reset(); drafts = []; let result = await run(); assert.equal(result.body.outcome, "unidentified"); assert.equal(result.body.accountPaymentBlocker, null);
  result = await run("familyId=fake-family&requestNonce=x&paymentId=foreign"); assert.equal(result.status, 404);
  reset(); result = await run("familyId=fake-family&requestNonce=x&paymentId=fake-payment&invoiceId=fake-hidden"); assert.equal(result.status, 404);
});
test("only an exact unambiguous paid receipt reports settled, failures and returns remain unresolved", async () => {
  const query = "familyId=fake-family&requestNonce=x&paymentId=fake-payment&invoiceId=fake-invoice";
  reset(); assert.equal((await run(query)).body.outcome, "active");
  reset(); receipt = payment({ status: "PAID", customFields: { invoiceId: "fake-invoice", status: "paid", stripePaymentIntentStatus: "succeeded" } }); drafts = [];
  assert.equal((await run(query)).body.outcome, "settled");
  for (const [status, fields] of [["FAILED", { status: "checkout_failed" }], ["VOID", {}], ["PAID", { status: "payment_returned" }], ["PAID", { status: "checkout_submission_unknown" }], ["PAID", { stripeDisputeLedgerActive: true }], ["PAID", { stripePaymentIntentStatus: "processing" }]]) {
    reset(); drafts = []; receipt = payment({ status, customFields: { invoiceId: "fake-invoice", ...fields } });
    assert.equal((await run(query)).body.outcome, "unresolved");
  }
});
