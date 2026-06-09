import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRequiredDocumentChecklist,
  findChecklistDefinition,
  groupRequiredChecklistBySubject,
  matchesRequiredChecklistDefinition,
  requiresChecklistAction,
  summarizeRequiredDocumentChecklist,
  staffRequirementsForCenter,
} from "../src/lib/required-document-checklist";

test("required checklist matches records by type, label, and aliases", () => {
  const immunization = findChecklistDefinition("child", "child-immunization");
  assert.ok(immunization);
  assert.equal(matchesRequiredChecklistDefinition(immunization, { name: "Shot Record", type: "health" }), true);
  assert.equal(matchesRequiredChecklistDefinition(immunization, { name: "Lunch Form", type: "meal" }), false);
});

test("required checklist loads school-specific staff credential labels", () => {
  const center = {
    name: "Sarasota",
    crmLocationId: "FL | Sarasota",
    state: "FL",
    licensedCapacity: 94,
    customFields: {
      licensingConfiguration: {
        staffCredentialRules: {
          value: "DCF Affidavit of Good Moral Character\nKid City Staff Handbook Acknowledgment\nCPR / First Aid",
        },
      },
    },
  };
  const definitions = staffRequirementsForCenter(center);
  assert.deepEqual(definitions.map((definition) => definition.label), [
    "DCF Affidavit of Good Moral Character",
    "Kid City Staff Handbook Acknowledgment",
    "CPR / First Aid",
  ]);

  const dynamicDefinition = findChecklistDefinition("staff", "staff-dcfaffidavitofgoodmoralcharacter", { center });
  assert.equal(dynamicDefinition?.label, "DCF Affidavit of Good Moral Character");

  const rows = buildRequiredDocumentChecklist({
    now: new Date("2026-06-04T12:00:00.000Z"),
    families: [],
    staff: [
      {
        id: "staff_1",
        title: "Teacher",
        user: { name: "Jordan Teacher" },
        center,
        certifications: [
          {
            id: "cert_1",
            name: "Kid City Staff Handbook Acknowledgment",
            status: "active",
            expiresAt: null,
          },
        ],
      },
    ],
  });

  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.requirementLabel === "Kid City Staff Handbook Acknowledgment")?.status, "complete");
  assert.equal(rows.find((row) => row.requirementLabel === "DCF Affidavit of Good Moral Character")?.status, "missing");
});

test("required checklist action rule is limited to missing, expired, and rejected rows", () => {
  assert.equal(requiresChecklistAction("missing"), true);
  assert.equal(requiresChecklistAction("expired"), true);
  assert.equal(requiresChecklistAction("rejected"), true);
  assert.equal(requiresChecklistAction("requested"), false);
  assert.equal(requiresChecklistAction("submitted"), false);
  assert.equal(requiresChecklistAction("complete"), false);
});

test("required checklist builds family, child, and staff status rows", () => {
  const rows = buildRequiredDocumentChecklist({
    now: new Date("2026-06-04T12:00:00.000Z"),
    families: [
      {
        id: "family_1",
        name: "Bee Family",
        center: { name: "Sarasota", crmLocationId: "FL | Sarasota" },
        documents: [
          {
            id: "doc_family_1",
            name: "Emergency Card",
            type: "emergency_card",
            status: "APPROVED",
            expiresAt: new Date("2026-12-31T00:00:00.000Z"),
          },
        ],
        children: [
          {
            id: "child_1",
            fullName: "Avery Bee",
            documents: [
              {
                id: "doc_child_1",
                name: "Health Assessment",
                type: "health_assessment",
                status: "APPROVED",
                expiresAt: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "doc_child_2",
                name: "Photo Release",
                type: "photo_video_release",
                status: "SUBMITTED",
                expiresAt: null,
              },
            ],
          },
        ],
      },
    ],
    staff: [
      {
        id: "staff_1",
        title: "Teacher",
        user: { name: "Jordan Teacher" },
        center: { name: "Sarasota", crmLocationId: "FL | Sarasota" },
        certifications: [
          {
            id: "cert_1",
            name: "CPR",
            status: "active",
            expiresAt: new Date("2027-06-01T00:00:00.000Z"),
          },
        ],
      },
    ],
  });

  assert.equal(rows.find((row) => row.key === "family:family_1:family-emergency-card")?.status, "complete");
  assert.equal(rows.find((row) => row.key === "child:child_1:child-health-assessment")?.status, "expired");
  assert.equal(rows.find((row) => row.key === "child:child_1:child-photo-release")?.status, "submitted");
  assert.equal(rows.find((row) => row.key === "staff:staff_1:staff-cpr-first-aid")?.status, "complete");
  assert.equal(rows.find((row) => row.key === "staff:staff_1:staff-background-check")?.status, "missing");

  const summary = summarizeRequiredDocumentChecklist(rows);
  assert.equal(summary.total, 12);
  assert.equal(summary.complete, 2);
  assert.equal(summary.submitted, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.actionNeeded, 9);
});

