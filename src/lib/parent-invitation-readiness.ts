import { isActiveProcareEnrollmentStatus } from "@/lib/procare-import-fields";

type ImportedRecord = {
  sourceSystem?: string | null;
  externalId?: string | null;
};

type GuardianIdentity = ImportedRecord & {
  id: string;
  familyId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
};

type ChildIdentity = ImportedRecord & {
  id: string;
  fullName: string;
  enrollmentStatus: string;
};

type ImportBatchState = {
  id: string;
  status: string;
  summary: unknown;
} | null;

export type ParentInvitationReadinessInput = {
  guardian: GuardianIdentity;
  family: ImportedRecord & {
    id: string;
    centerId?: string | null;
    children: ChildIdentity[];
  };
  matchingEmailGuardians?: GuardianIdentity[];
  relevantImportBatch?: ImportBatchState;
};

export type ParentInvitationReadiness = {
  ok: boolean;
  blockers: string[];
  importBatchId: string | null;
};

const REQUIRED_PROCARE_REPORTS = ["enrollment", "parentinfo", "relationships", "childinfo"] as const;

export type ProcareInvitationBatchReadiness = {
  ok: boolean;
  blockers: string[];
  importBatchId: string | null;
};

export type ProcareImportBatchScope = {
  id: string;
  centerId: string;
  summary: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function digits(value: string | null | undefined) {
  return clean(value).replace(/\D/g, "");
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function reportDetectionComplete(datasetCoverage: Record<string, unknown>) {
  const detection = record(datasetCoverage.reportDetection);
  return REQUIRED_PROCARE_REPORTS.every((reportName) => {
    const report = record(detection[reportName]);
    return number(report.sourceFileCount) > 0 && clean(report.sourceName).length > 0;
  });
}

function sourceRowsComplete(datasetCoverage: Record<string, unknown>) {
  const sourceRows = record(datasetCoverage.sourceRows);
  return (
    number(sourceRows.enrollment) > 0
    && number(sourceRows.accountPeople) > 0
    && number(sourceRows.relationships) > 0
    && number(sourceRows.childInfo) > 0
  );
}

function renderedReportDetectionComplete(datasetCoverage: Record<string, unknown>) {
  const inventory = Array.isArray(datasetCoverage.sourceInventory)
    ? datasetCoverage.sourceInventory.map(record)
    : [];
  const requiredKinds = [
    "rendered_account_information",
    "rendered_enrollment_status",
    "rendered_registration",
  ];
  return requiredKinds.every((reportKind) => inventory.some((item) => (
    clean(item.reportKind) === reportKind
    && number(item.rows) > 0
    && number(item.matchedHeaderAliases) > 0
  )));
}

function renderedSourceRowsComplete(datasetCoverage: Record<string, unknown>) {
  const sourceRows = record(datasetCoverage.sourceRows);
  return (
    number(sourceRows.accountChildren) > 0
    && number(sourceRows.registrations) > 0
    && number(sourceRows.enrollmentStatusNames) > 0
  );
}

function warningCoverageCount(datasetCoverage: Record<string, unknown>) {
  return Object.values(record(datasetCoverage.warningCoverage)).reduce<number>((total, value) => total + number(value), 0);
}

export function procareSourceFingerprintCollisionCenterIds(
  batches: ProcareImportBatchScope[],
) {
  const batchCentersBySourceFingerprint = new Map<string, Map<string, Set<string>>>();
  for (const batch of batches) {
    const summary = record(batch.summary);
    const touchedCenterIds = Array.isArray(summary.centerIdsTouched)
      ? summary.centerIdsTouched.filter((value): value is string => typeof value === "string")
      : [];
    const sourceFingerprint = clean(summary.sourceSha256);
    if (!sourceFingerprint) continue;
    const batchesForFingerprint = batchCentersBySourceFingerprint.get(sourceFingerprint) ?? new Map<string, Set<string>>();
    batchesForFingerprint.set(batch.id, new Set([batch.centerId, ...touchedCenterIds]));
    batchCentersBySourceFingerprint.set(sourceFingerprint, batchesForFingerprint);
  }

  const collisions = new Set<string>();
  for (const batchesForFingerprint of batchCentersBySourceFingerprint.values()) {
    if (batchesForFingerprint.size < 2) continue;
    const batchCenterSets = [...batchesForFingerprint.values()];
    for (let left = 0; left < batchCenterSets.length; left += 1) {
      for (let right = left + 1; right < batchCenterSets.length; right += 1) {
        const leftCenters = batchCenterSets[left];
        const rightCenters = batchCenterSets[right];
        const sameCenters = (
          leftCenters.size === rightCenters.size
          && [...leftCenters].every((centerId) => rightCenters.has(centerId))
        );
        if (sameCenters) continue;
        const combinedCenters = new Set([...leftCenters, ...rightCenters]);
        if (combinedCenters.size < 2) continue;
        for (const centerId of combinedCenters) collisions.add(centerId);
      }
    }
  }
  return collisions;
}

export function evaluateProcareInvitationBatchReadiness(
  batch: ImportBatchState,
): ProcareInvitationBatchReadiness {
  if (!batch) {
    return {
      ok: false,
      blockers: ["No completed ProCare import batch is linked to this school or family."],
      importBatchId: null,
    };
  }

  const blockers: string[] = [];
  const summary = record(batch.summary);
  const datasetCoverage = record(summary.datasetCoverage);
  const sourceType = clean(summary.sourceType);
  const isGuardedRenderedPackage = sourceType === "procare_rendered_report_files";
  if (batch.status !== "completed") {
    blockers.push("The linked ProCare import is not complete and error-free.");
  }
  if (
    number(summary.errors)
    || number(summary.unresolved)
    || number(summary.warningRows)
    || number(summary.disposed)
  ) {
    blockers.push("The linked ProCare import still has errors, unresolved warnings, or disposed source rows.");
  }
  if (summary.sourceInventoryConfirmed !== true) {
    blockers.push("The ProCare source-file inventory was not confirmed before import.");
  }
  if (isGuardedRenderedPackage) {
    const normalizedRows = record(datasetCoverage.normalizedRows);
    if (
      clean(summary.importMethod) !== "guarded_rendered_package"
      || !clean(summary.reviewFingerprint)
      || number(normalizedRows.ready) <= 0
      || number(normalizedRows.needsResolution) !== number(summary.excludedUnresolvedRows)
    ) {
      blockers.push("The rendered ProCare package was not fully reviewed or did not exclude every unresolved row.");
    }
    if (!renderedReportDetectionComplete(datasetCoverage) || !renderedSourceRowsComplete(datasetCoverage)) {
      blockers.push("The rendered ProCare account, registration, and enrollment-status reports are not all present.");
    }
  } else {
    if (!sourceType.startsWith("procare_multi_report_")) {
      blockers.push("Parent invitations require a complete guarded ProCare import package.");
    }
    if (!reportDetectionComplete(datasetCoverage) || !sourceRowsComplete(datasetCoverage)) {
      blockers.push("The ProCare enrollment, parent, relationship, and child-information reports are not all present.");
    }
  }
  if (warningCoverageCount(datasetCoverage)) {
    blockers.push("The ProCare source package still contains unresolved account, child, or relationship coverage warnings.");
  }

  return { ok: blockers.length === 0, blockers, importBatchId: batch.id };
}

function conflictingGuardianIdentity(
  guardian: GuardianIdentity,
  candidate: GuardianIdentity,
) {
  if (candidate.id === guardian.id) return false;
  const sameName = normalizedName(candidate.fullName) === normalizedName(guardian.fullName);
  const guardianExternalId = clean(guardian.externalId);
  const candidateExternalId = clean(candidate.externalId);
  const sameExternalIdentity = Boolean(guardianExternalId && candidateExternalId && guardianExternalId === candidateExternalId);
  return !sameName && !sameExternalIdentity;
}

export function evaluateParentInvitationReadiness(
  input: ParentInvitationReadinessInput,
): ParentInvitationReadiness {
  const blockers: string[] = [];
  const guardianEmail = clean(input.guardian.email).toLowerCase();

  if (!input.family.centerId) {
    blockers.push("The family is not linked to a school.");
  }
  if (!guardianEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
    blockers.push("The guardian needs a valid email address.");
  }
  if (digits(input.guardian.phone).length < 4) {
    blockers.push("The guardian needs a phone number with at least four digits for the initial kiosk PIN.");
  }
  if (!input.family.children.length) {
    blockers.push("The family has no linked child records.");
  } else if (!input.family.children.some((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus))) {
    blockers.push("The family has no active or pending child enrollment to open in the parent portal.");
  }

  const identityConflicts = (input.matchingEmailGuardians ?? []).filter((candidate) => (
    clean(candidate.email).toLowerCase() === guardianEmail
    && conflictingGuardianIdentity(input.guardian, candidate)
  ));
  if (identityConflicts.length) {
    blockers.push("This email is attached to guardian records with conflicting identities. Resolve the duplicate before inviting.");
  }

  // Import provenance is useful for school setup and reconciliation, but it is
  // not required to safely authorize a guardian against the records currently
  // stored in The BEE Suite. Invitation access is therefore based on the
  // internal family relationship and concrete identity-conflict checks above.
  // Keep the batch ID as diagnostic context without turning batch completeness
  // into an access gate.
  return {
    ok: blockers.length === 0,
    blockers,
    importBatchId: input.relevantImportBatch?.id ?? null,
  };
}
