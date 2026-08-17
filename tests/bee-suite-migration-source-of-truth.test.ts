import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { confirmBeeSuiteMigrationSourceOfTruth } from "../scripts/confirm-bee-suite-migration-source-of-truth";
import { parseCsvBuffer, prepareProcareLocationWorkflow } from "../scripts/prepare-procare-location-workflow";

type CsvRow = Record<string, string>;

function write(filePath: string, lines: string[]) {
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(rows: CsvRow[], headers: string[]) {
  return `${[
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(",")),
  ].join("\r\n")}\r\n`;
}

async function preparedSiblingPackage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-migration-source-of-truth-"));
  const source = path.join(root, "source");
  const output = path.join(root, "package");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), [
    "Child ID,Person ID,Person Type,Full Name,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id",
    "child-1,child-person-1,Child,Child One,Infants,room-1,Enrolled,1/1/2026,parent-1",
    "child-2,child-person-2,Child,Child Two,Toddlers,room-2,Enrolled,1/1/2026,parent-1",
  ]);
  write(path.join(source, "Sample - Relationships.csv"), [
    "Child ID,Row ID,Person ID,Person Type,Full Name,Relationship Type,Lives With,Emergency,Authorized Pickup,Email,Phone 1",
    "child-1,relationship-1,parent-1,Relationship,Parent One,Mom,Checked,Checked,Checked,parent@example.com,555-555-0101",
    "child-2,relationship-2,parent-1,Relationship,Parent One,Mom,Checked,Checked,Checked,parent@example.com,555-555-0101",
  ]);
  write(path.join(source, "Sample - Account Information.csv"), [
    "Account ID,Person ID,Person Type,Person Sort ID,Full Name,Email,Phone 1",
    "account-1,child-person-1,Child,1,Child One,,",
    "account-1,child-person-2,Child,2,Child Two,,",
    "account-1,parent-1,Payer,0,Parent One,parent@example.com,555-555-0101",
  ]);
  write(path.join(source, "Sample - Account Balance Summary.csv"), [
    "Account ID,Account Key,Is Hidden,Balance,Person ID,Full Name,Email,Phone 1",
    "account-1,ONE,Unchecked,125.00,parent-1,Parent One,parent@example.com,555-555-0101",
  ]);
  write(path.join(source, "Sample - Child Tuition.csv"), [
    "Child ID,Weekly Rate,Frequency,Effective Date,Description",
    "child-1,150.00,Weekly,8/17/2026,Infant tuition",
    "child-2,100.00,Weekly,8/17/2026,Toddler tuition",
  ]);
  await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  return { root, output };
}

function reviewedTemplate(packageDirectory: string, mutate?: (row: CsvRow, index: number) => void) {
  const baselinePath = path.join(packageDirectory, "17-bee-suite-migration-source-of-truth.csv");
  const parsed = parseCsvBuffer(fs.readFileSync(baselinePath), "baseline template");
  for (const [index, row] of parsed.rows.entries()) {
    row["Opening Balance Confirmation"] = "confirmed";
    row["Tuition Effective Week"] = "2026-W34";
    row["Tuition Confirmation"] = "confirmed";
    row["Family Child Link Confirmation"] = "confirmed";
    row.Disposition = "ready";
    mutate?.(row, index);
  }
  const reviewedPath = path.join(packageDirectory, "reviewed-source-of-truth.csv");
  fs.writeFileSync(reviewedPath, csv(parsed.rows, parsed.headers), "utf8");
  return reviewedPath;
}

test("BEE migration confirmation binds siblings to one family balance and child-level weekly rates", async () => {
  const { output } = await preparedSiblingPackage();
  const template = parseCsvBuffer(fs.readFileSync(path.join(output, "17-bee-suite-migration-source-of-truth.csv")), "template");
  assert.deepEqual(template.rows.map((row) => [row["Source Child ID"], row["Source Weekly Tuition Cents"]]), [
    ["child-1", "15000"],
    ["child-2", "10000"],
  ]);

  const result = confirmBeeSuiteMigrationSourceOfTruth({
    packageDirectory: output,
    reviewedTemplatePath: reviewedTemplate(output),
  });
  assert.equal(result.status, "confirmed_source_of_truth");
  assert.equal(result.counts.familyAccounts, 1);
  assert.equal(result.counts.children, 2);
  assert.equal(result.totals.openingBalanceCents, 12_500);
  assert.equal(result.totals.weeklyTuitionCents, 25_000);
  const roster = parseCsvBuffer(fs.readFileSync(path.join(output, "confirmed", "confirmed-roster-import.csv")), "confirmed roster");
  assert.deepEqual(roster.rows.map((row) => row.balance), ["125.00", "125.00"]);
});

test("BEE migration confirmation rejects source-field edits and balance drift", async () => {
  const first = await preparedSiblingPackage();
  assert.throws(() => confirmBeeSuiteMigrationSourceOfTruth({
    packageDirectory: first.output,
    reviewedTemplatePath: reviewedTemplate(first.output, (row, index) => {
      if (index === 0) row["Source Child Name"] = "Changed Name";
    }),
  }), /changed source column Source Child Name/);

  const second = await preparedSiblingPackage();
  assert.throws(() => confirmBeeSuiteMigrationSourceOfTruth({
    packageDirectory: second.output,
    reviewedTemplatePath: reviewedTemplate(second.output, (row, index) => {
      if (index === 0) row["Confirmed Opening Balance Cents"] = "99999";
    }),
  }), /opening balance does not match the source/);
});