test("required checklist groups completion by family, child, and staff subject", () => {
  const rows = buildRequiredDocumentChecklist({
    now: new Date("2026-06-04T12:00:00.000Z"),
    families: [
      {
        id: "family_1",
        name: "Bee Family",
        center: { name: "Sarasota", crmLocationId: "FL | Sarasota" },
        documents: [
          {
            id: "doc_family_1",
            name: "Emergency Card",
            type: "emergency_card",
            status: "APPROVED",
            expiresAt: null,
          },
          {
            id: "doc_family_2",
            name: "Parent Handbook Acknowledgment",
            type: "handbook_acknowledgment",
            status: "REQUESTED",
            expiresAt: null,
          },
        ],
        children: [
          {
            id: "child_1",
            fullName: "Avery Bee",
            documents: [
              {
                id: "doc_child_1",
                name: "Immunization Record",
                type: "immunization",
                status: "APPROVED",
                expiresAt: null,
              },
              {
                id: "doc_child_2",
                name: "Health Assessment",
                type: "health_assessment",
                status: "REJECTED",
                expiresAt: null,
              },
            ],
          },
        ],
      },
    ],
    staff: [
      {
        id: "staff_1",
        title: "Teacher",
        user: { name: "Jordan Teacher" },
        center: { name: "Sarasota", crmLocationId: "FL | Sarasota" },
        certifications: [
          {
            id: "cert_1",
            name: "CPR",
            status: "active",
            expiresAt: null,
          },
          {
            id: "cert_2",
            name: "Background Check",
            status: "active",
            expiresAt: null,
          },
        ],
      },
    ],
  });

  const groups = groupRequiredChecklistBySubject(rows);
  const familyGroup = groups.find((group) => group.key === "family:family_1");
  const childGroup = groups.find((group) => group.key === "child:child_1");
  const staffGroup = groups.find((group) => group.key === "staff:staff_1");

  assert.ok(familyGroup);
  assert.equal(familyGroup.summary.total, 4);
  assert.equal(familyGroup.summary.complete, 1);
  assert.equal(familyGroup.summary.requested, 1);
  assert.equal(familyGroup.actionNeeded, 2);
  assert.equal(familyGroup.completePercent, 25);

  assert.ok(childGroup);
  assert.equal(childGroup.summary.total, 4);
  assert.equal(childGroup.summary.complete, 1);
  assert.equal(childGroup.summary.rejected, 1);
  assert.equal(childGroup.actionNeeded, 3);
  assert.equal(childGroup.completePercent, 25);

  assert.ok(staffGroup);
  assert.equal(staffGroup.summary.total, 4);
  assert.equal(staffGroup.summary.complete, 2);
  assert.equal(staffGroup.actionNeeded, 2);
  assert.equal(staffGroup.completePercent, 50);

  assert.equal(groups[0]?.key, "child:child_1");
});
