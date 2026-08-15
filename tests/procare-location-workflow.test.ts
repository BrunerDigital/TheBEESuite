import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseCsvBuffer, prepareProcareLocationWorkflow } from "../scripts/prepare-procare-location-workflow";

function write(filePath: string, contents: string) {
  fs.writeFileSync(filePath, contents.replaceAll("\n", "\r\n"), "utf8");
}

test("location workflow derives a one-to-one primary payer source and keeps missing gates blocked", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-location-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), [
    "Child ID,Person ID,Person Type,Full Name,First Name,Last Name,Date of Birth,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id,Row ID",
    "child-1,child-person-1,Child,Child One,Child,One,1/2/2022,Infants,room-1,Enrolled,1/1/2026,payer-1,enroll-1",
  ].join("\n"));
  write(path.join(source, "Sample - Relationships.csv"), [
    "Child ID,Row ID,Person ID,Person Type,Person Sort Order,Full Name,First Name,Last Name,Relationship Type,Lives With,Emergency,Authorized Pickup,Phone 1",
    "child-1,relationship-1,payer-1,Relationship,1,Parent One,Parent,One,Mom,Checked,Checked,Checked,Cell 555-555-0101",
  ].join("\n"));
  write(path.join(source, "Sample - Account Balance Summary.csv"), [
    "Account ID,Account Key,Is Hidden,Balance,Person ID,Full Name,First Name,Last Name,Email,Phone 1",
    "account-1,ONE,Unchecked,125.50,payer-1,Parent One,Parent,One,parent@example.com,Cell 555-555-0101",
  ].join("\n"));
  write(path.join(source, "Sample - Employees.csv"), [
    "Employee ID,Is Hidden,Person ID,Full Name,First Name,Last Name,Primary Work Area,Work Area ID,Employment Status,Email,Phone 1",
    "employee-1,Unchecked,staff-person-1,Teacher One,Teacher,One,Infants,room-1,Currently Employed,teacher@example.com,Cell 555-555-0102",
  ].join("\n"));
  write(path.join(source, "Sample - Child Contract Billing Summary.csv"), [
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child\'s Name and Age","Primary Classroom and Billing Cycle","One, Child","4 Yr","Infants","Standard Billing",,"ONE Primary, Parent One","Weekly","Infant Full Time",,150.00,150.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","150.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child\'s Name and Age","Primary Classroom and Billing Cycle","One, Child","4 Yr","Infants","Standard Billing",,"ONE Primary, Parent One","Weekly","Infant Full Time",,150.00,150.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","150.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
  ].join("\n"));
  write(path.join(source, "Sample East - Child Contract Billing Summary.csv"), '"Child Contract Billing Summary","School address","Other School","As of 8/9/2026","other@example.com",,"Child","Age","Foreign, Child","4 Yr","Infants","Standard Billing",,"FOREIGN Primary, Parent","Weekly","Base Tuition",,999.00,999.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","999.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"');
  write(path.join(source, "Sample - Classroom Schedule Summary Weekly.csv"), '"Sample School","Classroom Schedule Summary","School address","school@example.com",,"Infants","Mon 8/3/2026","Tue 8/4/2026","Wed 8/5/2026","Thu 8/6/2026","Fri 8/7/2026","One, Child","7 AM to 5 PM","7 AM to 5 PM","7 AM to 5 PM","7 AM to 5 PM","7 AM to 5 PM",,,,,,,,,,,"Grouped","Page 1","bje: Schedule Summary - Weekly, FD_ClassroomScheduleSummary02.rpt"');

  const result = await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  assert.equal(result.metrics.parentInfoMode, "derived_primary_payer");
  assert.equal(result.metrics.enrolledReadyRecords, 1);
  assert.equal(result.metrics.currentFamilyBalanceTotalCents, 12_550);
  assert.equal(result.metrics.renderedContractBillingRows, 1);
  assert.equal(result.metrics.renderedClassroomScheduleRows, 1);
  assert.equal(result.gates["Roster and relationships"].status, "review_required");
  assert.equal(result.gates["Weekly tuition"].status, "review_required");
  assert.equal(result.gates["Child information"].status, "blocked");
  assert.ok(fs.existsSync(path.join(output, "01-roster-reviewed-import.csv")));
  assert.ok(fs.existsSync(path.join(output, "10-derived-primary-payer-source.csv")));
  assert.ok(fs.existsSync(path.join(output, "13-active-portal-safe-import.csv")));
  assert.ok(fs.existsSync(path.join(output, "14-active-portal-safe-balance-review.csv")));
  const renderedRates = parseCsvBuffer(fs.readFileSync(path.join(output, "15-rendered-contract-billing-review.csv")), "rendered rates").rows;
  assert.equal(renderedRates[0]["source amount cents"], "15000");
  assert.equal(renderedRates[0]["source payer label"], "ONE Primary, Parent One");
  assert.equal(renderedRates[0]["confirmed tuition cents"], "15000");
  assert.equal(renderedRates[0].disposition, "review_required");
  const renderedSchedules = parseCsvBuffer(fs.readFileSync(path.join(output, "16-rendered-classroom-schedule-review.csv")), "rendered schedules").rows;
  assert.equal(renderedSchedules[0]["source classroom"], "Infants");
  assert.equal(renderedSchedules[0]["confirmed child id"], "");
});

