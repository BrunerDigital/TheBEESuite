import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessProcareRollbackEvidence,
  buildProcareReconciliationReport,
  procareRetentionReviewDue,
} from "@/lib/procare-migration-controls";

test("reconciliation reports fail closed on differences and unavailable financial evidence", () => {
  const report = buildProcareReconciliationReport({
    batchId: "batch_synthetic",
    sourceSha256: "abc123",
    batchStatus: "completed",
    importedRows: 4,
    errorRows: 0,
    source: { families: 2, children: 2, guardians: null, balanceCents: 15000 },
    target: { families: 2, children: 1, guardians: 3, balanceCents: 15000 },
  });

  assert.equal(report.decision, "needs_review");
  assert.equal(report.measures.find((item) => item.key === "families")?.status, "match");
  assert.equal(report.measures.find((item) => item.key === "children")?.difference, -1);
  assert.equal(report.measures.find((item) => item.key === "guardians")?.status, "not_available");
  assert.equal(report.enforcement.cutoverAllowed, false);
});

test("rollback evidence identifies every missing approval and recovery reference", () => {
  const result = assessProcareRollbackEvidence({ batchId: "batch_synthetic", sourceSha256: "abc123" });
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("backupReference"));
  assert.ok(result.missing.includes("directorDecision"));

  const complete = assessProcareRollbackEvidence({
    batchId: "batch_synthetic",
    sourceSha256: "abc123",
    backupReference: "secure://synthetic-backup",
    affectedCenterId: "center_synthetic",
    affectedModules: ["families"],
    stopTime: "2026-07-20T12:00:00Z",
    lastKnownGoodTime: "2026-07-20T11:00:00Z",
    postImportWritesReference: "secure://synthetic-write-log",
    reconciliationOwner: "Synthetic Owner",
    directorDecision: "NO-GO",
    corporateDecision: "NO-GO",
  });
  assert.equal(complete.complete, true);
});

test("raw import retention produces a deterministic review date", () => {
  assert.equal(
    procareRetentionReviewDue(new Date("2026-07-20T00:00:00.000Z")).toISOString(),
    "2026-10-18T00:00:00.000Z",
  );
});
