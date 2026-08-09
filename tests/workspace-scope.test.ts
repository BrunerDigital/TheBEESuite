import assert from "node:assert/strict";
import test from "node:test";
import { workspaceScopeContext } from "@/lib/workspace-scope";

test("workspace scope labels one-school directors without changing their destination", () => {
  assert.deepEqual(workspaceScopeContext({
    role: "CENTER_DIRECTOR",
    accessScope: "center",
    centerCount: 1,
    primaryCenterName: "Sunshine Academy",
  }), {
    kind: "school",
    label: "Sunshine Academy",
    detail: "Center Director · 1 school",
    href: "/dashboard",
  });
});

test("workspace scope distinguishes executive portfolios and scoped regional access", () => {
  assert.deepEqual(workspaceScopeContext({
    role: "BRAND_ADMIN",
    accessScope: "tenant",
    centerCount: 74,
  }), {
    kind: "portfolio",
    label: "School portfolio",
    detail: "74 schools · Brand Admin",
    href: "/multi-location-dashboard",
  });

  assert.deepEqual(workspaceScopeContext({
    role: "REGIONAL_MANAGER",
    accessScope: "scoped",
    centerCount: 2,
  }), {
    kind: "school",
    label: "2 authorized schools",
    detail: "Regional Manager",
    href: "/dashboard",
  });
});

test("workspace scope gives teachers and families role-appropriate context", () => {
  assert.deepEqual(workspaceScopeContext({
    role: "TEACHER",
    accessScope: "center",
    centerCount: 1,
    primaryCenterName: "Sunshine Academy",
    classroomName: "Butterflies",
  }), {
    kind: "classroom",
    label: "Butterflies",
    detail: "Sunshine Academy · Teacher",
    href: "/teacher-portal",
  });

  assert.deepEqual(workspaceScopeContext({
    role: "PARENT_GUARDIAN",
    accessScope: "none",
    centerCount: 0,
  }), {
    kind: "family",
    label: "Family portal",
    detail: "Linked family access",
    href: "/parent-portal",
  });
});