test("rendered billing evidence keeps payer boundaries and nets distinct weekly components", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-rendered-billing-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), "Child ID,Person ID,Person Type,Full Name,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id\nchild-1,child-person-1,Child,One Child,Infants,room-1,Enrolled,1/1/2026,payer-1");
  write(path.join(source, "Sample - Relationships.csv"), "Child ID,Row ID,Person ID,Person Type,Full Name,Relationship Type,Lives With,Emergency,Authorized Pickup\nchild-1,row-1,payer-1,Relationship,Parent One,Mom,Checked,Checked,Checked");
  write(path.join(source, "Sample - Account Balance Summary.csv"), "Account ID,Balance,Person ID,Full Name\naccount-1,0.00,payer-1,Parent One");
  const renderedRows = [
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child","Age","One, Child","4 Yr","Infants","Standard Billing",,"ONE Primary, Parent One","Weekly","Base Tuition",,150.00,150.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","125.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child","Age","One, Child","4 Yr","Infants","Standard Billing",,"ONE Primary, Parent One","Weekly","Discount",,-25.00,-25.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","125.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child","Age","One, Child","4 Yr","Infants","Standard Billing",,"TWO Primary, Parent Two","Weekly","Base Tuition",,140.00,140.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","140.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child","Age","Punctuation, Child","4 Yr","Infants","Standard Billing",,"A-B Primary, Parent","Weekly","Base Tuition",,100.00,100.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","100.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
    '"Child Contract Billing Summary","School address","Sample School","As of 8/9/2026","school@example.com",,"Child","Age","Punctuation, Child","4 Yr","Infants","Standard Billing",,"A B Primary, Parent","Weekly","Base Tuition",,110.00,110.00,"Child Count:",1,"Billing Cycle","Cycle Total","Weekly","110.00","Grouped","Page 1","bje: Child Contract Billing Summary, FA_ContractBillingSummary02.rpt"',
  ].join("\r\n");
  fs.writeFileSync(path.join(source, "Sample - Child Contract Billing Summary.csv"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(renderedRows, "utf16le")]));

  const result = await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  assert.equal(result.metrics.renderedContractBillingRows, 4);
  const rates = parseCsvBuffer(fs.readFileSync(path.join(output, "15-rendered-contract-billing-review.csv")), "rendered rates").rows;
  assert.deepEqual(rates.map((row) => [row["source payer label"], row["source amount cents"], row["confirmed tuition cents"]]), [
    ["ONE Primary, Parent One", "12500", "12500"],
    ["TWO Primary, Parent Two", "14000", "14000"],
    ["A B Primary, Parent", "11000", "11000"],
    ["A-B Primary, Parent", "10000", "10000"],
  ]);
  assert.equal(rates[0]["source component count"], "2");
});

