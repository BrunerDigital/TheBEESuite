import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  childBirthCustomFields,
  childBirthFormState,
  EXPECTED_CHILD_DATE_OF_BIRTH,
  normalizeCalendarDateValue,
  suggestedExpectedDueDate,
} from "@/lib/expected-child-birth";

test("a future birth date on a pipeline child is presented as an expected due date", () => {
  assert.deepEqual(childBirthFormState({
    dateOfBirth: "2027-01-01T12:00:00.000Z",
    enrollmentStatus: "pending",
    customFields: null,
  }, new Date("2026-09-08T12:00:00.000Z")), {
    birthStatus: "expected",
    dateOfBirth: "",
    expectedDueDate: "2027-01-01",
  });

  assert.equal(childBirthFormState({
    dateOfBirth: "2027-01-01T12:00:00.000Z",
    enrollmentStatus: "enrolled",
    customFields: null,
  }, new Date("2026-09-08T12:00:00.000Z")).birthStatus, "born");
});

test("explicit expected-child fields use the DOB sentinel without losing the due date", () => {
  assert.deepEqual(childBirthFormState({
    dateOfBirth: EXPECTED_CHILD_DATE_OF_BIRTH,
    enrollmentStatus: "waitlisted",
    customFields: { birthStatus: "expected", expectedDueDate: "2027-04-20", familyPreference: "morning" },
  }), {
    birthStatus: "expected",
    dateOfBirth: "",
    expectedDueDate: "2027-04-20",
  });

  assert.deepEqual(childBirthCustomFields(
    { familyPreference: "morning" },
    { birthStatus: "expected", expectedDueDate: "2027-04-20" },
  ), {
    familyPreference: "morning",
    birthStatus: "expected",
    expectedDueDate: "2027-04-20",
    dateOfBirthMissing: true,
  });
});

test("marking a child born clears only expected-birth markers", () => {
  assert.deepEqual(childBirthCustomFields(
    { birthStatus: "expected", expectedDueDate: "2027-04-20", dateOfBirthMissing: true, familyPreference: "morning" },
    { birthStatus: "born", actualDateOfBirthProvided: true },
  ), { familyPreference: "morning" });
});

test("calendar date normalization rejects impossible or ambiguous values", () => {
  assert.equal(normalizeCalendarDateValue("2027-02-28"), "2027-02-28");
  assert.equal(normalizeCalendarDateValue("2027-02-30"), null);
  assert.equal(normalizeCalendarDateValue("next Tuesday"), null);
});

test("the expected-child toggle carries forward only a plausible due date", () => {
  const asOf = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(suggestedExpectedDueDate("", "2027-03-15", asOf), "2027-03-15");
  assert.equal(suggestedExpectedDueDate("", "2021-03-15", asOf), "");
  assert.equal(suggestedExpectedDueDate("2027-04-20", "2021-03-15", asOf), "2027-04-20");
});

test("family intake, family editor, and operations APIs expose and validate the expected-child workflow", () => {
  const intakeForm = readFileSync(new URL("../src/components/family-student-intake-form.tsx", import.meta.url), "utf8");
  const intakeApi = readFileSync(new URL("../src/app/api/families/intake/route.ts", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");
  const operations = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");

  assert.match(intakeForm, /Child not born yet/);
  assert.match(intakeForm, /birthStatus: childNotBornYet \? "expected" : "born"/);
  assert.match(intakeForm, /disabled=\{childNotBornYet && !isEnrollmentPipelineStatus\(status\)\}/);
  assert.match(intakeApi, /Expected due date is required for a child who is not born yet/);
  assert.match(intakeApi, /birthStatus === "expected" \? expectedChildPlaceholderDate\(\) : dateOfBirth!/);
  assert.match(intakeApi, /childBirthCustomFields\(existingChild\?\.customFields/);
  assert.match(editor, /Child not born yet/);
  assert.match(editor, /Expected due date/);
  assert.match(editor, /Expected children stay pending or waitlisted/);
  assert.match(editor, /birthStatus: childNotBornYet \? "expected" : "born"/);
  assert.match(editor, /selectedChildBirth\.birthStatus === "expected"/);
  assert.match(operations, /Expected due date is required for a child who is not born yet/);
  assert.match(operations, /must stay pending, waitlisted, or tour scheduled/);
  assert.match(operations, /expectedChildPlaceholderDate\(\)/);
  assert.match(operations, /birthStatus === "born" && existingChild[\s\S]*Prisma\.DbNull/);
});

test("directories and records exports never present the expected-child placeholder as a birthday", () => {
  const directory = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");
  const exportRoute = readFileSync(new URL("../src/app/api/documents/export-package/route.ts", import.meta.url), "utf8");

  assert.match(directory, /childBirthLabel\(child\)/);
  assert.match(directory, /Expected \$\{formatDate/);
  assert.match(exportRoute, /birth\.birthStatus/);
  assert.match(exportRoute, /birth\.dateOfBirth/);
  assert.match(exportRoute, /birth\.expectedDueDate/);
});
