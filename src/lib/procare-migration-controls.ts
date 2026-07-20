export type ReconciliationMeasure = {
  key: string;
  label: string;
  source: number | null;
  target: number | null;
  difference: number | null;
  status: "match" | "mismatch" | "not_available";
};

export function buildProcareReconciliationReport(input: {
  batchId: string;
  sourceSha256?: string;
  batchStatus: string;
  importedRows: number;
  errorRows: number;
  source: Record<string, number | null | undefined>;
  target: Record<string, number | null | undefined>;
}) {
  const definitions = [
    ["families", "Families"],
    ["children", "Children"],
    ["guardians", "Guardians"],
    ["staff", "Staff"],
    ["classrooms", "Classrooms"],
    ["balanceCents", "Balances (cents)"],
    ["creditsCents", "Credits (cents)"],
    ["openInvoicesCents", "Open invoices (cents)"],
  ] as const;
  const measures: ReconciliationMeasure[] = definitions.map(([key, label]) => {
    const source = input.source[key] ?? null;
    const target = input.target[key] ?? null;
    const available = source !== null && target !== null;
    const difference = available ? target - source : null;
    return {
      key,
      label,
      source,
      target,
      difference,
      status: !available ? "not_available" : difference === 0 ? "match" : "mismatch",
    };
  });
  const unresolved = measures.filter((measure) => measure.status !== "match");
  return {
    reportType: "procare_source_target_reconciliation",
    generatedAt: new Date().toISOString(),
    batchId: input.batchId,
    sourceSha256: input.sourceSha256 ?? null,
    batchStatus: input.batchStatus,
    importedRows: input.importedRows,
    errorRows: input.errorRows,
    decision: input.errorRows === 0 && unresolved.length === 0 ? "reconciled" : "needs_review",
    measures,
    enforcement: {
      cutoverAllowed: false,
      reason: "This automated report is evidence only. Written director, corporate, technical, and ProCare cutover approvals remain required.",
    },
  };
}

export const PROCARE_ROLLBACK_EVIDENCE_REQUIREMENTS = [
  "batchId",
  "sourceSha256",
  "backupReference",
  "affectedCenterId",
  "affectedModules",
  "stopTime",
  "lastKnownGoodTime",
  "postImportWritesReference",
  "reconciliationOwner",
  "directorDecision",
  "corporateDecision",
] as const;

export function assessProcareRollbackEvidence(evidence: Record<string, unknown>) {
  const missing = PROCARE_ROLLBACK_EVIDENCE_REQUIREMENTS.filter((key) => {
    const value = evidence[key];
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  });
  return { complete: missing.length === 0, missing };
}

export const PROCARE_RAW_IMPORT_RETENTION_DAYS = 90;

export function procareRetentionReviewDue(createdAt: Date, retentionDays = PROCARE_RAW_IMPORT_RETENTION_DAYS) {
  return new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}