test("location workflow rejects duplicate account rows before deriving payer ownership", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-location-duplicate-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), "Child ID,Person ID,Person Type,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id\nchild-1,child-person-1,Child,Infants,room-1,Enrolled,1/1/2026,payer-1");
  write(path.join(source, "Sample - Relationships.csv"), "Child ID,Row ID,Person ID,Person Type,Relationship Type,Lives With,Emergency,Authorized Pickup\nchild-1,relationship-1,payer-1,Relationship,Mom,Checked,Checked,Checked");
  write(path.join(source, "Sample - Account Balance Summary.csv"), [
    "Account ID,Balance,Person ID,Full Name,Email,Phone 1",
    "account-1,1.00,payer-1,Parent One,parent@example.com,555-555-0101",
    "account-1,2.00,payer-2,Parent Two,parent2@example.com,555-555-0102",
  ].join("\n"));
  await assert.rejects(
    prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output }),
    /duplicate Account ID account-1/,
  );
});

test("CSV parser preserves quoted commas and line breaks", () => {
  const parsed = parseCsvBuffer(Buffer.from('Account ID,Comment\r\n1,"Line one, still one\r\nLine two"\r\n'), "quoted.csv");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].Comment, "Line one, still one\r\nLine two");
});

test("location workflow resolves a shared payer only when explicit child membership is unique", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-location-shared-payer-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), [
    "Child ID,Person ID,Person Type,Full Name,First Name,Last Name,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id",
    "child-1,child-person-1,Child,Child One,Child,One,Infants,room-1,Enrolled,1/1/2026,shared-payer",
    "child-2,child-person-2,Child,Child Two,Child,Two,Toddlers,room-2,Enrolled,1/1/2026,shared-payer",
  ].join("\n"));
  write(path.join(source, "Sample - Relationships.csv"), [
    "Child ID,Row ID,Person ID,Person Type,Person Sort Order,Full Name,Relationship Type,Lives With,Emergency,Authorized Pickup",
    "child-1,relationship-1,shared-payer,Relationship,1,Shared Parent,Mom,Checked,Checked,Checked",
    "child-2,relationship-2,shared-payer,Relationship,1,Shared Parent,Mom,Checked,Checked,Checked",
  ].join("\n"));
  write(path.join(source, "Sample - Account Information.csv"), [
    "Account ID,Account Key,Person ID,Person Type,Person Sort ID,Full Name,First Name,Last Name,Email,Phone 1",
    "account-1,ONE,child-person-1,Child,1,Child One,Child,One,,",
    "account-1,ONE,shared-payer,Payer,0,Shared Parent,Shared,Parent,parent@example.com,555-555-0101",
    "account-2,TWO,child-person-2,Child,1,Child Two,Child,Two,,",
    "account-2,TWO,shared-payer,Payer,0,Shared Parent,Shared,Parent,parent@example.com,555-555-0101",
  ].join("\n"));
  write(path.join(source, "Sample - Account Balance Summary.csv"), [
    "Account ID,Account Key,Is Hidden,Balance,Person ID,Full Name",
    "account-1,ONE,Unchecked,0.00,shared-payer,Shared Parent",
    "account-2,TWO,Unchecked,0.00,shared-payer,Shared Parent",
  ].join("\n"));
  const result = await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  assert.equal(result.metrics.uniqueExplicitChildMembershipResolutions, 2);
  assert.equal(result.metrics.enrolledReadyRecords, 2);
  assert.equal(result.gates["Roster and relationships"].status, "ready");
  assert.deepEqual(result.metrics.crossAccountGuardianPersonIds, ["shared-payer"]);
  assert.equal(result.gates["Parent portal and billing links"].status, "blocked");
  assert.equal(result.metrics.activePortalSafeRecords, 0);
  assert.equal(result.metrics.activePortalSafeAccounts, 0);
});

