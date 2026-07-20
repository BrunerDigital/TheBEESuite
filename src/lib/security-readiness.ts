export type DatabaseSecurityPosture = {
  expectedPublicTableCount?: number;
  publicTableCount: number;
  rlsEnabledCount: number;
  tablesWithoutRls: string[];
  browserTableGrants: Array<{ grantee: string; tableName: string; privileges: string[] }>;
  publicSecurityDefinerFunctions: string[];
  unsafePublicViews: string[];
};

export type SecurityPostureFinding = {
  code: "TABLE_COUNT_DRIFT" | "RLS_COVERAGE" | "BROWSER_GRANT" | "SECURITY_DEFINER" | "UNSAFE_VIEW";
  detail: string;
};

export function evaluateDatabaseSecurityPosture(posture: DatabaseSecurityPosture): SecurityPostureFinding[] {
  const findings: SecurityPostureFinding[] = [];

  if (posture.expectedPublicTableCount !== undefined && posture.publicTableCount !== posture.expectedPublicTableCount) {
    findings.push({
      code: "TABLE_COUNT_DRIFT",
      detail: `Expected ${posture.expectedPublicTableCount} public tables but found ${posture.publicTableCount}; reconcile migrations before accepting RLS coverage`,
    });
  }

  if (posture.publicTableCount !== posture.rlsEnabledCount || posture.tablesWithoutRls.length > 0) {
    findings.push({
      code: "RLS_COVERAGE",
      detail: `${posture.rlsEnabledCount}/${posture.publicTableCount} public tables have RLS; missing: ${posture.tablesWithoutRls.join(", ") || "count mismatch"}`,
    });
  }
  for (const grant of posture.browserTableGrants) {
    findings.push({
      code: "BROWSER_GRANT",
      detail: `${grant.grantee} has ${grant.privileges.join(",")} on public.${grant.tableName}`,
    });
  }
  for (const routine of posture.publicSecurityDefinerFunctions) {
    findings.push({ code: "SECURITY_DEFINER", detail: `public.${routine} is SECURITY DEFINER` });
  }
  for (const view of posture.unsafePublicViews) {
    findings.push({ code: "UNSAFE_VIEW", detail: `public.${view} is not security_invoker` });
  }
  return findings;
}

export const requiredIsolationCases = [
  "executive_cross_tenant",
  "director_cross_school",
  "billing_cross_school",
  "teacher_cross_classroom",
  "parent_cross_family",
  "kiosk_cross_school",
  "custody_need_to_know",
  "medical_need_to_know",
  "document_cross_school",
  "audit_log_cross_school",
] as const;

export type IsolationEvidenceRecord = {
  caseId: (typeof requiredIsolationCases)[number];
  result: "PASS" | "FAIL" | "BLOCKED";
  environment: string;
  testedAt: string;
  actorRole: string;
  expectedBoundary: string;
  sanitizedEvidenceRef: string;
};

export function validateIsolationEvidence(records: IsolationEvidenceRecord[]) {
  const errors: string[] = [];
  const byCase = new Map(records.map((record) => [record.caseId, record]));

  for (const caseId of requiredIsolationCases) {
    const record = byCase.get(caseId);
    if (!record) {
      errors.push(`Missing isolation case: ${caseId}`);
      continue;
    }
    if (record.result !== "PASS") errors.push(`${caseId} is ${record.result}`);
    if (!record.environment.trim()) errors.push(`${caseId} is missing environment`);
    if (!Number.isFinite(Date.parse(record.testedAt))) errors.push(`${caseId} has an invalid testedAt timestamp`);
    if (!record.actorRole.trim()) errors.push(`${caseId} is missing actorRole`);
    if (!record.expectedBoundary.trim()) errors.push(`${caseId} is missing expectedBoundary`);
    if (!record.sanitizedEvidenceRef.trim()) errors.push(`${caseId} is missing sanitizedEvidenceRef`);
  }

  return errors;
}
