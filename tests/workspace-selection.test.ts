import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, createSessionToken, verifySessionToken } from "@/lib/auth";
import { dashboardLensesForRole } from "@/lib/rbac";
import {
  effectiveCenterIdsForWorkspace,
  resolveWorkspaceState,
  safeWorkspaceNextPath,
  workspaceDestinationAfterSelection,
  workspaceSelectionHref,
  workspaceSelectionRedirect,
} from "@/lib/workspace-selection";

const centers = [
  { id: "school_a", name: "Downtown", detail: "Kokomo, IN", companyName: "Kid City USA" },
  { id: "school_b", name: "Northside", detail: "Carmel, IN", companyName: "Kid City USA" },
];

test("multi-location executives must choose a live authorized workspace", () => {
  const pending = resolveWorkspaceState({ role: UserRole.BRAND_ADMIN, authorizedCenters: centers });
  assert.equal(pending.mode, "pending");
  assert.equal(pending.required, true);
  assert.equal(pending.canSelectAll, true);
  assert.equal(pending.companyLabel, "Kid City USA");
  assert.deepEqual(effectiveCenterIdsForWorkspace(pending, centers.map((center) => center.id)), []);
  assert.equal(workspaceSelectionRedirect(pending, "/crm-leads?view=tours#today"), workspaceSelectionHref("/crm-leads?view=tours#today"));

  const revoked = resolveWorkspaceState({
    role: UserRole.BRAND_ADMIN,
    authorizedCenters: centers,
    requestedSelection: "center:revoked_school",
  });
  assert.equal(revoked.mode, "pending");
  assert.equal(revoked.invalidSelection, true);
  assert.deepEqual(effectiveCenterIdsForWorkspace(revoked, centers.map((center) => center.id)), []);
});

test("specific and all-location workspaces narrow the effective server scope", () => {
  const all = resolveWorkspaceState({ role: UserRole.REGIONAL_MANAGER, authorizedCenters: centers, requestedSelection: "all" });
  assert.equal(all.mode, "all");
  assert.deepEqual(effectiveCenterIdsForWorkspace(all, ["school_a", "school_b"]), ["school_a", "school_b"]);

  const specific = resolveWorkspaceState({
    role: UserRole.REGIONAL_MANAGER,
    authorizedCenters: centers,
    requestedSelection: "center:school_b",
  });
  assert.equal(specific.mode, "center");
  assert.equal(specific.label, "Northside");
  assert.deepEqual(effectiveCenterIdsForWorkspace(specific, ["school_a", "school_b"]), ["school_b"]);

  const allUser = { role: UserRole.REGIONAL_MANAGER, accessScope: "tenant" as const, centerIds: ["school_a", "school_b"], workspace: all };
  const specificUser = { role: UserRole.REGIONAL_MANAGER, accessScope: "tenant" as const, centerIds: ["school_b"], workspace: specific };
  assert.equal(canAccessAllCenters(allUser), true);
  assert.equal(canAccessCenter(allUser, "school_a"), true);
  assert.equal(canAccessAllCenters(specificUser), false);
  assert.equal(canAccessCenter(specificUser, "school_a"), false);
  assert.equal(canAccessCenter(specificUser, "school_b"), true);
});

test("single-location and non-executive users do not receive an unnecessary selector", () => {
  const singleExecutive = resolveWorkspaceState({ role: UserRole.BRAND_ADMIN, authorizedCenters: centers.slice(0, 1) });
  const director = resolveWorkspaceState({ role: UserRole.CENTER_DIRECTOR, authorizedCenters: centers });
  assert.equal(singleExecutive.mode, "fixed");
  assert.equal(singleExecutive.canSwitch, false);
  assert.equal(singleExecutive.activeCenterId, "school_a");
  assert.equal(director.mode, "fixed");
  assert.equal(director.canSelectAll, false);
  assert.deepEqual(effectiveCenterIdsForWorkspace(director, ["school_a", "school_b"]), ["school_a", "school_b"]);
});

