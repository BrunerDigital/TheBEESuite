import { canAccessModule, canAccessResolvedModuleRoute } from "@/lib/rbac";
import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { canManageBilling, canManageOperations, canManageCrmLeads, canManageStaffCompensation, canManageClassroomTasks } from "@/lib/auth";
import { effectiveCenterIdsForWorkspace, effectiveWorkspaceRole, resolveWorkspaceState, schoolHistoryStatusWhere } from "@/lib/workspace-selection";
import { visiblePaymentWhere, visibleInvoiceWhere, visibleFamilyWhere } from "@/lib/corporate-view-scope";

test("closed school history preserves the role boundary", () => {
  for (const role of ["BRAND_ADMIN", "REGIONAL_MANAGER", "PLATFORM_OWNER", "READ_ONLY_AUDITOR"]) {
    const workspace = resolveWorkspaceState({ role, authorizedCenters: [{ id: "closed", name: "Closed", detail: "", status: "closed" }] });
    assert.deepEqual(schoolHistoryStatusWhere(role, workspace), {});
    assert.deepEqual(schoolHistoryStatusWhere(role), { status: { not: "closed" } });
  }
  for (const role of ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "TEACHER", "PARENT_GUARDIAN", "BILLING_ADMIN", "unknown"]) {
    assert.deepEqual(schoolHistoryStatusWhere(role), { status: { not: "closed" } });
  }
});

test("historical family, invoice and payment queries retain exact authorized school scope", () => {
  const family = { centerId: { in: ["garland"] } };
  assert.deepEqual(visibleFamilyWhere(["garland"]), family);
  assert.deepEqual(visibleInvoiceWhere(["garland"]), { billingAccount: { is: { family: { is: family } } } });
  assert.deepEqual(visiblePaymentWhere(["garland"]), { billingAccount: { is: { family: { is: family } } } });
  assert.deepEqual(visiblePaymentWhere([]), {
    billingAccount: { is: { family: { is: { centerId: { in: ["__no_visible_centers__"] } } } } },
  });
});


test("closed school workspaces use read-only server capabilities and switching restores the identity role", () => {
  const authorizedCenters = [
    { id: "garland", name: "Garland", detail: "TX", status: "closed" },
    { id: "open", name: "Open school", detail: "TX", status: "active" },
  ];
  for (const identityRole of [UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.PLATFORM_OWNER]) {
    const history = resolveWorkspaceState({ role: identityRole, authorizedCenters, requestedSelection: "center:garland" });
    const historyUser = { role: effectiveWorkspaceRole(identityRole, history), workspace: history };
    assert.equal(historyUser.role, UserRole.READ_ONLY_AUDITOR);
    assert.equal(canAccessModule(historyUser, "payments"), true);
    assert.equal(canAccessResolvedModuleRoute(historyUser, "billing-invoices", "payments"), true);
    for (const module of ["family-detail", "billing-invoices", "analytics", "documents", "fte-reports"]) {
      assert.equal(canAccessModule(historyUser, module), true);
    }
    assert.equal(canAccessModule({ role: UserRole.READ_ONLY_AUDITOR }, "payments"), false);
    for (const capability of [canManageBilling, canManageOperations, canManageCrmLeads, canManageStaffCompensation, canManageClassroomTasks]) {
      assert.equal(capability(historyUser), false);
    }
    assert.equal(history.canSwitch, true);
    const all = resolveWorkspaceState({ role: identityRole, authorizedCenters, requestedSelection: "all" });
    assert.deepEqual(effectiveCenterIdsForWorkspace(all, ["garland", "open"]), ["open"]);
    assert.deepEqual(schoolHistoryStatusWhere(identityRole, all), { status: { not: "closed" } });
    const active = resolveWorkspaceState({ role: identityRole, authorizedCenters, requestedSelection: "center:open" });
    assert.equal(effectiveWorkspaceRole(identityRole, active), identityRole);
    const soleClosed = resolveWorkspaceState({ role: identityRole, authorizedCenters: authorizedCenters.slice(0, 1) });
    assert.equal(effectiveWorkspaceRole(identityRole, soleClosed), UserRole.READ_ONLY_AUDITOR);
  }
});
