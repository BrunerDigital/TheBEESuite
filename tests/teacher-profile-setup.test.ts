import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeTeacherProfileSetupPayload,
  teacherProfileSetupCustomFields,
} from "@/lib/teacher-profile-setup";

test("teacher profile setup normalizes tablet payload", () => {
  const result = normalizeTeacherProfileSetupPayload({
    name: "  Sarah Johnson  ",
    contactEmail: " SARAH@EXAMPLE.COM ",
    phone: " 555-0100 ",
    title: " Lead Teacher ",
    classroomId: "classroom_1",
    staffKioskPin: "1234",
  }, { allowedClassroomIds: ["classroom_1"] });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.input, {
    name: "Sarah Johnson",
    contactEmail: "sarah@example.com",
    phone: "555-0100",
    title: "Lead Teacher",
    classroomId: "classroom_1",
    staffKioskPin: "1234",
  });
});

test("teacher profile setup rejects invalid email pin and classroom", () => {
  assert.equal(normalizeTeacherProfileSetupPayload({ name: "Sarah", contactEmail: "bad" }).ok, false);
  assert.equal(normalizeTeacherProfileSetupPayload({ name: "Sarah", staffKioskPin: "123" }).ok, false);
  assert.equal(
    normalizeTeacherProfileSetupPayload(
      { name: "Sarah", classroomId: "other_room" },
      { allowedClassroomIds: ["classroom_1"] },
    ).ok,
    false,
  );
});

test("teacher profile setup custom fields preserve existing data and contact email", () => {
  const customFields = teacherProfileSetupCustomFields({
    customFields: { existing: true },
    input: { contactEmail: "sarah@example.com" },
    updatedAt: new Date("2026-07-07T12:00:00.000Z"),
    updatedById: "user_1",
  }) as Record<string, unknown>;

  assert.equal(customFields.existing, true);
  assert.equal(customFields.staffContactEmail, "sarah@example.com");
  assert.deepEqual(customFields.teacherProfileSetup, {
    completedAt: "2026-07-07T12:00:00.000Z",
    updatedAt: "2026-07-07T12:00:00.000Z",
    updatedById: "user_1",
    contactEmailCaptured: true,
  });
});
