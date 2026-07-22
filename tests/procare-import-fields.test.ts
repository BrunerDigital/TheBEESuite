import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanProcareImportValue,
  analyzeProcareHeaders,
  applyProcareFieldMapping,
  buildProcareCorrelationReview,
  isActiveProcareEnrollmentStatus,
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
  assert.equal(normalizeProcareEnrollmentStatus("Waiting List"), "waitlisted");
  assert.equal(normalizeProcareEnrollmentStatus("Pre-Registered"), "pending");
  assert.equal(isActiveProcareEnrollmentStatus("Active"), true);
  assert.equal(isActiveProcareEnrollmentStatus("Terminated"), false);
});

test("custom ProCare headings can be reviewed and mapped to BEE Suite fields", () => {
  const headers = ["AcctKey", "Kid Full Name", "Current / Former"];
  assert.equal(analyzeProcareHeaders(headers).every((header) => !header.recognized), true);
  assert.deepEqual(applyProcareFieldMapping(headers, {
    AcctKey: "account id",
    "Kid Full Name": "child name",
    "Current / Former": "child status",
  }), ["account id", "child name", "child status"]);
});

test("ProCare correlations are reviewed in family, child, parent, relationship order", () => {
  const sections = buildProcareCorrelationReview([
    "Guardian Email",
    "Child ID",
    "Account ID",
    "ProCare Relationship Records",
  ], {}, "procare_multi_report_zip");

  assert.deepEqual(sections.map((section) => section.id), ["families", "children", "parents", "relationships"]);
  assert.ok(sections.every((section) => section.required));
  assert.equal(sections[0].correlations[0].destination, "account id");
  assert.equal(sections[3].correlations[0].source, "ProCare Relationship Records");
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
