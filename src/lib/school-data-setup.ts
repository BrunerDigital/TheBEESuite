export const SCHOOL_DATA_SETUP_PATHS = ["import_existing", "start_clean"] as const;
export type SchoolDataSetupPath = (typeof SCHOOL_DATA_SETUP_PATHS)[number];

export const SCHOOL_DATA_SOURCE_SYSTEMS = ["procare", "other"] as const;
export type SchoolDataSourceSystem = (typeof SCHOOL_DATA_SOURCE_SYSTEMS)[number];

export type SchoolDataSetupInput = {
  path?: unknown;
  sourceSystem?: unknown;
  noCurrentFamiliesExpected?: unknown;
  notes?: unknown;
};

export type SchoolDataReviewConfirmation = {
  revision: string;
  path: SchoolDataSetupPath;
  confirmedAt: string;
  confirmedByUserId: string | null;
  confirmedByEmail: string | null;
  latestImportBatchId: string | null;
  familyCount: number;
  childCount: number;
  guardianCount: number;
};

export type SchoolDataSetup = {
  version: 1;
  path: SchoolDataSetupPath | null;
  sourceSystem: SchoolDataSourceSystem | null;
  noCurrentFamiliesExpected: boolean;
  notes: string;
  selectedAt: string | null;
  selectedByUserId: string | null;
  selectedByEmail: string | null;
  reviewConfirmation: SchoolDataReviewConfirmation | null;
};

export type SchoolDataReviewEvidence = {
  dataFingerprint: string | null;
  importTargetFingerprint: string | null;
  familyCount: number;
  childCount: number;
  guardianCount: number;
  familiesMissingGuardianCount: number;
  childrenMissingClassroomCount: number;
  guardiansMissingContactCount: number;
  importBatchCount: number;
  latestRecordUpdatedAt: string | null;
  latestImportBatch: {
    id: string;
    filename: string;
    status: string;
    createdAt: string;
    totalRows: number;
    importedRows: number;
    unresolvedRows: number;
    disposedRows: number;
    errorRows: number;
    sourceSha256: string | null;
    reviewFingerprint: string | null;
  } | null;
  latestFleetVerification: {
    batchId: string;
    status: string;
    blockerCount: number;
    createdAt: string;
    verificationRevision: string | null;
    targetDataFingerprint: string | null;
  } | null;
};

export type SchoolDataReviewStatus =
  | "choose_path"
  | "needs_data"
  | "needs_review"
  | "needs_verification"
  | "ready_to_confirm"
  | "confirmed"
  | "stale";

export type SchoolDataReviewAssessment = {
  status: SchoolDataReviewStatus;
  label: string;
  detail: string;
  canConfirm: boolean;
  confirmationCurrent: boolean;
  revision: string;
  blockedReason: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength = 500) {
  return clean(value, maxLength) || null;
}

function finiteCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizedPath(value: unknown): SchoolDataSetupPath | null {
  return SCHOOL_DATA_SETUP_PATHS.includes(value as SchoolDataSetupPath)
    ? value as SchoolDataSetupPath
    : null;
}

function normalizedSourceSystem(value: unknown): SchoolDataSourceSystem | null {
  return SCHOOL_DATA_SOURCE_SYSTEMS.includes(value as SchoolDataSourceSystem)
    ? value as SchoolDataSourceSystem
    : null;
}

function reviewConfirmation(value: unknown): SchoolDataReviewConfirmation | null {
  const input = record(value);
  const path = normalizedPath(input.path);
  const revision = clean(input.revision, 2_000);
  const confirmedAt = clean(input.confirmedAt, 100);
  if (!path || !revision || !confirmedAt) return null;
  return {
    revision,
    path,
    confirmedAt,
    confirmedByUserId: nullableText(input.confirmedByUserId),
    confirmedByEmail: nullableText(input.confirmedByEmail),
    latestImportBatchId: nullableText(input.latestImportBatchId),
    familyCount: finiteCount(input.familyCount),
    childCount: finiteCount(input.childCount),
    guardianCount: finiteCount(input.guardianCount),
  };
}

export function normalizeSchoolDataSetupInput(value: unknown) {
  const input = record(value);
  const path = normalizedPath(input.path);
  return {
    path,
    sourceSystem: path === "import_existing" ? normalizedSourceSystem(input.sourceSystem) : null,
    noCurrentFamiliesExpected: path === "start_clean" && input.noCurrentFamiliesExpected === true,
    notes: clean(input.notes),
  };
}

export function readSchoolDataSetup(customFields: unknown): SchoolDataSetup {
  const raw = record(record(customFields).schoolDataSetup);
  const input = normalizeSchoolDataSetupInput(raw);
  return {
    version: 1,
    ...input,
    selectedAt: nullableText(raw.selectedAt, 100),
    selectedByUserId: nullableText(raw.selectedByUserId),
    selectedByEmail: nullableText(raw.selectedByEmail),
    reviewConfirmation: reviewConfirmation(raw.reviewConfirmation),
  };
}

