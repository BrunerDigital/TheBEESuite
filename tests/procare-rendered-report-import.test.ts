import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRenderedProcareReportRowsFromFiles,
  parseRenderedProcareBalanceRows,
  preparedRenderedProcareDatasetCoverage,
} from "@/lib/procare-rendered-report-import";

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
      11: "parent82@example.test\nCell 828 555-0100",
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
        19: "parent82@example.test\nCell 828 555-0100",
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
  assert.equal(result.records[0]["guardian email"], "parent82@example.test");
  assert.equal(result.records[0]["guardian phone"], "8285550100");
  assert.equal(result.records[0]["procare rendered source match"], "name_and_dob");
  assert.equal(result.records[0]["import warning"], undefined);
  const relationships = JSON.parse(result.records[0]["procare relationship records"]) as Array<{ guardian: boolean; emergency: boolean; authorizedPickup: boolean; phone: string }>;
  assert.deepEqual(relationships.map(({ guardian, emergency, authorizedPickup }) => ({ guardian, emergency, authorizedPickup })), [
    { guardian: true, emergency: true, authorizedPickup: true },
  ]);
  assert.equal(relationships[0].phone, "8285550100");
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

test("rendered account sheets carry payer identity from the account header onto later child rows", () => {
  const files = new Map<string, Buffer>([
    ["account.csv", Buffer.from([
      row({
        3: "Account Information Sheet",
        6: "[COCHRAN]",
        9: "Cochran, AnnMarie",
        10: "48 Teresa Trail",
        11: "Cell 828 555-0100",
      }),
      row({
        6: "[COCHRAN]",
        15: "Lee, Delilah",
        17: "Toddlers",
        18: "DOB: 5/21/2023",
        19: "Enrolled",
      }),
    ].join("\n"))],
    ["registration.csv", Buffer.from(row({
      2: "Child Registration Information",
      5: "Lee, Delilah",
      6: "DOB: 5/21/2023",
      8: "Toddlers",
      11: "Enrolled",
    }))],
  ]);

  const result = buildRenderedProcareReportRowsFromFiles(files);
  assert.ok(result);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]["account id"], "COCHRAN");
  assert.equal(result.records[0]["family name"], "AnnMarie Cochran Family");
  assert.equal(result.records[0]["guardian name"], "AnnMarie Cochran");
  assert.equal(result.records[0]["guardian phone"], "8285550100");
  assert.equal(result.records[0]["import warning"], undefined);
});

test("prepared rendered CSVs retain their reviewed source coverage manifest", () => {
  const manifest = {
    sourceInventory: [{ sourceName: "account.csv", reportKind: "rendered_account_information", rows: 1 }],
    normalizedRows: { ready: 1, needsResolution: 2 },
  };
  const prepared = [
    csvRow(["child name", "procare dataset coverage manifest"]),
    csvRow(["Avery Smith", JSON.stringify(manifest)]),
  ].join("\n");

  assert.deepEqual(preparedRenderedProcareDatasetCoverage(prepared), manifest);
});

test("rendered balance reports retain every account row, hidden state, and signed cents", () => {
  const source = Buffer.from([
    row({ 1: "Account Balance Summary - All Accounts (Primary & Agency)", 10: "[*ALLEN] Allen, Euricka - Hidden", 11: "2,934.60" }),
    row({ 10: "[BROWN] Brown, Jordan", 11: "(125.25)" }),
    row({ 10: "[ZERO] Zero, Family", 11: "0.00" }),
  ].join("\n"));

  assert.deepEqual(parseRenderedProcareBalanceRows(source), [
    { accountKey: "ALLEN", payerName: "Allen, Euricka", hidden: true, balanceCents: 293460 },
    { accountKey: "BROWN", payerName: "Brown, Jordan", hidden: false, balanceCents: -12525 },
    { accountKey: "ZERO", payerName: "Zero, Family", hidden: false, balanceCents: 0 },
  ]);
});

test("rendered imports disambiguate shared truncated account keys by payer name", () => {
  const files = new Map<string, Buffer>([
    ["accounts.csv", Buffer.from([
      row({ 3: "Account Information Sheet", 6: "[BROWN]", 9: "Brown, Carson", 15: "Brown, Avery", 18: "DOB: 1/2/2022" }),
      row({ 3: "Account Information Sheet", 6: "[BROWN]", 9: "Mckenzie, Bernadette", 15: "Mckenzie, Casey", 18: "DOB: 2/3/2022" }),
    ].join("\n"))],
    ["relationships.csv", Buffer.from([
      row({ 2: "Child Registration Information", 5: "Brown, Avery", 6: "DOB: 1/2/2022", 15: "Brown, Carson", 16: "Parent" }),
      row({ 2: "Child Registration Information", 5: "Mckenzie, Casey", 6: "DOB: 2/3/2022", 15: "Mckenzie, Bernadette", 16: "Parent" }),
    ].join("\n"))],
    ["balances.csv", Buffer.from([
      row({ 1: "Account Balance Summary", 10: "[BROWN] Brown, Carson", 11: "1,262.00" }),
      row({ 1: "Account Balance Summary", 10: "[BROWN] Brown, Carson", 11: "1,262.00" }),
      row({ 1: "Account Balance Summary", 10: "[BROWN] Mckenzie, Bernadette", 11: "7,517.15" }),
    ].join("\n"))],
  ]);

  const result = buildRenderedProcareReportRowsFromFiles(files);
  assert.ok(result);
  assert.deepEqual(result.records.map((record) => [record["family name"], record.balance]), [
    ["Carson Brown Family", "1262.00"],
    ["Bernadette Mckenzie Family", "7517.15"],
  ]);
  assert.equal(result.datasetCoverage.sourceRows.balances, 2);
});
