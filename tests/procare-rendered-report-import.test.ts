import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRenderedProcareReportRowsFromFiles } from "@/lib/procare-rendered-report-import";

function csvRow(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
}

function row(columns: Record<number, string>, width = 24) {
  return csvRow(Array.from({ length: width }, (_, index) => columns[index + 1] ?? ""));
}

test("rendered ProCare reports join account, child, relationship, and balance data without relying on filenames", () => {
  const files = new Map<string, Buffer>([
    ["sensible account export.csv", Buffer.from(row({
      1: "Kid City USA Canton NC",
      3: "Account Information Sheet",
      6: "[SMITH]",
      9: "Smith, Jordan",
      10: "1 Main St",
      11: "parent@example.test\nCell 828 555-0100",
      15: "Smith, Avery",
      17: "Preschool",
      18: "DOB: 1/2/2022",
      22: "FD_AccountInformation03.rpt",
    }))],
    ["registration.csv", Buffer.from([
      row({
        1: "Kid City USA Canton NC",
        2: "Child Registration Information",
        5: "Smith, Avery",
        6: "Female\nDOB: 1/2/2022",
        7: "Classroom",
        8: "Preschool",
        10: "Status",
        11: "Enrolled",
        12: "Relationships",
        15: "Smith, Jordan",
        16: "Mom",
        18: "Lives With Emergency Pickup",
        19: "parent@example.test\nCell 828 555-0100",
      }),
    ].join("\n"))],
    ["balances.csv", Buffer.from(row({
      1: "Account Balance Summary",
      9: "Balance",
      10: "[SMITH] Smith, Jordan",
      11: "125.50",
      15: "FA_AccountBalanceSummary01.rpt",
    }))],
    ["payment history.csv", Buffer.from(row({
      3: "Tuition Express Payments by Type",
      6: "ACH",
      7: "[SMITH]",
      18: "TE_PaymentByType01.rpt",
    }))],
  ]);

  const result = buildRenderedProcareReportRowsFromFiles(files);
  assert.ok(result);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]["account id"], "SMITH");
  assert.equal(result.records[0]["child name"], "Avery Smith");
  assert.equal(result.records[0].balance, "125.50");
  assert.equal(result.records[0]["procare rendered source match"], "name_and_dob");
  assert.equal(result.records[0]["import warning"], undefined);
  const relationships = JSON.parse(result.records[0]["procare relationship records"]) as Array<{ guardian: boolean; emergency: boolean; authorizedPickup: boolean }>;
  assert.deepEqual(relationships.map(({ guardian, emergency, authorizedPickup }) => ({ guardian, emergency, authorizedPickup })), [
    { guardian: true, emergency: true, authorizedPickup: true },
  ]);
  assert.equal(result.datasetCoverage.sourceInventory.find((item) => item.sourceName === "payment history.csv")?.reportKind, "evidence_only");
});

test("rendered ProCare reports fail closed when a registration cannot be linked to one account", () => {
  const files = new Map<string, Buffer>([
    ["account.csv", Buffer.from(row({
      3: "Account Information Sheet",
      6: "[ACCOUNT1]",
      9: "Parent, One",
      15: "Child, Linked",
      18: "DOB: 1/1/2022",
      22: "FD_AccountInformation03.rpt",
    }))],
    ["registration.csv", Buffer.from(row({
      2: "Child Registration Information",
      5: "Child, Missing",
      6: "DOB: 2/2/2022",
      8: "Preschool",
      11: "Enrolled",
    }))],
  ]);

  const result = buildRenderedProcareReportRowsFromFiles(files);
  assert.ok(result);
  assert.match(result.records[0]["import warning"], /missing from the account-information report/i);
  assert.equal(result.datasetCoverage.normalizedRows.needsResolution, 2);
});

test("alternate ProCare child-information layout accepts trailing account markers and uses flat child IDs and statuses", () => {
  const files = new Map<string, Buffer>([
    ["one.csv", Buffer.from(row({
      3: "Account Information Sheet",
      6: "[SMITH*]",
      9: "Smith, Jordan",
      11: "parent@example.test",
      15: "Smith, Avery",
      17: "Preschool",
      18: "DOB: 1/2/2022",
    }))],
    ["two.csv", Buffer.from([
      row({ 2: "Child Information Sheet", 5: "Smith, Avery", 7: "Preschool", 8: "DOB: 1/2/2022" }),
      row({ 10: "Smith, Jordan", 12: "Mom", 13: "Lives With Emergency Pickup", 14: "parent@example.test\n828-555-0100" }),
    ].join("\n"))],
    ["three.csv", Buffer.from([
      csvRow(["Child ID", "Full Name", "Gender", "Date of Birth", "Primary Classroom", "Classroom ID", "Enrollment Status", "Status Date", "Person ID"]),
      csvRow(["CHILD-123", "Smith, Avery", "Female", "1/2/2022", "Preschool", "ROOM-4", "Enrolled", "8/1/2025", "PERSON-8"]),
    ].join("\n"))],
  ]);

  const result = buildRenderedProcareReportRowsFromFiles(files);
  assert.ok(result);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]["account id"], "SMITH");
  assert.equal(result.records[0]["child id"], "CHILD-123");
  assert.equal(result.records[0]["child person id"], "PERSON-8");
  assert.equal(result.records[0]["classroom id"], "ROOM-4");
  assert.equal(result.records[0]["child status"], "Enrolled");
  assert.equal(result.records[0]["guardian email"], "parent@example.test");
  assert.equal(result.records[0]["import warning"], undefined);
});
