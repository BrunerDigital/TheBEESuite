import assert from "node:assert/strict";
import { test } from "node:test";
import { readSchoolPaymentsSnapshot, schoolPaymentsLocalQuery, schoolPaymentsWindow, SCHOOL_PAYMENT_LOCAL_LIMIT } from "../src/lib/school-payments-readonly-adapter";
import { buildSchoolPaymentsReadView } from "../src/lib/school-payments-readonly";
import { paymentsAuthority, paymentsLocalRow, paymentsProviderFixture } from "./helpers/school-payments-integration-fixtures";

const window = schoolPaymentsWindow("2026-11-17", "2026-11-23");
test("local query uses the server-authorized school, 501 sentinel, and includes earlier payments refunded in this window", () => {
  const q = schoolPaymentsLocalQuery("fixture_school", window);
  assert.equal(q.take, 501); assert.equal(q.select.ledgerEntries.take, 101);
  assert.deepEqual(q.where.billingAccount.family, { centerId: "fixture_school" });
  assert.deepEqual(q.where.OR[1], { ledgerEntries: { some: { type: "refund", createdAt: { gte: window.start, lte: window.end } } } });
});
test("current-account reads exhaust only known pages; paid payout never becomes a bank-confirmed deposit", async () => {
  const a = paymentsAuthority(), f = paymentsProviderFixture();
  const input = await readSchoolPaymentsSnapshot(a, window, f.providers), view = buildSchoolPaymentsReadView({ ...a, ...input });
  assert.deepEqual(f.calls.sort(), ["local", "payouts", "transactions"]);
  assert.equal(input.availability.payments, "complete"); assert.equal(input.availability.payouts, "complete");
  assert.equal(input.availability.history, "unavailable"); assert.equal(input.availability.balances, "unavailable");
  assert.equal(view.payouts[0].status, "paid"); assert.equal(view.payouts[0].reconciliation, "unconfirmed");
  assert.equal(view.payouts[0].bankPosting, "Bank posting: Unconfirmed");
  assert.equal(input.evidence!.comparison, "not_comparable");
  assert.equal(JSON.stringify(view).includes("acct_school_a"), false); assert.equal(JSON.stringify(view).includes("po_fixture_1234"), false);
});
test("501st local row and child-ledger sentinel mark partial without calculating a complete total", async () => {
  const f = paymentsProviderFixture();
  f.providers.local = async () => Array.from({ length: 501 }, (_, i) => paymentsLocalRow(`fixture_payment_${i}`));
  const r = await readSchoolPaymentsSnapshot(paymentsAuthority(), window, f.providers);
  assert.equal(r.payments.length, SCHOOL_PAYMENT_LOCAL_LIMIT); assert.equal(r.availability.payments, "partial");
  assert.equal(r.evidence!.sources[0].reason, "local_limit"); assert.equal("totalCents" in r, false);
  const row = paymentsLocalRow(); row.ledgerEntries = Array.from({ length: 101 }, (_, i) => ({ ...row.ledgerEntries[0], id: `fixture_entry_${i}` }));
  f.providers.local = async () => [row];
  assert.equal((await readSchoolPaymentsSnapshot(paymentsAuthority(), window, f.providers)).evidence!.sources[0].reason, "ledger_limit");
  row.ledgerEntries = row.ledgerEntries.map(e => ({ ...e, type: "refund", amountCents: 1 }));
  assert.equal((await readSchoolPaymentsSnapshot(paymentsAuthority(), window, f.providers)).payments[0].allocation, "unavailable", "A truncated ledger cannot prove no allocation");
});