export function emptySchoolDataReviewEvidence(): SchoolDataReviewEvidence {
  return {
    dataFingerprint: null,
    importTargetFingerprint: null,
    familyCount: 0,
    childCount: 0,
    guardianCount: 0,
    familiesMissingGuardianCount: 0,
    childrenMissingClassroomCount: 0,
    guardiansMissingContactCount: 0,
    importBatchCount: 0,
    latestRecordUpdatedAt: null,
    latestImportBatch: null,
    latestFleetVerification: null,
  };
}

export function schoolDataReviewRevision(
  setup: Pick<SchoolDataSetup, "path" | "sourceSystem" | "noCurrentFamiliesExpected">,
  evidence: SchoolDataReviewEvidence,
) {
  return JSON.stringify({
    version: 1,
    path: setup.path,
    sourceSystem: setup.sourceSystem,
    noCurrentFamiliesExpected: setup.noCurrentFamiliesExpected,
    dataFingerprint: evidence.dataFingerprint,
    importTargetFingerprint: setup.path === "import_existing" ? evidence.importTargetFingerprint : null,
    familyCount: evidence.familyCount,
    childCount: evidence.childCount,
    guardianCount: evidence.guardianCount,
    familiesMissingGuardianCount: evidence.familiesMissingGuardianCount,
    childrenMissingClassroomCount: evidence.childrenMissingClassroomCount,
    guardiansMissingContactCount: evidence.guardiansMissingContactCount,
    latestRecordUpdatedAt: evidence.latestRecordUpdatedAt,
    latestImportBatchId: evidence.latestImportBatch?.id ?? null,
    latestImportBatchStatus: evidence.latestImportBatch?.status ?? null,
    latestImportReviewFingerprint: evidence.latestImportBatch?.reviewFingerprint ?? null,
    latestImportTotalRows: evidence.latestImportBatch?.totalRows ?? 0,
    latestImportImportedRows: evidence.latestImportBatch?.importedRows ?? 0,
    latestImportUnresolvedRows: evidence.latestImportBatch?.unresolvedRows ?? 0,
    latestImportDisposedRows: evidence.latestImportBatch?.disposedRows ?? 0,
    latestImportErrorRows: evidence.latestImportBatch?.errorRows ?? 0,
    latestFleetBatchId: evidence.latestFleetVerification?.batchId ?? null,
    latestFleetStatus: evidence.latestFleetVerification?.status ?? null,
    latestFleetBlockerCount: evidence.latestFleetVerification?.blockerCount ?? 0,
    latestFleetVerificationRevision: evidence.latestFleetVerification?.verificationRevision ?? null,
    latestFleetTargetDataFingerprint: evidence.latestFleetVerification?.targetDataFingerprint ?? null,
  });
}

export function schoolDataImportVerificationRevision(batch: NonNullable<SchoolDataReviewEvidence["latestImportBatch"]>) {
  return JSON.stringify({
    version: 1,
    batchId: batch.id,
    batchStatus: batch.status,
    sourceSha256: batch.sourceSha256,
    reviewFingerprint: batch.reviewFingerprint,
    totalRows: batch.totalRows,
    importedRows: batch.importedRows,
    unresolvedRows: batch.unresolvedRows,
    disposedRows: batch.disposedRows,
    errorRows: batch.errorRows,
  });
}

function assessment(
  status: SchoolDataReviewStatus,
  label: string,
  detail: string,
  revision: string,
  options: { canConfirm?: boolean; confirmationCurrent?: boolean; blockedReason?: string | null } = {},
): SchoolDataReviewAssessment {
  return {
    status,
    label,
    detail,
    revision,
    canConfirm: options.canConfirm ?? false,
    confirmationCurrent: options.confirmationCurrent ?? false,
    blockedReason: options.blockedReason ?? null,
  };
}

