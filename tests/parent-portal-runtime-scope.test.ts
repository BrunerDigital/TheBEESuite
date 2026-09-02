import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveParentPortalFamilyScope, resolveParentPortalPaymentFamilyScope } from "../src/lib/parent-portal-family-scope";

test("parent portal runtime scope allows duplicate guardian rows for one family", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1" },
    { id: "guardian_2", familyId: "family_1" },
  ]), {
    ok: true,
    familyId: "family_1",
    guardianIds: ["guardian_1", "guardian_2"],
  });
});

test("parent portal runtime scope fails closed across families", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1" },
    { id: "guardian_2", familyId: "family_2" },
  ]), {
    ok: false,
    reason: "multiple_linked_families",
    familyIds: ["family_1", "family_2"],
  });
});

test("parent portal runtime scope selects the only family with a currently enrolled child", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_current", familyId: "family_current", currentChildCount: 1 },
    { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  ]), {
    ok: true,
    familyId: "family_current",
    guardianIds: ["guardian_current"],
  });
});

test("parent portal runtime scope still fails closed across two current families", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1", currentChildCount: 1 },
    { id: "guardian_2", familyId: "family_2", currentChildCount: 2 },
    { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  ]), {
    ok: false,
    reason: "multiple_linked_families",
    familyIds: ["family_1", "family_2"],
  });
});

test("parent portal runtime scope permits an explicitly selected current linked family", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1", currentChildCount: 1 },
    { id: "guardian_2", familyId: "family_2", currentChildCount: 2 },
  ], "family_2"), {
    ok: true,
    familyId: "family_2",
    guardianIds: ["guardian_2"],
  });
});

test("general parent mutation scope rejects an explicitly selected billing-history family when a current family exists", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_current", familyId: "family_current", currentChildCount: 1 },
    { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  ], "family_history"), {
    ok: false,
    reason: "requested_family_not_linked",
    familyIds: ["family_current"],
  });
});

test("payment-only scope permits an explicitly selected eligible billing-history family", () => {
  assert.deepEqual(resolveParentPortalPaymentFamilyScope([
    { id: "guardian_current", familyId: "family_current", currentChildCount: 1 },
    { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  ], "family_history"), {
    ok: true,
    familyId: "family_history",
    guardianIds: ["guardian_history"],
  });
});

test("parent portal runtime scope rejects an explicitly selected unlinked family", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1", currentChildCount: 1 },
    { id: "guardian_2", familyId: "family_2", currentChildCount: 2 },
  ], "family_other"), {
    ok: false,
    reason: "requested_family_not_linked",
    familyIds: ["family_1", "family_2"],
  });
});

test("parent portal runtime scope never substitutes the only linked family for an unlinked request", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1", currentChildCount: 1 },
  ], "family_other"), {
    ok: false,
    reason: "requested_family_not_linked",
    familyIds: ["family_1"],
  });
});

