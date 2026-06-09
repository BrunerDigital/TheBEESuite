import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRecordsExportPackage,
  recordsPackageCsv,
  recordsPackageFilename,
} from "../src/lib/records-export-package";

test("records package builds a manifest-backed JSON export with CSV files", () => {
  const recordsPackage = buildRecordsExportPackage({
    generatedAt: "2026-06-09T12:00:00.000Z",
    generatedBy: {
      userId: "user_1",
      name: "Director User",
      email: "director@example.com",
      role: "CENTER_DIRECTOR",
    },
    centers: [
      {
        id: "center_1",
        label: "FL | Sarasota",
        state: "FL",
      },
    ],
    sections: [
      {
        id: "documents",
        title: "Document records",
        description: "Document metadata for records requests.",
        filename: "documents.csv",
        headers: ["owner", "document", "status"],
        rows: [
          ["Bee Family", "Emergency Card", "APPROVED"],
          ["Avery Bee", "Immunization Record", "REQUESTED"],
        ],
      },
      {
        id: "incidents",
        title: "Incidents",
        description: "Incident review records.",
        filename: "incidents.csv",
        headers: ["child", "status"],
        rows: [["Avery Bee", "reviewed"]],
      },
    ],
  });

  assert.equal(recordsPackage.exportType, "licensing_records_package");
  assert.equal(recordsPackage.version, 1);
  assert.equal(recordsPackage.scope.centerCount, 1);
  assert.equal(recordsPackage.totals.files, 2);
  assert.equal(recordsPackage.totals.records, 3);
  assert.deepEqual(recordsPackage.manifest.map((section) => section.filename), ["documents.csv", "incidents.csv"]);
  assert.equal(recordsPackage.files[0]?.recordCount, 2);
  assert.match(recordsPackage.files[0]?.content ?? "", /"owner","document","status"/);
  assert.match(recordsPackage.disclaimer, /does not certify legal or licensing compliance/i);
});

test("records package CSV escapes quotes, commas, and blank values", () => {
  const csv = recordsPackageCsv(
    ["name", "notes", "empty"],
    [["Bee, Avery", 'Needs "signed" form', null]],
  );

  assert.equal(csv, '"name","notes","empty"\n"Bee, Avery","Needs ""signed"" form",""');
});

test("records package filename uses the export date", () => {
  assert.equal(
    recordsPackageFilename(new Date("2026-06-09T12:00:00.000Z")),
    "bee-suite-licensing-records-package-2026-06-09.json",
  );
});