test("coverage projection rejects a complete claim when pagination or source evidence is partial", async () => {
  const a = paymentsAuthority(), r = await readSchoolPaymentsSnapshot(a, window, paymentsProviderFixture().providers);
  r.evidence!.sources[0] = { ...r.evidence!.sources[0], availability: "complete", reason: "provider_has_more" };
  assert.throws(() => buildSchoolPaymentsReadView({ ...a, ...r }), /Invalid source coverage/);
});
test("one provider page with more, unknown pagination, unsupported currency or missing event time is partial", async () => {
  for (const issue of ["more", "unknown", "currency", "time"] as const) {
    const f = paymentsProviderFixture(), page = await f.providers.payouts(), tx = await f.providers.balanceTransactions();
    if (issue === "more") { page.hasMore = true; tx.hasMore = true; }
    if (issue === "unknown") { page.pageComplete = false; tx.pageComplete = false; }
    if (issue === "currency") { page.rows[0].currency = "eur"; tx.rows[0].currency = "eur"; }
    if (issue === "time") { page.rows[0].createdAt = ""; tx.rows[0].createdAt = ""; }
    const r = await readSchoolPaymentsSnapshot(paymentsAuthority(), window, { ...f.providers, payouts: async () => page, balanceTransactions: async () => tx });
    assert.equal(r.availability.payouts, "partial", issue);
    assert.equal(r.evidence!.sources.find(s => s.source === "stripe_balance_transactions")!.availability, "partial", issue);
  }
});
test("null, missing, platform and prior-account provenance are withheld; never mapped onto today's school account", async () => {
  for (const fields of [{}, { stripeConnectedAccountId: null, stripeChargeType: "platform" }, { stripeConnectedAccountId: "", stripeChargeType: "platform" },
    { stripeConnectedAccountId: "acct_previous", stripeChargeType: "direct" }, { stripeConnectedAccountId: "acct_school_a", stripeChargeType: "destination" }]) {
    const f = paymentsProviderFixture(), row = paymentsLocalRow(); row.customFields = fields;
    const r = await readSchoolPaymentsSnapshot(paymentsAuthority(), window, { ...f.providers, local: async () => [row] });
    assert.equal(r.payments.length, 0); assert.equal(r.availability.payments, "partial");
    assert.equal(r.evidence!.sources[0].reason, "missing_account_provenance");
  }
});
test("refund recorded now preserves earlier collection and unknown processor event time; lifetime cumulative refund is not window activity", async () => {
  const f = paymentsProviderFixture(), row = paymentsLocalRow(); row.paidAt = new Date("2026-10-01T12:00:00Z"); row.status = "REFUNDED";
  row.customFields = { ...row.customFields as object, stripeAmountRefundedCents: 10000 };
  row.ledgerEntries.push({ id: "fixture_refund", type: "refund", amountCents: 3000, createdAt: new Date("2026-11-20T14:00:00Z") });
  const r = await readSchoolPaymentsSnapshot(paymentsAuthority(), window, { ...f.providers, local: async () => [row] });
  assert.equal(r.payments[0].collectionInWindow, false); assert.equal(r.payments[0].amountCents, 10000);
  assert.equal(r.evidence!.refunds[0].amountCents, 3000);
  assert.equal(r.evidence!.refunds[0].collectedAt, "2026-10-01T12:00:00.000Z");
  assert.equal(r.evidence!.refunds[0].ledgerRecordedAt, "2026-11-20T14:00:00.000Z");
  assert.equal(r.evidence!.refunds[0].providerEventAt, null); assert.equal(r.evidence!.comparison, "not_comparable");
});
test("provider failure is independent and never falls back to a live provider or financial mutation", async () => {
  const f = paymentsProviderFixture();
  const r = await readSchoolPaymentsSnapshot(paymentsAuthority(), window, { ...f.providers, local: async () => { throw Error("fixture failure"); }, payouts: async () => { throw Error("fixture failure"); } });
  assert.equal(r.availability.payments, "unavailable"); assert.equal(r.availability.payouts, "unavailable");
  assert.equal(r.evidence!.sources.find(s => s.source === "stripe_balance_transactions")!.availability, "complete");
});
test("expired checkout and collected payment awaiting display refresh remain distinct", async () => {
  const f = paymentsProviderFixture(), expired = paymentsLocalRow("fixture_expired"), refresh = paymentsLocalRow("fixture_refresh");
  expired.status = refresh.status = "DRAFT"; expired.paidAt = refresh.paidAt = null; expired.ledgerEntries = refresh.ledgerEntries = [];
  expired.customFields = { ...expired.customFields as object, stripeCheckoutSessionStatus: "expired" };
  refresh.customFields = { ...refresh.customFields as object, stripeCheckoutPaymentStatus: "paid" };
  const r = await readSchoolPaymentsSnapshot(paymentsAuthority(), window, { ...f.providers, local: async () => [expired, refresh] });
  assert.equal(r.payments[0].collection, "not_collected"); assert.equal(r.payments[0].checkout, "expired");
  assert.equal(r.payments[1].collection, "captured"); assert.equal(r.payments[1].display, "refresh_pending"); assert.equal(r.payments[1].allocation, "unavailable");
  assert.equal(r.availability.payments, "partial");
});
test("school mismatches are not exposed even if an injected reader violates its query", async () => {
  const f = paymentsProviderFixture(), row = paymentsLocalRow(); row.billingAccount.family.centerId = "foreign";
  assert.equal((await readSchoolPaymentsSnapshot(paymentsAuthority(), window, { ...f.providers, local: async () => [row] })).payments.length, 0);
});
test("invalid, reversed, impossible and overlong windows are rejected", () => {
  for (const [start, end] of [["2026-02-30", "2026-03-02"], ["2026-11-23", "2026-11-20"], ["2026-01-01", "2026-11-23"], ["invalid", "2026-11-23"]]) assert.throws(() => schoolPaymentsWindow(start, end));
});
