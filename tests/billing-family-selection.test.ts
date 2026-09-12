import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { billingSelectionKey, billingWorkspaceTarget, exactBillingFamilyHref, resolveBillingChildSelection, resolveBillingFamilySelection } from "../src/lib/billing-family-selection";

const families = [{ id: "a", centerId: "one" }, { id: "b", centerId: "two" }];
const base = { families, allowedCenterIds: ["one", "two"] };

test("an explicit stale or other-family child never substitutes a sibling", () => {
  const children = [{ id: "child-a" }, { id: "child-b" }];
  assert.equal(resolveBillingChildSelection(children, "other-family-child"), null);
  assert.equal(resolveBillingChildSelection(children, "removed-child"), null);
  assert.equal(resolveBillingChildSelection(children, "child-b")?.id, "child-b");
  assert.equal(resolveBillingChildSelection(children, "", (child) => child.id === "child-b")?.id, "child-b");
});

test("explicit missing or mismatched billing targets never select another family", () => {
  for (const request of [{ requestedFamilyId: "missing" }, { requestedFamilyId: "b", requestedCenterId: "one" }, { requestedFamilyId: "a", requestedCenterId: "outside" }]) {
    const result = resolveBillingFamilySelection({ ...base, ...request, matchesSearch: () => true });
    assert.equal(result.family, null);
    assert.equal(result.familyId, "");
    assert.match(result.error!, /No other family has been selected/);
  }
  assert.equal(resolveBillingFamilySelection({ ...base, allowedCenterIds: ["one"], requestedFamilyId: "b" }).family, null);
});

test("ordinary entry and deliberate exact links select only authorized school matches", () => {
  assert.equal(resolveBillingFamilySelection({ ...base, requestedFamilyId: "", requestedCenterId: "" }).centerId, "one");
  assert.equal(resolveBillingFamilySelection({ ...base, requestedCenterId: "two" }).familyId, "b");
  assert.equal(resolveBillingFamilySelection({ ...base, matchesSearch: (family) => family.id === "b" }).familyId, "b");
  assert.equal(resolveBillingFamilySelection({ ...base, requestedFamilyId: "a", matchesSearch: () => true }).familyId, "a");
  assert.equal(resolveBillingFamilySelection({ families: [{ id: "orphan", centerId: null }], allowedCenterIds: [] }).family, null);
});

test("historical visibility does not confer writable eligibility, even without ledger entries", () => {
  const input = { ...base, historicalFamilies: [{ id: "past", centerId: "one" }] };
  assert.equal(billingWorkspaceTarget(input), "default");
  assert.equal(billingWorkspaceTarget({ ...input, requestedFamilyId: "b" }), "eligible");
  assert.equal(billingWorkspaceTarget({ ...input, requestedFamilyId: "past" }), "history");
  assert.equal(billingWorkspaceTarget({ ...input, requestedFamilyId: "past", requestedCenterId: "two" }), "unavailable");
  assert.equal(billingWorkspaceTarget({ ...input, requestedFamilyId: "removed" }), "unavailable");
  assert.equal(billingWorkspaceTarget({ ...input, requestedCenterId: "outside" }), "unavailable");
});

test("route keys cannot collide and historical links preserve exact account and invoice filter", () => {
  assert.notEqual(billingSelectionKey({ familyId: "a-b", centerId: "c" }), billingSelectionKey({ familyId: "a", centerId: "b-c" }));
  const link = new URL(exactBillingFamilyHref({ id: "past&one", centerId: "school two" }, { invoiceStatus: "paid", history: true }), "https://example.test");
  assert.equal(link.searchParams.get("familyId"), "past&one");
  assert.equal(link.searchParams.get("centerId"), "school two");
  assert.equal(link.searchParams.get("invoiceStatus"), "paid");
  assert.equal(link.hash, "#family-ledger");
});

test("server supplements a capped exact family through the same eligibility and school predicate", () => {
  const source = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(source, /requestedBillingFamilyId \? prisma\.family\.findFirst\([\s\S]*?AND: \[workbenchFamilyWhere, \{ id: requestedBillingFamilyId \}[\s\S]*?centerId: requestedBillingCenterId[\s\S]*?select: billingWorkbenchFamilySelect/);
  assert.match(source, /const billingWorkbenchFamilySelect[\s\S]*?satisfies Prisma\.FamilySelect/);
  assert.match(source, /canManageEnrollment: canManageOperations\(user\) && canAccessModule\(user, "family-detail"\)/);
  const page = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  assert.doesNotMatch(page, /billingFamilyHref\(invoice\.billingAccount\.family\.currentFamilyMatch \?\?/);
  assert.match(page, /!data\.readOnly && writableTarget \? \(\s*<BillingWorkbench/);
  assert.match(page, /workspace === "terminal" && !data\.readOnly && writableTarget/);
  assert.match(page, /\.\.\.data\.ledgerAccounts\.map/);
  assert.match(page, /<FamilyLedgerCard\s+key=\{billingSelectionKey\(data\.initialSelection\)\}/);
  assert.match(page, /!data\.readOnly \? <PaymentAutopayActions \/>/);
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.match(workbench, /<fieldset disabled=\{isPending\} aria-busy=\{isPending\}/);
  assert.match(workbench, /resetFamilyBoundBillingDrafts\(nextFamily, value\)/);
  assert.match(workbench, /resetFamilyBoundBillingDrafts\(nextFamily, centerId\)/);
  assert.match(workbench, /useUnsavedChangesGuard\(hasUncommittedBillingInput/);
  assert.match(workbench, /planDraftIsDirty && !window\.confirm/);
  assert.match(workbench, /invoiceDraftIsDirty \|\| invoiceVoidReason\.trim\(\)/);
  assert.doesNotMatch(workbench, /from "@\/lib\/uniform-products"/);
});
