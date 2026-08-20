import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessProcareFleetSourceCoverage,
  buildProcareFleetVerificationReport,
} from "@/lib/procare-fleet-verification";
import { buildProcareReconciliationReport } from "@/lib/procare-migration-controls";

const completeRecord = {
  "account id": "account-1",
  "child id": "child-1",
  "procare relationship records": "[]",
  "guardian id": "guardian-1",
  "enrollment status": "Enrolled",
  classroom: "Preschool",
  balance: "125.00",
  "procare child info source records": "[]",
  "employee id": "staff-1",
  "employee name": "Taylor Teacher",
  "weekly rate": "250.00",
  cadence: "weekly",
  "effective date": "2026-08-24",
};

test("fleet source coverage fails closed when a required school dataset is missing", () => {
  const recordWithoutBalance = Object.fromEntries(Object.entries(completeRecord).filter(([key]) => key !== "balance"));
  const coverage = assessProcareFleetSourceCoverage([recordWithoutBalance]);
  const balances = coverage.domains.find((domain) => domain.key === "opening_balances");

  assert.equal(coverage.requiredDomainsComplete, false);
  assert.equal(balances?.status, "missing");
});

test("fleet verification advances only a complete matched batch to director review", () => {
  const sourceCoverage = assessProcareFleetSourceCoverage([completeRecord], { sourceInventory: [] });
  const reconciliation = buildProcareReconciliationReport({
    batchId: "batch-1",
    batchStatus: "completed",
    importedRows: 1,
    errorRows: 0,
    source: {
      families: 1,
      children: 1,
      guardians: 1,
      emergencyContacts: 0,
      authorizedPickups: 0,
      staff: 0,
      classrooms: 1,
      balanceCents: 12500,
      creditsCents: 0,
      openInvoicesCents: 12500,
    },
    target: {
      families: 1,
      children: 1,
      guardians: 1,
      emergencyContacts: 0,
      authorizedPickups: 0,
      staff: 0,
      classrooms: 1,
      balanceCents: 12500,
      creditsCents: 0,
      openInvoicesCents: 12500,
    },
  });
  const report = buildProcareFleetVerificationReport({
    batchId: "batch-1",
    centerId: "center-1",
    sourceSha256: "source-hash",
    batchStatus: "completed",
    sourceInventoryConfirmed: true,
    sourceCoverage,
    reconciliation,
    exceptionsWithoutEvidence: 0,
  });

  assert.equal(report.status, "READY_FOR_DIRECTOR_REVIEW");
  assert.equal(report.enforcement.cutoverAllowed, false);
});

test("ignored sources and weak exception evidence keep a fleet batch unverified", () => {
  const sourceCoverage = assessProcareFleetSourceCoverage([completeRecord], {
    sourceInventory: [{ sourceName: "unknown.csv", reportKind: "ignored", note: "unsupported" }],
  });
  const reconciliation = buildProcareReconciliationReport({
    batchId: "batch-2",
    batchStatus: "completed_with_errors",
    importedRows: 1,
    errorRows: 1,
    disposedRows: 1,
    source: {},
    target: {},
  });
  const report = buildProcareFleetVerificationReport({
    batchId: "batch-2",
    centerId: "center-1",
    sourceSha256: "source-hash",
    batchStatus: "completed_with_errors",
    sourceInventoryConfirmed: true,
    sourceCoverage,
    reconciliation,
    exceptionsWithoutEvidence: 1,
  });

  assert.equal(report.status, "NOT_VERIFIED");
  assert.ok(report.blockers.some((blocker) => blocker.includes("ignored")));
  assert.ok(report.blockers.some((blocker) => blocker.includes("lack complete")));
});
