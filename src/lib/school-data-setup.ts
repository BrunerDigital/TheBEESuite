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
  sourceSystem?: SchoolDataSourceSystem | null;
  noCurrentFamiliesExpected?: boolean;
  confirmedAt: string;
  confirmedByUserId: string | null;
  confirmedByEmail: string | null;
  latestImportBatchId: string | null;
  familyCount: number;
  childCount: number;
  guardianCount: number;
  relevantFamilyCount?: number;
  relevantChildCount?: number;
  domainFingerprints?: Record<string, string>;
  domainMetrics?: Record<string, number>;
  sourceEvidenceReceipt?: {
    batchId: string;
    filename: string;
    sourceSha256: string;
    reviewFingerprint: string;
    sourceAdapter?: "procare" | "bee_flat_file_v1";
    retainedRowCount: number;
    recordedAt: string;
    status: "recoverable_backup_available";
  } | null;
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
  centerStatus: string | null;
  dataFingerprint: string | null;
  importTargetFingerprint: string | null;
  domainFingerprints: Record<string, string>;
  domainMetrics: Record<string, number>;
  familyCount: number;
  childCount: number;
  guardianCount: number;
  relevantFamilyCount: number;
  relevantChildCount: number;
  prospectiveFamilyCount: number;
  prospectiveChildCount: number;
  familiesMissingChildCount: number;
  childrenNeedingEnrollmentStatusReviewCount: number;
  familiesMissingGuardianCount: number;
  childrenMissingClassroomCount: number;
  childrenMissingScheduleCount: number;
  familiesMissingEmergencyContactCount: number;
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
    sourceAdapter: "procare" | "bee_flat_file_v1";
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
  baselineFrozen: boolean;
  changedSinceConfirmation: boolean;
  changedDomains: string[];
  changeDeltas: string[];
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
  const rawDomainFingerprints = record(input.domainFingerprints);
  const domainFingerprints = Object.fromEntries(
    Object.entries(rawDomainFingerprints)
      .filter(([, entry]) => typeof entry === "string" && entry.length > 0)
      .map(([key, entry]) => [key, clean(entry, 200)]),
  );
  const domainMetrics = Object.fromEntries(
    Object.entries(record(input.domainMetrics))
      .filter(([, entry]) => typeof entry === "number" && Number.isFinite(entry))
      .map(([key, entry]) => [key, finiteCount(entry)]),
  );
  const rawReceipt = record(input.sourceEvidenceReceipt);
  const receiptBatchId = clean(rawReceipt.batchId, 500);
  const receiptFilename = clean(rawReceipt.filename, 500);
  const receiptSourceSha256 = clean(rawReceipt.sourceSha256, 200);
  const receiptReviewFingerprint = clean(rawReceipt.reviewFingerprint, 500);
  const receiptRecordedAt = clean(rawReceipt.recordedAt, 100);
  const sourceEvidenceReceipt = receiptBatchId
    && receiptFilename
    && receiptSourceSha256
    && receiptReviewFingerprint
    && receiptRecordedAt
    && rawReceipt.status === "recoverable_backup_available"
    ? {
        batchId: receiptBatchId,
        filename: receiptFilename,
        sourceSha256: receiptSourceSha256,
        reviewFingerprint: receiptReviewFingerprint,
        sourceAdapter: rawReceipt.sourceAdapter === "bee_flat_file_v1" ? "bee_flat_file_v1" as const : "procare" as const,
        retainedRowCount: finiteCount(rawReceipt.retainedRowCount),
        recordedAt: receiptRecordedAt,
        status: "recoverable_backup_available" as const,
      }
    : null;
  return {
    revision,
    path,
    sourceSystem: path === "import_existing" ? normalizedSourceSystem(input.sourceSystem) : null,
    noCurrentFamiliesExpected: path === "start_clean" && input.noCurrentFamiliesExpected === true,
    confirmedAt,
    confirmedByUserId: nullableText(input.confirmedByUserId),
    confirmedByEmail: nullableText(input.confirmedByEmail),
    latestImportBatchId: nullableText(input.latestImportBatchId),
    familyCount: finiteCount(input.familyCount),
    childCount: finiteCount(input.childCount),
    guardianCount: finiteCount(input.guardianCount),
    relevantFamilyCount: finiteCount(input.relevantFamilyCount),
    relevantChildCount: finiteCount(input.relevantChildCount),
    domainFingerprints,
    domainMetrics,
    sourceEvidenceReceipt,
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
    centerStatus: null,
    dataFingerprint: null,
    importTargetFingerprint: null,
    domainFingerprints: {},
    domainMetrics: {},
    familyCount: 0,
    childCount: 0,
    guardianCount: 0,
    relevantFamilyCount: 0,
    relevantChildCount: 0,
    prospectiveFamilyCount: 0,
    prospectiveChildCount: 0,
    familiesMissingChildCount: 0,
    childrenNeedingEnrollmentStatusReviewCount: 0,
    familiesMissingGuardianCount: 0,
    childrenMissingClassroomCount: 0,
    childrenMissingScheduleCount: 0,
    familiesMissingEmergencyContactCount: 0,
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
    centerStatus: evidence.centerStatus,
    dataFingerprint: evidence.dataFingerprint,
    importTargetFingerprint: setup.path === "import_existing" ? evidence.importTargetFingerprint : null,
    domainFingerprints: evidence.domainFingerprints,
    domainMetrics: evidence.domainMetrics,
    familyCount: evidence.familyCount,
    childCount: evidence.childCount,
    guardianCount: evidence.guardianCount,
    relevantFamilyCount: evidence.relevantFamilyCount,
    relevantChildCount: evidence.relevantChildCount,
    prospectiveFamilyCount: evidence.prospectiveFamilyCount,
    prospectiveChildCount: evidence.prospectiveChildCount,
    familiesMissingChildCount: evidence.familiesMissingChildCount,
    childrenNeedingEnrollmentStatusReviewCount: evidence.childrenNeedingEnrollmentStatusReviewCount,
    familiesMissingGuardianCount: evidence.familiesMissingGuardianCount,
    childrenMissingClassroomCount: evidence.childrenMissingClassroomCount,
    childrenMissingScheduleCount: evidence.childrenMissingScheduleCount,
    familiesMissingEmergencyContactCount: evidence.familiesMissingEmergencyContactCount,
    guardiansMissingContactCount: evidence.guardiansMissingContactCount,
    latestRecordUpdatedAt: evidence.latestRecordUpdatedAt,
    latestImportBatchId: evidence.latestImportBatch?.id ?? null,
    latestImportBatchStatus: evidence.latestImportBatch?.status ?? null,
    latestImportReviewFingerprint: evidence.latestImportBatch?.reviewFingerprint ?? null,
    latestImportSourceAdapter: evidence.latestImportBatch?.sourceAdapter ?? null,
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
    sourceAdapter: batch.sourceAdapter,
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
    baselineFrozen: false,
    changedSinceConfirmation: false,
    changedDomains: [],
    changeDeltas: [],
  };
}

