import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
const exportSection = route.slice(
  route.indexOf("async function exportAgencyReconciliationCsv"),
  route.indexOf("function exportAgencyDepositsCsv"),
);

test("reconciliation export preserves the legacy columns before snapshot detail", () => {
  assert.match(exportSection, /csvRow\(\["School ID", "School", "Agency", "Program", "A\/R GL", "Cash GL", "Adjustment GL", "Cost center", "Approved", "Remitted", "Unapplied cash", "Adjustments", "Expected balance", "Ledger balance", "Variance", "Open batch exceptions", "Mapping category", "Snapshot GL", "Snapshot cost center", "Mapping basis", "Snapshot status"\]\)/);
});

test("reconciliation export classifies immutable event-time snapshots without current program mapping fallback", () => {
  assert.doesNotMatch(exportSection, /receivableGlCode|cashGlCode(?!Snapshot)|adjustmentGlCode|agencyProgram\.costCenterCode/);
  assert.match(exportSection, /'receivable'::text AS "mappingCategory"[\s\S]*approval\."glCodeSnapshot"[\s\S]*approval\."costCenterCodeSnapshot"/);
  assert.match(exportSection, /'cash'::text AS "mappingCategory"[\s\S]*receipt\."glCodeSnapshot"[\s\S]*receipt\."costCenterCodeSnapshot"/);
  assert.match(exportSection, /expected_unapplied[\s\S]*batch\."cashGlCodeSnapshot"[\s\S]*batch\."costCenterCodeSnapshot"/);
  assert.match(exportSection, /expected_adjustments[\s\S]*adjustment\."glCodeSnapshot"[\s\S]*adjustment\."costCenterCodeSnapshot"/);
  assert.match(exportSection, /entry\.type IN \('remittance_received', 'remittance_reversal', 'unapplied_cash', 'unapplied_cash_allocation', 'unapplied_cash_reversal'\) THEN 'cash'/);
  assert.match(exportSection, /entry\.type LIKE 'adjustment_%' THEN 'adjustment'/);
  assert.match(exportSection, /UNKNOWN_AT_EVENT_TIME/);
  assert.match(exportSection, /MISSING_IMMUTABLE_EVENT/);
  assert.match(exportSection, /GROUP BY "agencyLedgerAccountId", "mappingCategory", "glCodeSnapshot", "costCenterCodeSnapshot", "snapshotStatus"/);
  assert.match(exportSection, /aggregate\.snapshotStatus === "MISSING_IMMUTABLE_EVENT"/);
});

test("reconciliation export retains exact account scope and exposes control differences", () => {
  assert.match(exportSection, /const accountIds = accounts\.map\(\(account\) => account\.id\)/);
  assert.match(exportSection, /WHERE account\.id IN \(\$\{Prisma\.join\(accountIds\)\}\)/);
  assert.match(exportSection, /account\."centerId" = claim\."centerId"[\s\S]*account\."agencyProgramId" = claim\."agencyProgramId"/);
  assert.match(exportSection, /account\."agencyLedgerAccountId" = adjustment\."ledgerAccountId"[\s\S]*account\."centerId" = adjustment\."centerId"[\s\S]*account\."agencyProgramId" = adjustment\."agencyProgramId"/);
  assert.match(exportSection, /'account_control_difference'::text AS "mappingCategory"[\s\S]*account\."storedBalanceCents" - COALESCE\(SUM\(entry\."amountCents"::bigint\), 0::bigint\)/);
  assert.match(exportSection, /HAVING account\."storedBalanceCents" <> COALESCE\(SUM\(entry\."amountCents"::bigint\), 0::bigint\)/);
});