export function assessSchoolDataSetup(
  setup: SchoolDataSetup,
  evidence: SchoolDataReviewEvidence,
): SchoolDataReviewAssessment {
  const revision = schoolDataReviewRevision(setup, evidence);
  const confirmationCurrent = Boolean(
    setup.reviewConfirmation
    && setup.reviewConfirmation.path === setup.path
    && setup.reviewConfirmation.revision === revision,
  );
  if (confirmationCurrent) {
    return assessment(
      "confirmed",
      "Data review confirmed",
      "The confirmation matches this school’s current setup path and data evidence.",
      revision,
      { confirmationCurrent: true },
    );
  }

  if (!setup.path) {
    return assessment(
      "choose_path",
      "Choose a starting point",
      "Select whether this school will move existing records or start with a clean workspace.",
      revision,
      { blockedReason: "Choose and save a data setup path first." },
    );
  }

  const staleConfirmation = Boolean(setup.reviewConfirmation);
  if (setup.path === "import_existing") {
    if (!setup.sourceSystem) {
      return assessment(
        staleConfirmation ? "stale" : "needs_data",
        "Choose the source system",
        "Identify the previous system so the correct reviewed mapping can be used.",
        revision,
        { blockedReason: "Choose the source system before uploading records." },
      );
    }
    if (setup.sourceSystem === "other") {
      return assessment(
        staleConfirmation ? "stale" : "needs_data",
        "BEE source mapping needed",
        "The starting point is saved. The BEE setup team must prepare and validate a school-specific source adapter before the director is asked to review or upload anything.",
        revision,
        { blockedReason: "BEE setup team: prepare the reviewed source adapter for this school." },
      );
    }
    const batch = evidence.latestImportBatch;
    if (!batch) {
      return assessment(
        staleConfirmation ? "stale" : "needs_data",
        "Source package needed",
        "Upload the complete school-scoped source package and submit it for review.",
        revision,
        { blockedReason: "No reviewed import batch exists for this school." },
      );
    }
    if (batch.status === "processing") {
      return assessment(
        "needs_data",
        "Import is still processing",
        "Continue the existing import batch before starting another review.",
        revision,
        { blockedReason: "The latest import batch is still processing." },
      );
    }
    const batchFinished = batch.status === "completed" || batch.status === "completed_with_errors";
    if (batch.unresolvedRows > 0 || !batchFinished) {
      return assessment(
        staleConfirmation ? "stale" : "needs_review",
        "Resolve import exceptions",
        `${batch.unresolvedRows.toLocaleString()} source row${batch.unresolvedRows === 1 ? "" : "s"} still need mapping, correction, or an evidenced exclusion.`,
        revision,
        { blockedReason: "Finish every unresolved source row before final confirmation." },
      );
    }
    if (!batch.sourceSha256 || !batch.reviewFingerprint) {
      return assessment(
        staleConfirmation ? "stale" : "needs_verification",
        "Refresh the guarded review",
        "The latest batch does not include the source hash and review fingerprint required for final confirmation.",
        revision,
        { blockedReason: "Run a fresh guarded review for the unchanged source package." },
      );
    }
    const fleet = evidence.latestFleetVerification;
    if (
      !fleet
      || fleet.batchId !== batch.id
      || fleet.status !== "READY_FOR_DIRECTOR_REVIEW"
      || fleet.blockerCount > 0
      || fleet.verificationRevision !== schoolDataImportVerificationRevision(batch)
      || !evidence.importTargetFingerprint
      || fleet.targetDataFingerprint !== evidence.importTargetFingerprint
    ) {
      return assessment(
        staleConfirmation ? "stale" : "needs_verification",
        "Run whole-school verification",
        "Generate the latest whole-school verification and clear every required source-domain blocker.",
        revision,
        { blockedReason: "The latest import has not passed whole-school verification." },
      );
    }
    return assessment(
      staleConfirmation ? "stale" : "ready_to_confirm",
      staleConfirmation ? "Review changed data again" : "Ready for director confirmation",
      "The guarded import and whole-school verification are ready. Complete the final school-scoped spot check and confirm.",
      revision,
      { canConfirm: true, blockedReason: null },
    );
  }

  const noRosterYet = evidence.familyCount === 0 && evidence.childCount === 0 && evidence.guardianCount === 0;
  if (noRosterYet) {
    if (!setup.noCurrentFamiliesExpected) {
      return assessment(
        staleConfirmation ? "stale" : "needs_data",
        "Add records or confirm none are expected",
        "This clean-start school has no current family or child records yet.",
        revision,
        { blockedReason: "Add the first family and child, or confirm that no current families are expected yet." },
      );
    }
    return assessment(
      staleConfirmation ? "stale" : "ready_to_confirm",
      staleConfirmation ? "Reconfirm the clean start" : "Clean start ready to confirm",
      "No current families or children are expected yet. Confirm this starting state without creating placeholder records.",
      revision,
      { canConfirm: true },
    );
  }

  if (!evidence.familyCount || !evidence.childCount || !evidence.guardianCount) {
    return assessment(
      staleConfirmation ? "stale" : "needs_data",
      "Complete the first household",
      "Each current child needs a family and at least one reviewed guardian before the clean-start roster can be confirmed.",
      revision,
      { blockedReason: "Complete the current family, child, and guardian records." },
    );
  }
  const reviewGaps = evidence.familiesMissingGuardianCount
    + evidence.childrenMissingClassroomCount
    + evidence.guardiansMissingContactCount;
  if (reviewGaps > 0) {
    return assessment(
      staleConfirmation ? "stale" : "needs_review",
      "Finish clean-start record review",
      "Resolve missing guardians, reachable contacts, and classroom assignments before confirming the roster.",
      revision,
      { blockedReason: "Resolve the listed clean-start record gaps before final confirmation." },
    );
  }
  return assessment(
    staleConfirmation ? "stale" : "ready_to_confirm",
    staleConfirmation ? "Review changed data again" : "Ready for director confirmation",
    "The current clean-start households have guardians, reachable contact details, and classroom assignments. Complete the final school-scoped review and confirm.",
    revision,
    { canConfirm: true },
  );
}