test("workspace switching preserves safe destinations, query parameters, and hashes", () => {
  assert.equal(
    workspaceDestinationAfterSelection({ nextPath: "/analytics?view=reputation#summary", selection: "center:school_b" }),
    "/analytics?view=reputation#summary",
  );
  assert.equal(
    workspaceDestinationAfterSelection({ nextPath: "/family-detail?centerId=school_a&view=children#records", selection: "center:school_b" }),
    "/family-detail?centerId=school_b&view=children#records",
  );
  assert.equal(
    workspaceDestinationAfterSelection({ nextPath: "/family-detail?centerId=school_a&view=children", selection: "all" }),
    "/family-detail?view=children",
  );
  assert.equal(workspaceDestinationAfterSelection({ nextPath: "/check-in/school_a", selection: "center:school_b" }), "/dashboard");
  assert.equal(workspaceDestinationAfterSelection({
    nextPath: "/family-detail?familyId=family_a&view=children#records",
    selection: "center:school_b",
    previousSelection: "center:school_a",
  }), "/dashboard");
  assert.equal(workspaceDestinationAfterSelection({
    nextPath: "/stripe-reauthorization?center=school_a&start=1",
    selection: "center:school_b",
    previousSelection: "center:school_a",
  }), "/dashboard");
  assert.equal(safeWorkspaceNextPath("https://attacker.example"), "/dashboard");
  assert.equal(safeWorkspaceNextPath("//attacker.example"), "/dashboard");
  assert.equal(safeWorkspaceNextPath("/\\attacker.example"), "/dashboard");
  assert.equal(safeWorkspaceNextPath("/workspace?next=%2Fdashboard"), "/dashboard");
});

test("the signed session carries workspace state and rejects tampering", () => {
  process.env.AUTH_SECRET = "workspace-selection-test-secret";
  const token = createSessionToken({
    id: "user_1",
    email: "executive@example.test",
    role: UserRole.BRAND_ADMIN,
    sessionVersion: 3,
    workspaceSelection: "center:school_a",
  });
  assert.equal(verifySessionToken(token)?.workspaceSelection, "center:school_a");
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`), null);
});

test("dashboard lenses show one role-relevant hierarchy in the active workspace", () => {
  assert.deepEqual(dashboardLensesForRole({ role: UserRole.BRAND_ADMIN, accessScope: "tenant", workspace: { mode: "all" } }), ["brand"]);
  assert.deepEqual(dashboardLensesForRole({ role: UserRole.BRAND_ADMIN, accessScope: "tenant", workspace: { mode: "center" } }), ["director"]);
  assert.deepEqual(dashboardLensesForRole({ role: UserRole.BILLING_ADMIN, accessScope: "center", workspace: { mode: "fixed" } }), ["billing"]);
});

test("platform location selection carries the selected company context and large portfolios remain searchable", () => {
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  const selector = readFileSync("src/components/workspace-selector.tsx", "utf8");

  assert.match(auth, /selectedPlatformCenter\?\.organization\.tenantId \?\? user\.tenantId/);
  assert.match(auth, /user\.role === UserRole\.PLATFORM_OWNER && workspace\.activeCenterId/);
  assert.match(auth, /effectiveOrganizationId = selectedPlatformCenter\?\.organization\.id \?\? user\.organizationId/);
  assert.match(auth, /effectiveBrand = selectedPlatformCenter\?\.organization\.brand \?\? user\.organization\?\.brand/);
  assert.match(selector, /workspace\.options\.length > 8/);
  assert.match(selector, /Search by school, city, or company/);
});

test("workspace switching retains browser fragments and dashboard actions honor feature availability", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const dashboard = readFileSync("src/components/dashboard.tsx", "utf8");

  assert.match(shell, /const syncHash = \(\) => setCurrentHash\(window\.location\.hash\)/);
  assert.match(shell, /window\.addEventListener\("hashchange", syncHash\)/);
  assert.match(shell, /const currentPath = `\$\{pathname\}\$\{query \? `\?\$\{query\}` : ""\}\$\{currentHash\}`/);
  assert.match(dashboard, /accessibleModuleRouteSlug\(\{/);
  assert.match(dashboard, /slug !== "data-readiness" \|\| dataReadinessCenterEnabled\(\)/);
});
