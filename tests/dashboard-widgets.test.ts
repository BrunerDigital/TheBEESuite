import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import {
  dashboardWidgetPreferencesForStorage,
  normalizeDashboardWidgetPreferences,
} from "../src/lib/dashboard-widgets";

test("director dashboard widgets default to school operating widgets", () => {
  const config = normalizeDashboardWidgetPreferences({ role: UserRole.CENTER_DIRECTOR });

  assert.equal(config.roleLabel, "Center director");
  assert.ok(config.visibleWidgetIds.includes("enrollmentPipeline"));
  assert.ok(config.visibleWidgetIds.includes("billingRevenue"));
  assert.ok(config.visibleWidgetIds.includes("familyCommunication"));
  assert.ok(!config.widgets.some((widget) => widget.id === "executiveRollup"));
  assert.ok(!config.widgets.some((widget) => widget.id === "parentAccount"));
});

test("saved preferences clamp invalid and cross-role widget ids", () => {
  const config = normalizeDashboardWidgetPreferences({
    role: UserRole.TEACHER,
    value: {
      order: ["billingRevenue", "familyCommunication", "attendanceSnapshot", "missingWidget"],
      hiddenWidgetIds: ["staffingRatios", "complianceQueue", "billingRevenue", "missingWidget"],
    },
  });

  assert.deepEqual(config.order.slice(0, 2), ["familyCommunication", "attendanceSnapshot"]);
  assert.ok(!config.widgets.some((widget) => widget.id === "staffingRatios"));
  assert.ok(!config.widgets.some((widget) => widget.id === "complianceQueue"));
  assert.ok(!config.widgets.some((widget) => widget.id === "billingRevenue"));
  assert.ok(!config.hiddenWidgetIds.includes("staffingRatios"));
  assert.ok(!config.hiddenWidgetIds.includes("complianceQueue"));
  assert.ok(!config.hiddenWidgetIds.includes("billingRevenue"));
});

test("teacher dashboard widgets exclude director-only staffing and compliance", () => {
  const config = normalizeDashboardWidgetPreferences({
    role: UserRole.TEACHER,
    value: {
      visibleWidgetIds: ["aiBrief", "staffingRatios", "complianceQueue", "familyCommunication"],
      order: ["staffingRatios", "complianceQueue", "aiBrief", "familyCommunication"],
    },
  });

  assert.deepEqual(config.visibleWidgetIds, ["aiBrief", "familyCommunication"]);
  assert.ok(!config.order.includes("staffingRatios"));
  assert.ok(!config.order.includes("complianceQueue"));
  assert.ok(config.widgets.every((widget) => widget.roles.includes(UserRole.TEACHER)));
});

test("submitted widget rows drive both visibility and ordering", () => {
  const config = normalizeDashboardWidgetPreferences({
    role: UserRole.BILLING_ADMIN,
    value: {
      widgets: [
        { id: "billingRevenue", visible: true },
        { id: "aiBrief", visible: false },
        { id: "familyCommunication", visible: true },
        { id: "complianceQueue", visible: true },
      ],
    },
  });

  assert.deepEqual(config.order.slice(0, 3), ["billingRevenue", "aiBrief", "familyCommunication"]);
  assert.deepEqual(config.visibleWidgetIds, ["billingRevenue", "familyCommunication"]);
  assert.ok(config.hiddenWidgetIds.includes("aiBrief"));
  assert.ok(!config.widgets.some((widget) => widget.id === "complianceQueue"));
});

test("all-hidden submissions keep at least one role-allowed widget visible", () => {
  const config = normalizeDashboardWidgetPreferences({
    role: UserRole.AUTHORIZED_PICKUP,
    value: {
      widgets: [
        { id: "parentAccount", visible: false },
        { id: "attendanceSnapshot", visible: false },
      ],
    },
  });

  assert.deepEqual(config.visibleWidgetIds, ["parentAccount"]);
  assert.ok(config.widgets.find((widget) => widget.id === "parentAccount")?.visible);
});

test("storage payload records normalized visible and hidden widget ids", () => {
  const config = normalizeDashboardWidgetPreferences({
    role: UserRole.CENTER_DIRECTOR,
    value: {
      hiddenWidgetIds: ["billingRevenue"],
    },
  });

  const storage = dashboardWidgetPreferencesForStorage(config, {
    updatedAt: "2026-06-09T12:00:00.000Z",
    updatedByUserId: "user_1",
    updatedByEmail: "director@example.com",
  });

  assert.equal(storage.version, 1);
  assert.equal(storage.role, UserRole.CENTER_DIRECTOR);
  assert.ok(storage.hiddenWidgetIds.includes("billingRevenue"));
  assert.ok(!storage.visibleWidgetIds.includes("billingRevenue"));
  assert.equal(storage.updatedByEmail, "director@example.com");
});
