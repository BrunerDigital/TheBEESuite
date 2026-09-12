import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTeamSearch, searchedTeamUserWhere, teamAccessGrantWhere, teamDeviceSessionWhere, teamStaffProfileWhere, teamUserWhere } from "../src/lib/team-permissions-scope";
import { recordPagination, teamPermissionsHref } from "../src/lib/record-pagination";

const scope = { tenantId: "fake-tenant", tenantWide: false, visibleCenterIds: ["fake-school-a"], at: new Date("2026-09-12T03:00:00.000Z") };

test("team visibility shares one tenant, school and active grant boundary", () => {
  const grants = teamAccessGrantWhere(scope);
  assert.deepEqual(grants, {
    tenantId: "fake-tenant", isActive: true, AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: scope.at } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: scope.at } }] },
      { OR: [
        { scopeType: "CENTER", centerId: { in: ["fake-school-a"] }, center: { organization: { tenantId: "fake-tenant" } } },
        { scopeType: "OWNER_GROUP", ownerGroup: { tenantId: "fake-tenant", centers: { some: { organization: { tenantId: "fake-tenant" }, id: { in: ["fake-school-a"] } } } } },
      ] },
    ],
  });
  assert.deepEqual(teamUserWhere(scope), { tenantId: "fake-tenant", OR: [
    { staffProfile: { centerId: { in: ["fake-school-a"] }, center: { organization: { tenantId: "fake-tenant" } } } },
    { accessGrants: { some: grants } },
  ] });
  assert.deepEqual(teamDeviceSessionWhere(scope), { tenantId: "fake-tenant", user: { is: teamUserWhere(scope) } });
  assert.deepEqual(teamUserWhere({ ...scope, tenantWide: true }), { tenantId: "fake-tenant" });
});

test("empty school scope stays closed and never removes grant validity or tenant predicates", () => {
  const empty = { ...scope, visibleCenterIds: [] };
  assert.match(JSON.stringify(teamUserWhere(empty)), /"centerId":\{"in":\[\]\}/);
  assert.match(JSON.stringify(teamUserWhere(empty)), /"id":\{"in":\[\]\}/);
  assert.equal((teamAccessGrantWhere({ ...scope, tenantWide: true }).AND as unknown[]).length, 3);
  assert.equal(teamAccessGrantWhere({ ...scope, tenantWide: true }).tenantId, "fake-tenant");
});

test("tenant-wide nested projections reject cross-tenant and missing grant targets", () => {
  const wide = { ...scope, tenantWide: true };
  assert.deepEqual((teamAccessGrantWhere(wide).AND as unknown[])[2], { OR: [
    { scopeType: "TENANT" },
    { scopeType: "BRAND", brand: { tenantId: scope.tenantId } },
    { scopeType: "ORGANIZATION", organization: { tenantId: scope.tenantId } },
    { scopeType: "OWNER_GROUP", ownerGroup: { tenantId: scope.tenantId } },
    { scopeType: "CENTER", center: { organization: { tenantId: scope.tenantId } } },
  ] });
  assert.deepEqual(teamStaffProfileWhere(wide), { center: { organization: { tenantId: scope.tenantId } } });
  assert.deepEqual(teamStaffProfileWhere(scope), { center: { organization: { tenantId: scope.tenantId } }, centerId: { in: scope.visibleCenterIds } });
});

test("directory search always intersects authorization and supports role labels", () => {
  assert.deepEqual(searchedTeamUserWhere(scope, "  "), teamUserWhere(scope));
  const filter = searchedTeamUserWhere(scope, " director ");
  assert.deepEqual((filter.AND as unknown[])[0], teamUserWhere(scope));
  assert.deepEqual((filter.AND as unknown[])[1], { OR: [
    { name: { contains: "director", mode: "insensitive" } },
    { email: { contains: "director", mode: "insensitive" } },
    { role: { in: ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"] } },
  ] });
  assert.equal(normalizeTeamSearch(` ${"x".repeat(200)} `).length, 120);
  assert.equal(normalizeTeamSearch(["fake"]), "");
});

test("directory pagination reaches beyond 250 and clamps stale or invalid pages", () => {
  assert.deepEqual(recordPagination("1", 0), { page: 1, pageSize: 50, total: 0, totalPages: 1, from: 0, to: 0, skip: 0 });
  assert.equal(recordPagination("6", 251).from, 251);
  assert.equal(recordPagination("6", 251).to, 251);
  assert.equal(recordPagination("999", 51).page, 2);
  for (const value of ["0", "-1", "1.5", "Infinity", "9007199254740993", undefined, ["2"]]) assert.equal(recordPagination(value, 251).page, 1);
  assert.equal(teamPermissionsHref("A & B", 6, 3, "user-directory"), "/staff?view=permissions&q=A+%26+B&peoplePage=6&sessionPage=3#user-directory");
  assert.equal(teamPermissionsHref("", 1, 2, "device-sessions"), "/staff?view=permissions&sessionPage=2#device-sessions");
});

test("directory and device requests never depend on a truncated list or leak unused device details", () => {
  const source = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const team = source.slice(source.indexOf('if (slug === "team-permissions")'), source.indexOf('if (slug === "agency-admin")'));
  assert.doesNotMatch(team, /take: 250|take: 300|visibleUserIds|catch\(\(\) => \[\]\)|ipAddress|userAgent|revokedBy/);
  assert.match(team, /where: teamAccessGrantWhere\(teamScope\)/);
  assert.match(team, /staffProfile: \{\s*where: teamStaffProfileWhere\(teamScope\)/);
  assert.match(team, /prisma.user.count\(\{ where: authorizedUsers \}\)/);
  assert.match(team, /skip: peoplePage.skip/);
  assert.match(team, /skip: sessionPage.skip/);
  assert.match(team, /Includes your assigned schools/);
  const api = readFileSync("src/app/api/device-sessions/route.ts", "utf8");
  assert.match(api, /const authorizedSessionWhere = teamDeviceSessionWhere/);
  assert.match(api, /where: \{ AND: \[\{ id: sessionId \}, authorizedSessionWhere\] \}/);
  assert.match(api, /where: \{ AND: \[\{ id: deviceSession.id, revokedAt: null \}, authorizedSessionWhere\] \}/);
  assert.doesNotMatch(api, /targetUserIsVisibleToActor/);
  assert.match(api, /sessionId === user.deviceSessionId/);
  assert.match(api, /changed.count !== 1/);
  assert.match(api, /status: 409/);
  assert.match(api, /prisma.\$transaction\(async \(tx\)/);
  assert.match(api, /await tx.deviceSession.updateMany/);
  assert.match(api, /await writeAuditLog\(user,[\s\S]*?\}, tx\)/);
  const page = readFileSync("src/components/team-permissions-page.tsx", "utf8");
  assert.match(page, /form action="\/staff#user-directory"/);
  assert.match(page, /type="hidden" name="view" value="permissions"/);
});