const domainLabels: Record<string, string> = {
  roster: "family, child, or guardian records",
  safety: "safety, pickup, emergency-contact, or schedule records",
  classrooms: "classrooms, capacity, or ratios",
  staff: "staff, credentials, or schedules",
  billing: "opening balances or ledger records",
};

const domainMetricLabels: Record<string, string> = {
  totalFamilies: "All family records",
  totalChildren: "All child records",
  guardians: "Guardian records",
  authorizedPickups: "Authorized pickups",
  emergencyContacts: "Emergency contacts",
  medicalNotes: "Medical notes",
  allergies: "Allergy records",
  currentChildrenMissingSchedule: "Current children missing schedules",
  classrooms: "Classrooms",
  staff: "Staff profiles",
  staffSchedules: "Staff schedules",
  certifications: "Staff certifications",
  openingBalanceInvoices: "Opening-balance invoices",
  openingBalanceLedgerEntries: "Opening-balance ledger entries",
};

function changedConfirmationDomains(setup: SchoolDataSetup, evidence: SchoolDataReviewEvidence) {
  const confirmed = setup.reviewConfirmation?.domainFingerprints ?? {};
  return Object.entries(evidence.domainFingerprints)
    .filter(([key, value]) => confirmed[key] && confirmed[key] !== value)
    .map(([key]) => domainLabels[key] ?? key);
}

