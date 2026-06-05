import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRequiredDocumentChecklist,
  findChecklistDefinition,
  matchesRequiredChecklistDefinition,
  summarizeRequiredDocumentChecklist,
} from "../src/lib/required-document-checklist";

test("required checklist matches records by type, label, and aliases", () => {
  const immunization = findChecklistDefinition("child", "child-immunization");
  assert.ok(immunization);
  assert.equal(matchesRequiredChecklistDefinition(immunization, { name: "Shot Record", type: "health" }), true);
  assert.equal(matchesRequiredChecklistDefinition(immunization, { name: "Lunch Form", type: "meal" }), false);
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
