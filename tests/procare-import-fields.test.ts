import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanProcareImportValue,
  normalizeProcareEnrollmentStatus,
  procareAgeGroup,
  procareChildFullName,
  procareChildPreferredName,
  procareClassroomName,
  procareSourceFields,
  procareValue,
} from "../src/lib/procare-import-fields";

test("ProCare import fields ignore placeholder values from exported reports", () => {
  assert.equal(cleanProcareImportValue("-------"), "");
  assert.equal(procareValue({ classroom: "-------", room: "Preschool 1" }, ["classroom", "room"]), "Preschool 1");
  assert.equal(procareClassroomName({ classroom: "-------", "primary work area": "Toddler A" }), "Toddler A");
  assert.equal(procareAgeGroup({ "age group": "-------", classroom: "-------" }), "Unassigned");
  assert.equal(procareClassroomName({ classroom: "Unknown", room: "Toddler 1" }), "Toddler 1");
});

test("ProCare child display names can be built from split name columns", () => {
  const row = {
    "child name": "Rivera, Avery J",
    "first name": "Avery",
    "middle initial": "J",
    "last name": "Rivera",
  };

  assert.equal(procareChildFullName(row), "Avery J Rivera");
  assert.equal(procareChildPreferredName(row), "Avery");
});

test("ProCare enrollment statuses are normalized for app display and filtering", () => {
  assert.equal(normalizeProcareEnrollmentStatus("Summer Break"), "summer_break");
  assert.equal(normalizeProcareEnrollmentStatus("Withdrawn"), "withdrawn");
  assert.equal(normalizeProcareEnrollmentStatus("Active"), "enrolled");
});

test("ProCare source fields preserve Longmont-style import labels", () => {
  assert.deepEqual(procareSourceFields({
    "row type": "child_contact",
    "source location": "Kid City USA Longmont",
    "source system": "ProCare",
    "source notes": "Child relationship row",
    gender: "F",
    "end date": "12/31/2070",
  }), {
    rowType: "child_contact",
    sourceLocation: "Kid City USA Longmont",
    sourceSystem: "ProCare",
    sourceNotes: "Child relationship row",
    childFirstName: "",
    childMiddleInitial: "",
    childLastName: "",
    childGender: "F",
    childEndDate: "12/31/2070",
    employeeStatus: "",
    employeeStatusDate: "",
    primaryWorkArea: "",
  });
});
