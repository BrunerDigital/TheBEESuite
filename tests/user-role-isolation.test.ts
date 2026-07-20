import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  canAccessAllCenters,
  canAccessCenter,
  canManageBilling,
  canManageChildInClassroom,
  type CurrentUser,
} from "../src/lib/auth";
import { validateSelectedChildren } from "../src/lib/attendance-state";
import { centerScopedAccessGuard } from "../src/lib/operations-guardrails";
import { canAccessFamilyRecord, canMessageClassroomFamily } from "../src/lib/portal-guardrails";
import { canAccessModule } from "../src/lib/rbac";

function scopedUser(role: UserRole, centerIds: string[], accessScope: CurrentUser["accessScope"] = "scoped") {
  return { role, centerIds, accessScope } as CurrentUser;
}

test("executive access requires resolved tenant or explicit scoped-center access", () => {
  const tenantExecutive = scopedUser(UserRole.BRAND_ADMIN, ["school_a", "school_b"], "tenant");
  const scopedExecutive = scopedUser(UserRole.REGIONAL_MANAGER, ["school_a"], "scoped");
  const noGrantExecutive = scopedUser(UserRole.BRAND_ADMIN, [], "none");

  assert.equal(canAccessAllCenters(tenantExecutive), true);
  assert.equal(canAccessCenter(tenantExecutive, "school_b"), true);
  assert.equal(canAccessAllCenters(scopedExecutive), false);
  assert.equal(canAccessCenter(scopedExecutive, "school_a"), true);
  assert.equal(canAccessCenter(scopedExecutive, "school_b"), false);
  assert.equal(canAccessAllCenters(noGrantExecutive), false);
  assert.equal(canAccessModule(noGrantExecutive, "multi-location-dashboard"), false);
});

test("director and billing roles remain inside their assigned school", () => {
  const director = scopedUser(UserRole.CENTER_DIRECTOR, ["school_a"], "center");
  const billing = scopedUser(UserRole.BILLING_ADMIN, ["school_a"], "center");

  assert.equal(canAccessCenter(director, "school_a"), true);
  assert.equal(canAccessCenter(director, "school_b"), false);
  assert.equal(canManageBilling(billing), true);
  assert.equal(canAccessCenter(billing, "school_b"), false);
  assert.deepEqual(centerScopedAccessGuard({
    centerId: "school_b",
    hasTenantWideAccess: false,
    hasCenterAccess: canAccessCenter(billing, "school_b"),
    resourceLabel: "Invoice",
  }), { ok: false, status: 403, error: "You do not have access to this invoice." });
});

test("teacher writes require both school and assigned-classroom scope", () => {
  const teacher = { role: UserRole.TEACHER, assignedClassroomId: "classroom_a" };

  assert.equal(canManageChildInClassroom(teacher, "classroom_a"), true);
  assert.equal(canManageChildInClassroom(teacher, "classroom_b"), false);
  assert.equal(canManageChildInClassroom(teacher, null), false);
  assert.deepEqual(canMessageClassroomFamily({
    assignedClassroomId: "classroom_a",
    familyChildClassroomIds: ["classroom_b"],
  }), { ok: false, status: 403, error: "Family is outside your assigned classroom." });
});

test("parents require an exact guardian-family link even when center scope exists", () => {
  assert.deepEqual(canAccessFamilyRecord({
    isParentGuardian: true,
    isLinkedGuardian: true,
    hasCenterAccess: false,
  }), { ok: true });
  assert.deepEqual(canAccessFamilyRecord({
    isParentGuardian: true,
    isLinkedGuardian: false,
    hasCenterAccess: true,
  }), { ok: false, status: 403, error: "You do not have access to this family." });
});

test("kiosk child selection rejects children outside the verified guardian family", () => {
  assert.deepEqual(validateSelectedChildren({
    requestedChildIds: ["child_a", "child_other_school"],
    allowedChildIds: ["child_a"],
  }), {
    ok: false,
    status: 403,
    error: "One or more selected children are not linked to this guardian at this school.",
    unauthorizedChildIds: ["child_other_school"],
  });
});

test("public onboarding and kiosk credential endpoints use persistent rate limits", () => {
  for (const file of [
    "src/app/api/onboarding/route.ts",
    "src/app/api/kiosk/lookup/route.ts",
    "src/app/api/kiosk/check/route.ts",
    "src/app/api/kiosk/staff/route.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /await checkPersistentRateLimit\(/, `${file} must use the shared persistent limiter`);
  }
});

test("authorized pickup remains excluded from family data modules pending routing policy", () => {
  const pickup = { role: UserRole.AUTHORIZED_PICKUP };
  assert.equal(canAccessModule(pickup, "messages"), false);
  assert.equal(canAccessModule(pickup, "documents"), false);
  assert.equal(canAccessModule(pickup, "billing-invoices"), false);
  assert.equal(canAccessModule(pickup, "notifications"), false);
});