function changedConfirmationMetrics(setup: SchoolDataSetup, evidence: SchoolDataReviewEvidence) {
  const confirmed = setup.reviewConfirmation?.domainMetrics ?? {};
  return Object.entries(evidence.domainMetrics).flatMap(([key, current]) => {
    const prior = confirmed[key];
    if (typeof prior !== "number" || prior === current) return [];
    const difference = current - prior;
    return [`${domainMetricLabels[key] ?? key}: ${difference > 0 ? "+" : ""}${difference.toLocaleString()} (${prior.toLocaleString()} to ${current.toLocaleString()})`];
  });
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
    return {
      ...assessment(
        "confirmed",
        "Data review confirmed",
        "The confirmation matches this school’s current setup path and data evidence.",
        revision,
        { confirmationCurrent: true },
      ),
      baselineFrozen: evidence.centerStatus === "active",
    };
  }

  const baselineFrozen = Boolean(
    setup.reviewConfirmation
    && setup.reviewConfirmation.path === setup.path
    && setup.reviewConfirmation.sourceSystem === setup.sourceSystem
    && setup.reviewConfirmation.noCurrentFamiliesExpected === setup.noCurrentFamiliesExpected
    && evidence.centerStatus === "active",
  );
  const expectedAdapter = setup.sourceSystem === "other" ? "bee_flat_file_v1" : "procare";
  const baselineBatch = evidence.latestImportBatch;
  const baselineFleet = evidence.latestFleetVerification;
  const importedLaunchSourceStillValid = setup.path !== "import_existing" || Boolean(
    setup.sourceSystem
    && baselineBatch
    && baselineBatch.sourceAdapter === expectedAdapter
    && setup.reviewConfirmation?.latestImportBatchId === baselineBatch.id
    && (!setup.reviewConfirmation.sourceEvidenceReceipt || (
      setup.reviewConfirmation.sourceEvidenceReceipt.batchId === baselineBatch.id
      && setup.reviewConfirmation.sourceEvidenceReceipt.sourceSha256 === baselineBatch.sourceSha256
      && setup.reviewConfirmation.sourceEvidenceReceipt.reviewFingerprint === baselineBatch.reviewFingerprint
      && setup.reviewConfirmation.sourceEvidenceReceipt.sourceAdapter === baselineBatch.sourceAdapter
    ))
    && baselineFleet?.batchId === baselineBatch.id
    && baselineFleet.status === "READY_FOR_DIRECTOR_REVIEW"
    && baselineFleet.blockerCount === 0
    && baselineFleet.verificationRevision === schoolDataImportVerificationRevision(baselineBatch),
  );
  if (baselineFrozen && importedLaunchSourceStillValid) {
    const changedDomains = changedConfirmationDomains(setup, evidence);
    const changeDeltas = changedConfirmationMetrics(setup, evidence);
    return {
      ...assessment(
        "confirmed",
        "Launch data baseline preserved",
        changedDomains.length
          ? `The approved launch baseline remains preserved. Normal operations changed ${changedDomains.join(", ")} after confirmation.`
          : "The approved launch baseline remains preserved while the school operates.",
        revision,
        { confirmationCurrent: true },
      ),
      baselineFrozen: true,
      changedSinceConfirmation: changedDomains.length > 0 || setup.reviewConfirmation?.revision !== revision,
      changedDomains,
      changeDeltas,
    };
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
    const requiredAdapter = setup.sourceSystem === "other" ? "bee_flat_file_v1" : "procare";
    if (batch.sourceAdapter !== requiredAdapter) {
      return assessment(
        staleConfirmation ? "stale" : "needs_data",
        "Review the selected source format",
        setup.sourceSystem === "other"
          ? "The latest batch used the ProCare adapter. Run a reviewed BEE flat-file import for this school, or change the saved source system."
          : "The latest batch used the BEE flat-file adapter. Run a reviewed ProCare import for this school, or change the saved source system.",
        revision,
        { blockedReason: "The saved source system does not match the latest reviewed import batch." },
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

  if (evidence.familiesMissingChildCount > 0) {
    return assessment(
      staleConfirmation ? "stale" : "needs_review",
      "Finish incomplete family records",
      `${evidence.familiesMissingChildCount.toLocaleString()} family record${evidence.familiesMissingChildCount === 1 ? " has" : "s have"} no child relationship and must be completed or intentionally removed before confirmation.`,
      revision,
      { blockedReason: "Resolve family records that do not contain a child relationship." },
    );
  }
  if (evidence.childrenNeedingEnrollmentStatusReviewCount > 0) {
    return assessment(
      staleConfirmation ? "stale" : "needs_review",
      "Review child enrollment statuses",
      `${evidence.childrenNeedingEnrollmentStatusReviewCount.toLocaleString()} child record${evidence.childrenNeedingEnrollmentStatusReviewCount === 1 ? " has" : "s have"} a missing or unrecognized enrollment status.`,
      revision,
      { blockedReason: "Assign a recognized current, pipeline, break, or closed enrollment status to every child." },
    );
  }

  const noRosterYet = evidence.relevantFamilyCount === 0 && evidence.relevantChildCount === 0 && evidence.guardianCount === 0;
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

  if (!evidence.relevantFamilyCount || !evidence.relevantChildCount || !evidence.guardianCount) {
    return assessment(
      staleConfirmation ? "stale" : "needs_data",
      "Complete the first household",
      "Each current or prospective child needs a family and at least one reviewed guardian before the clean-start roster can be confirmed.",
      revision,
      { blockedReason: "Complete the current or prospective family, child, and guardian records." },
    );
  }
  const reviewGaps = evidence.familiesMissingGuardianCount
    + evidence.childrenMissingClassroomCount
    + evidence.childrenMissingScheduleCount
    + evidence.familiesMissingEmergencyContactCount
    + evidence.guardiansMissingContactCount;
  if (reviewGaps > 0) {
    return assessment(
      staleConfirmation ? "stale" : "needs_review",
      "Finish clean-start record review",
      "Resolve missing guardians, reachable contacts, emergency contacts, schedules, and required classroom assignments before confirming the roster.",
      revision,
      { blockedReason: "Resolve the listed clean-start record gaps before final confirmation." },
    );
  }
  return assessment(
    staleConfirmation ? "stale" : "ready_to_confirm",
    staleConfirmation ? "Review changed data again" : "Ready for director confirmation",
    "Current and prospective clean-start households have reviewed relationships, reachable contacts, emergency contacts, schedules, and required classroom assignments. Complete the final school-scoped safety review and confirm.",
    revision,
    { canConfirm: true },
  );
}
