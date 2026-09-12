import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeTeacherProfileSetupPayload,
  teacherProfileSetupCustomFields,
  readTeacherProfileSaveReceipt,
  teacherProfileDraftFromReceipt,
  teacherProfileDraftSignature,
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
  for (const staffKioskPin of ["12345", "1234x", "12 34", 1234, true]) {
    assert.equal(normalizeTeacherProfileSetupPayload({ name: "Fake Teacher", staffKioskPin }).ok, false);
  }
  assert.equal(
    normalizeTeacherProfileSetupPayload(
      { name: "Sarah", classroomId: "other_room" },
      { allowedClassroomIds: ["classroom_1"] },
    ).ok,
    false,
  );
});

test("teacher profile receipt confirms only the complete exact saved target and submitted values", () => {
  const input = { name: "Fake Teacher", title: "Teacher", phone: null, contactEmail: "teacher@example.test", classroomId: null, staffKioskPin: "1234" };
  const expected = { profileId: "fake-profile", centerId: "fake-center", retainedClassroomId: "fake-room", input };
  const profile = { id: "fake-profile", name: input.name, title: input.title, phone: null, contactEmail: input.contactEmail, classroomId: "fake-room", centerId: "fake-center", hasStaffKioskCode: true };
  const receipt = { ok: true, mode: "updated", profile };
  assert.deepEqual(readTeacherProfileSaveReceipt(receipt, expected), profile);
  for (const value of [null, {}, { ...receipt, ok: false }, { ...receipt, mode: "created" }, { ...receipt, profile: null }]) assert.equal(readTeacherProfileSaveReceipt(value, expected), null);
  for (const field of Object.keys(profile)) {
    assert.equal(readTeacherProfileSaveReceipt({ ...receipt, profile: { ...profile, [field]: undefined } }, expected), null, field);
  }
  for (const patch of [{ id: "other" }, { centerId: "other" }, { name: "Other" }, { contactEmail: "other@example.test" }, { phone: "other" }, { title: "Other" }, { classroomId: "other" }, { hasStaffKioskCode: false }]) {
    assert.equal(readTeacherProfileSaveReceipt({ ...receipt, profile: { ...profile, ...patch } }, expected), null);
  }
  assert.ok(readTeacherProfileSaveReceipt({ ...receipt, mode: "created" }, { ...expected, profileId: null }));
  const noPinExpected = { ...expected, input: { ...input, staffKioskPin: null } };
  assert.ok(readTeacherProfileSaveReceipt({ ...receipt, profile: { ...profile, hasStaffKioskCode: false } }, noPinExpected));
});

test("teacher profile dirty signature tracks every field including unsaved PIN and maps confirmed receipts", () => {
  const draft = teacherProfileDraftFromReceipt({ id: "fake-profile", centerId: "fake-center", name: "Fake Teacher", title: "Teacher", phone: null, contactEmail: null, classroomId: null, hasStaffKioskCode: false });
  assert.deepEqual(draft, { name: "Fake Teacher", title: "Teacher", phone: "", contactEmail: "", classroomId: "none", staffKioskPin: "" });
  const initial = teacherProfileDraftSignature(draft);
  assert.equal(teacherProfileDraftSignature({ ...draft }), initial);
  for (const field of Object.keys(draft)) assert.notEqual(teacherProfileDraftSignature({ ...draft, [field]: "edited" }), initial, field);
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
