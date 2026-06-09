import assert from "node:assert/strict";
import { test } from "node:test";
import {
  complianceTaskNeedsReminder,
  normalizeComplianceTaskInput,
  normalizeEmergencyDrillInput,
} from "../src/lib/compliance-workflows";

test("emergency drill input normalizes defaults and numeric duration", () => {
  assert.deepEqual(normalizeEmergencyDrillInput({
    centerId: " center_1 ",
    drillType: "",
    durationMinutes: "11.2",
    outcome: "Partial",
    participants: "All classrooms",
  }), {
    centerId: "center_1",
    drillType: "Fire drill",
    durationMinutes: 11,
    participants: "All classrooms",
    outcome: "partial",
    notes: null,
  });
});

test("compliance task input normalizes status and priority", () => {
  assert.deepEqual(normalizeComplianceTaskInput({
    centerId: "center_1",
    title: " Renew fire drill log ",
    category: "",
    priority: "Urgent",
    status: "In Progress",
    assignedToId: "",
  }), {
    centerId: "center_1",
    title: "Renew fire drill log",
    category: "general",
    priority: "urgent",
    status: "in_progress",
    assignedToId: null,
    relatedResourceType: null,
    relatedResourceId: null,
    notes: null,
  });
});

test("compliance task reminders ignore closed tasks and alert before due dates", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");
  assert.equal(complianceTaskNeedsReminder({
    status: "completed",
    dueAt: "2026-06-08T13:00:00.000Z",
    now,
  }), false);
  assert.equal(complianceTaskNeedsReminder({
    status: "open",
    dueAt: "2026-06-09T11:00:00.000Z",
    now,
  }), true);
  assert.equal(complianceTaskNeedsReminder({
    status: "open",
    dueAt: "2026-06-12T11:00:00.000Z",
    reminderAt: "2026-06-08T11:59:00.000Z",
    now,
  }), true);
});