test("location workflow emits an enrolled-only import boundary for portal-safe families", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-location-safe-import-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), [
    "Child ID,Person ID,Person Type,Full Name,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id",
    "active-child,active-person,Child,Active Child,Infants,room-1,Enrolled,1/1/2026,active-parent",
    "withdrawn-child,withdrawn-person,Child,Withdrawn Child,Toddlers,room-2,Withdrawn,1/1/2025,withdrawn-parent",
  ].join("\n"));
  write(path.join(source, "Sample - Relationships.csv"), [
    "Child ID,Row ID,Person ID,Person Type,Full Name,Relationship Type,Lives With,Emergency,Authorized Pickup,Email,Phone 1",
    "active-child,row-1,active-parent,Relationship,Active Parent,Mom,Checked,Checked,Checked,active@example.com,555-555-0101",
    "withdrawn-child,row-2,withdrawn-parent,Relationship,Withdrawn Parent,Mom,Checked,Checked,Checked,withdrawn@example.com,555-555-0102",
  ].join("\n"));
  write(path.join(source, "Sample - Account Information.csv"), [
    "Account ID,Person ID,Person Type,Person Sort ID,Full Name,Email,Phone 1",
    "active-account,active-person,Child,1,Active Child,,",
    "active-account,active-parent,Payer,0,Active Parent,active@example.com,555-555-0101",
    "withdrawn-account,withdrawn-person,Child,1,Withdrawn Child,,",
    "withdrawn-account,withdrawn-parent,Payer,0,Withdrawn Parent,withdrawn@example.com,555-555-0102",
  ].join("\n"));
  write(path.join(source, "Sample - Account Balance Summary.csv"), [
    "Account ID,Balance,Person ID,Full Name,Email,Phone 1",
    "active-account,12.50,active-parent,Active Parent,active@example.com,555-555-0101",
    "withdrawn-account,99.00,withdrawn-parent,Withdrawn Parent,withdrawn@example.com,555-555-0102",
  ].join("\n"));

  const result = await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  assert.equal(result.metrics.activePortalSafeRecords, 1);
  assert.equal(result.metrics.activePortalSafeAccounts, 1);
  assert.equal(result.metrics.activePortalSafeBalanceAccounts, 1);
  assert.equal(result.metrics.activePortalSafeBalanceTotalCents, 1_250);
  const safeRows = parseCsvBuffer(fs.readFileSync(path.join(output, "13-active-portal-safe-import.csv")), "safe").rows;
  assert.deepEqual(safeRows.map((row) => row["child id"]), ["active-child"]);
  const safeBalances = parseCsvBuffer(fs.readFileSync(path.join(output, "14-active-portal-safe-balance-review.csv")), "balances").rows;
  assert.deepEqual(safeBalances.map((row) => row["Account ID"]), ["active-account"]);
});

test("location workflow resolves an ambiguous account only from a unique lives-with payer", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-location-lives-with-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), [
    "Child ID,Person ID,Person Type,Full Name,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id,Relationship 2 Id",
    "child-1,child-person-1,Child,Child One,Infants,room-1,Enrolled,1/1/2026,parent-1,grandparent-1",
  ].join("\n"));
  write(path.join(source, "Sample - Relationships.csv"), [
    "Child ID,Row ID,Person ID,Person Type,Full Name,Relationship Type,Lives With,Emergency,Authorized Pickup,Email,Phone 1",
    "child-1,row-1,parent-1,Relationship,Parent One,Mom,Checked,Checked,Checked,parent@example.com,555-555-0101",
    "child-1,row-1,grandparent-1,Relationship,Grand Parent,Grandmother,Unchecked,Checked,Checked,grand@example.com,555-555-0102",
  ].join("\n"));
  write(path.join(source, "Sample - Account Information.csv"), [
    "Account ID,Person ID,Person Type,Person Sort ID,Full Name,Email,Phone 1",
    "account-parent,parent-1,Payer,0,Parent One,parent@example.com,555-555-0101",
    "account-grand,grandparent-1,Payer,0,Grand Parent,grand@example.com,555-555-0102",
  ].join("\n"));
  write(path.join(source, "Sample - Account Balance Summary.csv"), [
    "Account ID,Balance,Person ID,Full Name,Email,Phone 1",
    "account-parent,0.00,parent-1,Parent One,parent@example.com,555-555-0101",
    "account-grand,0.00,grandparent-1,Grand Parent,grand@example.com,555-555-0102",
  ].join("\n"));

  const result = await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  assert.equal(result.metrics.uniqueLivesWithPayerResolutions, 1);
  assert.equal(result.metrics.enrolledReadyRecords, 1);
  const reviewed = parseCsvBuffer(fs.readFileSync(path.join(output, "01-roster-reviewed-import.csv")), "reviewed").rows;
  assert.equal(reviewed[0]["account id"], "account-parent");
});

