import assert from "node:assert/strict";
import test from "node:test";
import { billingCategory, billingContextUrl, billingFamilySecondaryLabel, billingSection } from "../src/lib/billing-workspace-context";
import { isBillingAccountOverview, requestBillingAccountOverview, type BillingAccountOverview } from "../src/lib/billing-account-overview";

const target = { familyId: "family-a", centerId: "school-a", billingAccountId: "account-a" };
const summary: BillingAccountOverview = { ...target, postedBalanceCents: 24500, collectibleCents: 14500, pendingCount: 1, provisionalAchCreditCents: 10000, responsibilityReviewRequired: false };
const flush = () => new Promise(resolve => setImmediate(resolve));

test("context URLs preserve the exact school, family, category, section and unrelated filters", () => {
  const url = new URL(billingContextUrl("https://example.test/billing-invoices?invoiceStatus=paid&childId=old&q=rivera#billing-actions", { familyId: "a&b", centerId: "school two", section: "ledger", category: "past" }, true), "https://example.test");
  assert.equal(url.searchParams.get("familyId"), "a&b");
  assert.equal(url.searchParams.get("centerId"), "school two");
  assert.equal(url.searchParams.get("billingSection"), "ledger");
  assert.equal(url.searchParams.get("billingCategory"), "past");
  assert.equal(url.searchParams.get("invoiceStatus"), "paid");
  assert.equal(url.searchParams.get("childId"), null);
  assert.equal(url.hash, "");
  assert.equal(billingSection("unexpected"), "overview");
  assert.equal(billingCategory("unexpected"), "current");
});

test("empty account groups persist without silently falling back to another family", () => {
  const url = new URL(billingContextUrl("https://example.test/billing-invoices?familyId=old", { familyId: "", centerId: "school-a", section: "overview", category: "prospective" }), "https://example.test");
  assert.equal(url.searchParams.has("familyId"), false);
  assert.equal(url.searchParams.get("billingCategory"), "prospective");
});

test("duplicate household names and emails remain distinguishable by child and exact account", () => {
  const a = { id: "account-a", billingEmail: "shared@example.com", children: [{ fullName: "Ava Rivera" }] };
  const b = { ...a, id: "account-b", children: [{ fullName: "Liam Rivera" }] };
  assert.notEqual(billingFamilySecondaryLabel(a), billingFamilySecondaryLabel(b));
  assert.match(billingFamilySecondaryLabel(a), /Ava Rivera.*account-a/);
  assert.equal(billingFamilySecondaryLabel({ id: "fallback" }), "Account fallback");
});

test("summary responses require exact family, school, account and safe financial values", () => {
  assert.equal(isBillingAccountOverview(summary, target), true);
  for (const patch of [{ familyId: "other" }, { centerId: "other" }, { billingAccountId: "other" }, { collectibleCents: -1 }, { collectibleCents: 1.5 }, { pendingCount: -1 }, { provisionalAchCreditCents: NaN }]) {
    assert.equal(isBillingAccountOverview({ ...summary, ...patch }, target), false);
  }
  assert.equal(isBillingAccountOverview({ ...summary, postedBalanceCents: -500 }, target), true);
});

test("rapid switching discards an old response even when its transport ignores abort", async () => {
  let resolveOld!: (value: unknown) => void;
  let oldSignal!: AbortSignal;
  const results: BillingAccountOverview[] = [];
  const errors: string[] = [];
  const cancel = requestBillingAccountOverview({ target, read: signal => { oldSignal = signal; return new Promise(resolve => { resolveOld = resolve; }); }, onResult: value => results.push(value), onError: () => errors.push("old") });
  cancel();
  const next = { ...summary, familyId: "family-b", billingAccountId: "account-b" };
  requestBillingAccountOverview({ target: next, read: async () => next, onResult: value => results.push(value), onError: () => errors.push("new") });
  await flush();
  resolveOld(summary);
  await flush();
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(results, [next]);
  assert.deepEqual(errors, []);
});

test("mismatched current responses produce an actionable error; cancelled errors stay silent", async () => {
  let errors = 0;
  requestBillingAccountOverview({ target, read: async () => ({ ...summary, familyId: "wrong" }), onResult: () => assert.fail("must not display"), onError: () => errors++ });
  await flush();
  assert.equal(errors, 1);
  const cancel = requestBillingAccountOverview({ target, read: async () => { throw new Error("delayed network error"); }, onResult: () => assert.fail(), onError: () => errors++ });
  cancel();
  await flush();
  assert.equal(errors, 1);
});
