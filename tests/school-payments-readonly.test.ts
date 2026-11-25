import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchoolPaymentsReadView, SCHOOL_PAYMENTS_READ_FEATURES } from "../src/lib/school-payments-readonly";
import { schoolPaymentsFixture } from "./helpers/school-payments-fixtures";
test("native Payments projection allows only four read features and strips provider/secret payloads", () => {
  const fixture = schoolPaymentsFixture(); Object.assign(fixture.payments[0], { client_secret: "synthetic-omit", bankNumber: "synthetic-omit", refundAllowed: true });
  const view = buildSchoolPaymentsReadView(fixture);
  assert.deepEqual(view.features, SCHOOL_PAYMENTS_READ_FEATURES);
  assert.deepEqual(view.features, ["payment_status", "balances", "payout_history", "deposit_reconciliation"]);
  assert.equal(JSON.stringify(view).includes("synthetic-omit"), false);
  assert.equal(JSON.stringify(view).includes("refundAllowed"), false);
  assert.equal(view.payouts[0].reconciliation, "unconfirmed", "A paid payout and matching ledger do not prove a bank deposit");
});
for (const field of ["tenantId", "centerId", "accountId"] as const) test(`Payments rejects foreign ${field}, including nested evidence`, () => {
  for (const kind of ["payments", "balances", "payouts", "ledger", "deposit"] as const) {
    const f = schoolPaymentsFixture();
    if (kind === "ledger") f.payouts[0].ledger![field] = "foreign";
    else if (kind === "deposit") f.payouts[0].depositEvidence = { ...f.scope, payoutId: "payout_1", amountCents: 97000, currency: "usd", reference: "Synthetic deposit", source: "bank_posting", postingStatus: "posted", verified: true, [field]: "foreign" };
    else f[kind][0][field] = "foreign";
    assert.throws(() => buildSchoolPaymentsReadView(f), /does not match/);
  }
});
test("deposit matching requires correct payout, ledger net, currency, amount, evidence and paid state", () => {
  const f = schoolPaymentsFixture(); f.payouts[0].depositEvidence = { ...f.scope, payoutId: "payout_1", amountCents: 97000, currency: "usd", reference: "Synthetic deposit 81", source: "bank_posting", postingStatus: "posted", verified: true };
  assert.equal(buildSchoolPaymentsReadView(f).payouts[0].reconciliation, "matched");
  f.payouts[0].ledger!.netCents = 96999;
  assert.equal(buildSchoolPaymentsReadView(f).payouts[0].reconciliation, "review");
  f.payouts[0].ledger!.netCents = 97000; f.payouts[0].status = "in_transit";
  assert.equal(buildSchoolPaymentsReadView(f).payouts[0].reconciliation, "unconfirmed");
  f.payouts[0].depositEvidence.payoutId = "another_payout";
  assert.throws(() => buildSchoolPaymentsReadView(f), /another payout/);
});
test("processor trace alone never confirms a bank deposit, and unverified bank evidence stays unconfirmed", () => {
  const f = schoolPaymentsFixture();
  f.payouts[0].depositEvidence = { ...f.scope, payoutId: "payout_1", amountCents: 97000, currency: "usd", reference: "synthetic_trace", source: "processor_trace", postingStatus: "posted", verified: true };
  let view = buildSchoolPaymentsReadView(f); assert.equal(view.payouts[0].reconciliation, "unconfirmed");
  assert.equal(view.payouts[0].bankPosting, "Bank posting: Unconfirmed (processor trace only)");
  f.payouts[0].depositEvidence.source = "bank_posting"; f.payouts[0].depositEvidence.verified = false;
  view = buildSchoolPaymentsReadView(f); assert.equal(view.payouts[0].reconciliation, "unconfirmed");
});
test("replacement history requires authoritative original-account binding and cannot mix payout evidence", () => {
  const f = schoolPaymentsFixture(); const payout = f.payouts[0];
  payout.accountId = "acct_prior_a"; payout.ledger!.accountId = "acct_prior_a";
  assert.throws(() => buildSchoolPaymentsReadView(f), /does not match/);
  f.historyBindings.push({ ...f.scope, accountId: "acct_prior_a", bindingId: "synthetic_verified_history", verified: true, source: "authoritative_center_account_history" });
  const view = buildSchoolPaymentsReadView(f); assert.equal(view.payouts[0].originAccount, "Prior account …or_a");
  assert.equal(JSON.stringify(view).includes("acct_prior_a"), false); assert.equal(JSON.stringify(view).includes("payout_1"), false);
  payout.depositEvidence = { ...f.scope, payoutId: payout.id, amountCents: payout.amountCents, currency: "usd", reference: "Same day and last four", source: "bank_posting", postingStatus: "posted", verified: true };
  assert.throws(() => buildSchoolPaymentsReadView(f), /another account/);
  f.historyBindings[0].verified = false; assert.throws(() => buildSchoolPaymentsReadView(f), /binding requires review/);
});
test("expired checkout is uncollected while a captured payment can await display refresh independently", () => {
  const f = schoolPaymentsFixture(); f.payments[0].collection = "not_collected"; f.payments[0].allocation = "not_allocated"; f.payments[0].checkout = "expired";
  let p = buildSchoolPaymentsReadView(f).payments[0]; assert.equal(p.collection, "No completed payment"); assert.equal(p.checkout, "Checkout expired");
  f.payments[0].collection = "captured"; f.payments[0].allocation = "allocated"; f.payments[0].checkout = "completed"; f.payments[0].display = "refresh_pending";
  p = buildSchoolPaymentsReadView(f).payments[0]; assert.equal(p.collection, "Payment captured"); assert.equal(p.allocation, "Allocated to ledger"); assert.equal(p.display, "Display refresh pending");
});
test("unsupported currencies, duplicate balances and unsafe monetary values fail closed", () => {
  const f = schoolPaymentsFixture(); f.balances[0].currency = "jpy";
  assert.throws(() => buildSchoolPaymentsReadView(f), /Unsupported currency/);
  f.balances[0].currency = "usd"; f.balances.push({ ...f.balances[0] });
  assert.throws(() => buildSchoolPaymentsReadView(f), /Duplicate currency/);
  f.balances.pop(); f.payments[0].amountCents = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => buildSchoolPaymentsReadView(f), /Invalid monetary/);
});
test("unverified account, unknown topology and unavailable read capability never fall back to a platform view", () => {
  for (const mutate of [
    (f: ReturnType<typeof schoolPaymentsFixture>) => { f.scope.accountVerified = false; },
    (f: ReturnType<typeof schoolPaymentsFixture>) => { f.scope.dashboard = "unknown"; },
    (f: ReturnType<typeof schoolPaymentsFixture>) => { f.scope.chargeTopology = "platform_destination"; },
    (f: ReturnType<typeof schoolPaymentsFixture>) => { f.scope.readCapabilities.payouts = false; },
    (f: ReturnType<typeof schoolPaymentsFixture>) => { f.scope.readCapabilities.balances = false; },
    (f: ReturnType<typeof schoolPaymentsFixture>) => { f.scope.readCapabilities.paymentStatus = false; },
  ]) { const f = schoolPaymentsFixture(); mutate(f); assert.throws(() => buildSchoolPaymentsReadView(f), /capabilities require review/); }
});