test("parent setup and saved-method mutations retain current-family scope", () => {
  for (const path of [
    "src/app/api/parent/setup/route.ts",
    "src/app/api/parent/kiosk-credential/route.ts",
    "src/app/api/parent/products/purchase/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
  ]) {
    assert.match(readFileSync(path, "utf8"), /getParentPortalFamilyScope\(user\.id, user\.tenantId,/, path);
  }
  const familyPayment = readFileSync("src/app/api/billing/family-payment/route.ts", "utf8");
  assert.match(familyPayment, /method === "saved_method"[\s\S]*getParentPortalFamilyScope\(user\.id, user\.tenantId,/);
});

test("one-time parent payment routes use the outstanding-payment scope", () => {
  const checkout = readFileSync("src/app/api/billing/checkout-session/route.ts", "utf8");
  const familyPayment = readFileSync("src/app/api/billing/family-payment/route.ts", "utf8");
  assert.match(checkout, /getParentPortalPaymentFamilyScope\(user\.id, user\.tenantId,/);
  assert.match(familyPayment, /method === "saved_method"[\s\S]*getParentPortalFamilyScope[\s\S]*getParentPortalPaymentFamilyScope\(user\.id, user\.tenantId,/);
});

test("runtime family lookup restricts guardian links to the signed-in tenant", () => {
  const source = readFileSync("src/lib/parent-portal-family-scope.ts", "utf8");
  assert.match(source, /prisma\.center\.findMany\(\{[\s\S]*organization: \{ tenantId \}/);
  assert.match(source, /family: parentPortalTenantFamilyWhere\(tenantCenterIds\)/);
});

test("parent setup and kiosk credential lists stay inside the signed-in tenant", () => {
  for (const path of [
    "src/app/parent-portal/setup/page.tsx",
    "src/app/api/parent/kiosk-credential/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /getParentPortalTenantCenterIds\(user\.tenantId\)/, path);
    assert.match(source, /family: parentPortalTenantFamilyWhere\(tenantCenterIds\)/, path);
  }
});

test("tenant family scope accepts only unmixed current-child classroom fallbacks when family center is absent", () => {
  const source = readFileSync("src/lib/parent-portal-family-scope.ts", "utf8");
  assert.match(source, /parentPortalTenantFamilyWhere[\s\S]*centerId: \{ in: tenantCenterIds \}/);
  assert.match(source, /centerId: null,[\s\S]*children:[\s\S]*currentlyEnrolledChildWhere\(\)[\s\S]*classroom: \{ centerId: \{ in: tenantCenterIds \} \}/);
  assert.match(source, /none:[\s\S]*currentlyEnrolledChildWhere\(\)[\s\S]*classroom: \{ centerId: \{ notIn: tenantCenterIds \} \}/);
});

test("parent portal rejects a requested unlinked family before choosing a default", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /getParentPortalPaymentFamilyScope\(user\.id, user\.tenantId, requestedParentFamilyId\)/);
  assert.match(page, /requestedParentFamilyScope && !requestedParentFamilyScope\.ok/);
  assert.match(page, /getParentPortalTenantCenterIds\(user\.tenantId\)/);
  assert.match(page, /parentPortalTenantFamilyWhere\(parentPortalTenantCenterIds\)/);
});

test("parent portal resolves billing warnings through the current child's school when the family center is absent", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /classroom: \{ select: \{ name: true, ageGroup: true, centerId: true \} \}/);
  assert.match(page, /resolvedParentCenterId = family\?\.centerId \?\? family\?\.children\[0\]\?\.classroom\?\.centerId \?\? null/);
  assert.match(page, /where: \{ id: resolvedParentCenterId \?\? "__none__" \}/);
  assert.match(page, /stripeConnectSavedMethodNeedsReauthorization/);
});

test("parent portal data fanout stays within the production database pool", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const start = page.indexOf("const [billingAccount, activeParentPaymentRows, latestLedgerEntry");
  const end = page.indexOf("const [signedDocuments, signedMedia, signedMessages]", start);
  assert.ok(start >= 0 && end > start, "parent portal data fanout block was not found");
  const fanout = page.slice(start, end);
  assert.match(fanout, /await prisma\.\$transaction\(\[/);
  assert.doesNotMatch(fanout, /await Promise\.all\(\[/);
});

test("parent setup page includes each current linked family and excludes historical family rows", () => {
  const page = readFileSync("src/app/parent-portal/setup/page.tsx", "utf8");
  assert.match(page, /selectParentPortalCurrentGuardians\(guardians\)/);
  assert.doesNotMatch(page, /resolveParentPortalFamilyScope\(guardians\)/);
});

test("kiosk credentials use the same current-family fallback as parent mutations", () => {
  const route = readFileSync("src/app/api/parent/kiosk-credential/route.ts", "utf8");
  assert.match(route, /_count: \{ select: \{ children: \{ where: currentlyEnrolledChildWhere\(\) \} \} \}/);
  assert.match(route, /scopedGuardians = selectParentPortalCurrentGuardians\(guardians\)/);
  assert.match(route, /credentials: scopedGuardians\.map/);
});
