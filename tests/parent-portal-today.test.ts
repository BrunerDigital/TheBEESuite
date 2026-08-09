import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildParentPortalTodayState } from "@/lib/parent-portal-today";

test("parent Today status prefers same-day check-in evidence and hides stale location after checkout", () => {
  const checkedIn = buildParentPortalTodayState({
    attendanceStatus: "present",
    attendanceMarkedAt: "2026-08-09T12:00:00.000Z",
    latestCheckType: "check_in",
    latestCheckAt: "2026-08-09T12:15:00.000Z",
    currentLocationName: "Bluebirds",
    currentLocationIsFresh: true,
    dailyReportShared: true,
  });
  assert.deepEqual(checkedIn, {
    status: "checked_in",
    label: "Checked in",
    latestEventAt: "2026-08-09T12:15:00.000Z",
    currentLocationName: "Bluebirds",
    dailyReportShared: true,
  });

  const checkedOut = buildParentPortalTodayState({
    attendanceStatus: "present",
    latestCheckType: "check_out",
    latestCheckAt: "2026-08-09T21:00:00.000Z",
    currentLocationName: "Playground",
    currentLocationIsFresh: true,
  });
  assert.equal(checkedOut.status, "checked_out");
  assert.equal(checkedOut.currentLocationName, null);

  const presentWithPriorDayLocation = buildParentPortalTodayState({
    attendanceStatus: "present",
    attendanceMarkedAt: "2026-08-09T12:00:00.000Z",
    currentLocationName: "Playground",
    currentLocationIsFresh: false,
  });
  assert.equal(presentWithPriorDayLocation.status, "present");
  assert.equal(presentWithPriorDayLocation.currentLocationName, null);
});

test("parent Today projection stays inside the already authorized family children and service day", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const portalBranch = page.slice(page.indexOf('if (slug === "parent-portal")'), page.indexOf('if (slug === "center-dashboard")'));
  const workspace = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
  assert.match(portalBranch, /parentPortalFamilyScopeWhere/);
  assert.match(portalBranch, /childId: \{ in: childIds\.length \? childIds : \["__none__"\] \}/);
  assert.match(portalBranch, /date: \{ gte: parentServiceDay\.start, lt: parentServiceDay\.end \}/);
  assert.match(portalBranch, /occurredAt: \{ gte: parentServiceDay\.start, lt: parentServiceDay\.end \}/);
  assert.match(portalBranch, /liveLocation\.movedAt >= parentServiceDay\.start/);
  assert.match(portalBranch, /liveLocation\.movedAt < parentServiceDay\.end/);
  assert.match(portalBranch, /buildParentPortalTodayState/);
  assert.doesNotMatch(portalBranch, /attendanceRecord\.(create|update|delete)/);
  assert.doesNotMatch(portalBranch, /checkInOutLog\.(create|update|delete)/);
  assert.match(workspace, /Your Child’s Day at a Glance/);
  assert.match(workspace, /Current check-in evidence/);
});
