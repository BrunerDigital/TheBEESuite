import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveParentPortalFamilyScope,
  resolveParentPortalPaymentFamilyScope,
  resolveParentPortalReadFamilyScope,
} from "../src/lib/parent-portal-family-scope";

const guardians = [
  { id: "guardian_current", familyId: "family_current", currentChildCount: 1 },
  { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  { id: "guardian_history_duplicate", familyId: "family_history", currentChildCount: 0 },
];

test("read-only portal scope allows explicit linked history alongside a current family", () => {
  assert.deepEqual(resolveParentPortalReadFamilyScope(guardians, "family_history"), {
    ok: true, familyId: "family_history", guardianIds: ["guardian_history", "guardian_history_duplicate"],
  });
});

test("read-only portal scope retains current-family defaults and selected current guardian IDs", () => {
  for (const requested of [undefined, null, "", "family_current"]) {
    assert.deepEqual(resolveParentPortalReadFamilyScope(guardians, requested), {
      ok: true, familyId: "family_current", guardianIds: ["guardian_current"],
    });
  }
});

test("read-only portal scope fails closed for an unlinked explicit ID", () => {
  assert.deepEqual(resolveParentPortalReadFamilyScope(guardians, "family_other"), {
    ok: false, reason: "requested_family_not_linked", familyIds: ["family_current", "family_history"],
  });
  assert.equal(resolveParentPortalReadFamilyScope([guardians[0]], "family_other").ok, false);
});

test("read-only portal scope fails closed with no linked guardians", () => {
  for (const requested of [undefined, "family_other"]) {
    assert.deepEqual(resolveParentPortalReadFamilyScope([], requested), {
      ok: false, reason: "no_linked_family", familyIds: [],
    });
  }
});

test("read-only portal scope requires a selection when multiple current families exist", () => {
  const rows = [...guardians, { id: "guardian_current_2", familyId: "family_current_2", currentChildCount: 2 }];
  assert.deepEqual(resolveParentPortalReadFamilyScope(rows), {
    ok: false, reason: "multiple_linked_families", familyIds: ["family_current", "family_current_2"],
  });
  assert.equal(resolveParentPortalReadFamilyScope(rows, "family_history").ok, true);
  assert.equal(resolveParentPortalReadFamilyScope(rows, "family_current_2").ok, true);
});

test("read-only portal scope handles historical-only families and duplicate links", () => {
  assert.deepEqual(resolveParentPortalReadFamilyScope(guardians.slice(1)), {
    ok: true, familyId: "family_history", guardianIds: ["guardian_history", "guardian_history_duplicate"],
  });
  const rows = [...guardians.slice(1), { id: "guardian_history_2", familyId: "family_history_2" }];
  assert.deepEqual(resolveParentPortalReadFamilyScope(rows), {
    ok: false, reason: "multiple_linked_families", familyIds: ["family_history", "family_history_2"],
  });
  assert.equal(resolveParentPortalReadFamilyScope(rows, "family_history_2").ok, true);
});

test("historical page selection does not broaden general mutation scope", () => {
  assert.deepEqual(resolveParentPortalFamilyScope(guardians, "family_history"), {
    ok: false, reason: "requested_family_not_linked", familyIds: ["family_current"],
  });
  // The payment resolver still accepts only the eligible guardian rows supplied to it.
  assert.equal(resolveParentPortalPaymentFamilyScope([guardians[0]], "family_history").ok, false);
});

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source block: ${start}`);
  return source.slice(from, to);
}

test("read-only getter independently proves guardian and tenant scope before resolving history", () => {
  const source = readFileSync("src/lib/parent-portal-family-scope.ts", "utf8");
  const getter = block(source, "export async function getParentPortalReadFamilyScope(", "export async function getParentPortalPaymentFamilyScope(");
  assert.match(getter, /getParentPortalTenantCenterIds\(tenantId\)/);
  assert.match(getter, /where: \{ userId, family: parentPortalTenantFamilyWhere\(tenantCenterIds\) \}/);
  assert.match(getter, /children: \{ where: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(getter, /return resolveParentPortalReadFamilyScope\(guardians\.map/);
  assert.doesNotMatch(getter, /currentOrOutstandingFamilyWhere/);
});

test("ordinary page reads use the read-only getter while payment flows retain their eligible scope", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const guard = block(page, "    const parentFamilyScope = ", "    const family = ");
  assert.match(guard, /requestedParentFamilyScope \?\? await getParentPortalReadFamilyScope\(user\.id, user\.tenantId, selectedParentFamilyId\)/);
  assert.match(guard, /parentFamilyScope && !parentFamilyScope\.ok/);
  assert.doesNotMatch(guard, /getParentPortalFamilyScope\(/);
  const paymentFlow = block(page, "    const paymentFlowRequested = ", "    const parentPortalTenantCenterIds = ");
  assert.match(paymentFlow, /requestedParentFamilyId && paymentFlowRequested/);
  assert.match(paymentFlow, /getParentPortalPaymentFamilyScope\(user\.id, user\.tenantId, requestedParentFamilyId\)/);
  assert.match(paymentFlow, /requestedParentFamilyScope && !requestedParentFamilyScope\.ok/);
  assert.match(paymentFlow, /getParentPortalPaymentReturn/);
});

test("historical page reads keep payments-only rendering and non-payment redaction", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /paymentContinuityAccess = Boolean\(family && family\.children\.length === 0\)/);
  assert.match(page, /resolvedParentPortalView = paymentContinuityAccess \? "payments" : parentPortalView/);
  assert.match(page, /parentPortalContentFamilyId = paymentContinuityAccess \? "__payment_continuity__" : familyId/);
  assert.match(page, /autopayPlaceholder: paymentContinuityAccess \? false : billingAccount\.autopayPlaceholder/);
  for (const [prop, value] of [["messages", "signedMessages"], ["documents", "signedDocuments"], ["classroomTeachers", "classroomTeachers"], ["kioskCredentials", "kioskCredentials"]]) {
    assert.ok(page.includes(`${prop}={paymentContinuityAccess ? [] : ${value}}`), prop);
  }
  assert.match(page, /accountDeletionRequest=\{paymentContinuityAccess \? null : accountDeletionRequest\}/);
});
