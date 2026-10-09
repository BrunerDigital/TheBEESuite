import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { isSchoolOwnerAccount, normalizeOwnerLoginInput } from "@/lib/school-owner-access";
import { resolveWorkspaceState, effectiveCenterIdsForWorkspace } from "@/lib/workspace-selection";
import { canAccessCenter, canAccessAllCenters, canManageBilling, canManageOperations } from "@/lib/auth";

const schools = [{ id: "a", name: "School A", detail: "" }, { id: "b", name: "School B", detail: "" }];

test("owner logins get director tools only for the selected assigned school", () => {
  const workspace = resolveWorkspaceState({ role: UserRole.CENTER_DIRECTOR, schoolOwner: true, authorizedCenters: schools, requestedSelection: "center:b" });
  assert.equal(workspace.canSwitch, true);
  assert.equal(workspace.canSelectAll, false);
  const user = { role: UserRole.CENTER_DIRECTOR, accessScope: "scoped" as const, centerIds: effectiveCenterIdsForWorkspace(workspace, ["a", "b"]), workspace };
  assert.deepEqual(user.centerIds, ["b"]);
  assert.equal(canAccessCenter(user, "a"), false);
  assert.equal(canAccessCenter(user, "foreign-school"), false);
  assert.equal(canAccessCenter(user, "b"), true);
  assert.equal(canAccessAllCenters(user), false);
  assert.equal(canManageBilling(user), true);
  assert.equal(canManageOperations(user), true);
});

test("owners cannot force all locations or a revoked school selection", () => {
  for (const requestedSelection of ["all", "center:foreign-school", undefined]) {
    const workspace = resolveWorkspaceState({ role: UserRole.CENTER_DIRECTOR, schoolOwner: true, authorizedCenters: schools, requestedSelection });
    assert.equal(workspace.mode, "pending");
    assert.equal(workspace.canSelectAll, false);
    assert.deepEqual(effectiveCenterIdsForWorkspace(workspace, ["a", "b"]), []);
  }
});

test("existing directors keep their fixed workspace and unrelated roles cannot become owners", () => {
  const director = resolveWorkspaceState({ role: UserRole.CENTER_DIRECTOR, authorizedCenters: schools });
  assert.equal(director.mode, "fixed");
  assert.equal(director.canSwitch, false);
  assert.equal(isSchoolOwnerAccount(UserRole.TEACHER, { accountType: "school_owner" }), false);
  assert.equal(isSchoolOwnerAccount(UserRole.CENTER_DIRECTOR, { accountType: "school_owner" }), true);
  assert.equal(isSchoolOwnerAccount(UserRole.CENTER_DIRECTOR, {}), false);
  const teacher = resolveWorkspaceState({ role: UserRole.TEACHER, schoolOwner: true, authorizedCenters: schools });
  assert.equal(teacher.canSwitch, false);
});

test("provisioning requires an explicit school list and strong temporary password", () => {
  const input = { name: " Owner ", email: " OWNER@example.com ", password: "long-temporary-password", centerIds: ["a", " a ", "b"] };
  assert.deepEqual(normalizeOwnerLoginInput(input), { ...input, name: "Owner", email: "owner@example.com", centerIds: ["a", "b"] });
  assert.throws(() => normalizeOwnerLoginInput({ ...input, centerIds: [] }), /Select/);
  assert.throws(() => normalizeOwnerLoginInput({ ...input, email: "invalid" }), /email/);
  assert.throws(() => normalizeOwnerLoginInput({ ...input, password: "short" }), /password/);
});
