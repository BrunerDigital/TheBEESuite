import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { enrollmentStatusHref } from "../src/lib/enrollment-status-navigation";

test("enrollment status shortcut builds report links with optional school scope", () => {
  assert.equal(enrollmentStatusHref(), "/analytics?report=enrollment_status");
  assert.equal(
    enrollmentStatusHref("school with spaces"),
    "/analytics?report=enrollment_status&centerId=school+with+spaces",
  );
});

test("director dashboards and school operations promote the enrollment status view", () => {
  const dashboard = readFileSync("src/components/dashboard.tsx", "utf8");
  const operations = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  const workspaceNav = readFileSync("src/components/consolidated-workspace-nav.tsx", "utf8");
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");

  assert.match(dashboard, /isDirectorDashboard \? <EnrollmentStatusShortcut/);
  assert.equal((operations.match(/<EnrollmentStatusShortcut/g) ?? []).length, 2);
  assert.match(workspaceNav, /\["enrollment", "Enrollment status", "Current roster and exports", "\/analytics\?report=enrollment_status"/);
  assert.match(page, /\["enrollment", "analytics"\]/);
  assert.match(page, /canViewEnrollmentStatus: canAccessModule\(user, "analytics"\)/);
});