test("location workflow derives a weekly candidate only from recurring positive tuition charges", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bee-procare-location-ledger-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  write(path.join(source, "Sample - Enrollment.csv"), "Child ID,Person ID,Person Type,Full Name,Primary Classroom,Classroom ID,Enrollment Status,Status Start Date,Relationship 1 Id\nchild-1,child-person-1,Child,Child One,Infants,room-1,Enrolled,1/1/2026,relationship-parent-1");
  write(path.join(source, "Sample - Relationships.csv"), "Child ID,Row ID,Person ID,Person Type,Full Name,Relationship Type,Lives With,Emergency,Authorized Pickup,Email,Phone 1\nchild-1,row-1,relationship-parent-1,Relationship,Parent One,Mom,Checked,Checked,Checked,parent@example.com,555-555-0101");
  write(path.join(source, "Sample - Account Information.csv"), [
    "Account ID,Person ID,Person Type,Person Sort ID,Full Name,Email,Phone 1",
    "account-1,child-person-1,Child,1001,Child One,,",
    "account-1,payer-parent-1,Payer,0,Parent One,parent@example.com,555-555-0101",
  ].join("\n"));
  write(path.join(source, "Sample - Account Balance Summary.csv"), "Account ID,Balance,Person ID,Full Name,Email,Phone 1\naccount-1,0.00,payer-parent-1,Parent One,parent@example.com,555-555-0101");
  write(path.join(source, "Sample - Account Ledger Information.csv"), [
    "Account ID,Person ID,Post Date,Description,GL Account,Comment,Amount",
    "account-1,payer-parent-1,7/3/2026,Weekly Tuition,Tuition,,150.00",
    "account-1,payer-parent-1,7/10/2026,Weekly Tuition,Tuition,,150.00",
    "account-1,payer-parent-1,7/17/2026,Weekly Tuition,Tuition,,150.00",
    "account-1,payer-parent-1,7/18/2026,Pmt Tuition Express,Undeposited Payments,,-150.00",
  ].join("\n"));

  const result = await prepareProcareLocationWorkflow({ location: "Sample", sourceDirectory: source, outputDirectory: output });
  assert.equal(result.metrics.weeklyStatementCandidateChildren, 1);
  assert.equal(result.metrics.weeklyStatementEvidenceRows, 3);
  assert.equal(result.metrics.exactGuardianAliasResolutions, 1);
  assert.equal(result.gates["Weekly tuition"].status, "review_required");
  const rateRows = parseCsvBuffer(fs.readFileSync(path.join(output, "08-weekly-tuition-review.csv")), "rates").rows;
  assert.equal(rateRows[0]["weekly tuition cents"], "15000");
  assert.equal(rateRows[0].status, "candidate_from_recurring_statement_history_requires_approval");
  const dedupRows = parseCsvBuffer(fs.readFileSync(path.join(output, "12-guardian-dedup-review.csv")), "dedup").rows;
  assert.equal(dedupRows.length, 0);
});
