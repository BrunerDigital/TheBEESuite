import type { ReconciliationMeasure } from "@/lib/procare-migration-controls";

type SourceRecord = Record<string, string>;

type SourceInventoryItem = {
  sourceName?: string;
  reportKind?: string;
  rows?: number;
  note?: string;
};

export type ProcareSourceDomain = {
  key: string;
  label: string;
  requiredForSchoolVerification: boolean;
  status: "present" | "missing";
  evidence: string[];
  missingEvidence: string[];
  applicableRecordCount: number;
  incompleteRecordCount: number;
};

const DOMAIN_DEFINITIONS = [
  {
    key: "account_identity",
    label: "Family account identity",
    required: true,
    applicableTo: "account",
    groups: [["account key", "account id", "account number", "family id", "procare account id"]],
  },
  {
    key: "child_identity",
    label: "Child identity",
    required: true,
    applicableTo: "child",
    groups: [["child id", "child key", "student id", "procare child id"]],
  },
  {
    key: "guardian_relationships",
    label: "Guardians and family relationships",
    required: true,
    applicableTo: "account",
    groups: [["procare relationship records", "procare relationship source records", "guardian id", "payer id", "parent id"]],
  },
  {
    key: "enrollment_classroom",
    label: "Enrollment and classroom assignments",
    required: true,
    applicableTo: "child",
    groups: [
      ["enrollment status", "child status", "student status"],
      ["classroom", "classroom name", "primary classroom", "room", "room name"],
    ],
  },
  {
    key: "opening_balances",
    label: "Current opening balances",
    required: true,
    applicableTo: "account",
    groups: [["balance", "account balance", "ledger balance", "amount due"]],
  },
  {
    key: "child_safety",
    label: "Child safety, medical, allergy, and custody information",
    required: true,
    applicableTo: "child",
    groups: [[
      "procare child info source records",
      "procare allergy records",
      "allergies",
      "medical notes",
      "custody notes",
      "authorized pickup",
    ]],
  },
  {
    key: "staff",
    label: "Staff and classroom assignments",
    required: true,
    applicableTo: "staff",
    groups: [
      ["employee id", "staff id", "teacher id"],
      ["employee name", "staff name", "teacher name"],
    ],
  },
  {
    key: "tuition",
    label: "Tuition contracts, cadence, and effective dates",
    required: true,
    applicableTo: "child",
    groups: [
      ["weekly rate", "tuition rate", "contract amount", "charge amount"],
      ["frequency", "cadence", "billing period", "charge frequency"],
      ["effective date", "effective week", "billing start period", "contract start date"],
    ],
  },
  {
    key: "attendance",
    label: "Attendance and sign-in/out history",
    required: false,
    applicableTo: "child",
    groups: [["attendance date", "check date", "check in", "sign in", "absence status"]],
  },
  {
    key: "subsidies",
    label: "Subsidy and agency responsibility",
    required: false,
    applicableTo: "account",
    groups: [["subsidy", "agency", "authorization number", "family copay"]],
  },
] as const;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

type NormalizedSourceRecord = Map<string, string>;

const ACCOUNT_ID_ALIASES = ["account key", "account id", "account number", "family id", "procare account id"];
const CHILD_ID_ALIASES = ["child id", "child key", "student id", "procare child id"];
const STAFF_ID_ALIASES = ["employee id", "staff id", "teacher id"];
const ACCOUNT_CONTEXT_ALIASES = [
  ...ACCOUNT_ID_ALIASES,
  "family name",
  "account name",
  "balance",
  "account balance",
  "guardian id",
  "payer id",
  "parent id",
  "procare relationship records",
];
const CHILD_CONTEXT_ALIASES = [
  ...CHILD_ID_ALIASES,
  "child first name",
  "child last name",
  "student first name",
  "student last name",
  "enrollment status",
  "classroom",
  "weekly rate",
  "tuition rate",
  "procare child info source records",
];
const STAFF_CONTEXT_ALIASES = [...STAFF_ID_ALIASES, "employee name", "staff name", "teacher name"];

function populated(record: NormalizedSourceRecord, aliases: readonly string[]) {
  return aliases.some((alias) => Boolean(record.get(normalize(alias))));
}

function firstValue(record: NormalizedSourceRecord, aliases: readonly string[]) {
  for (const alias of aliases) {
    const field = record.get(normalize(alias));
    if (field) return field;
  }
  return "";
}

function applicableGroups(records: NormalizedSourceRecord[], kind: "account" | "child" | "staff") {
  const contextAliases = kind === "account" ? ACCOUNT_CONTEXT_ALIASES : kind === "child" ? CHILD_CONTEXT_ALIASES : STAFF_CONTEXT_ALIASES;
  const identityAliases = kind === "account" ? ACCOUNT_ID_ALIASES : kind === "child" ? CHILD_ID_ALIASES : STAFF_ID_ALIASES;
  const groups = new Map<string, NormalizedSourceRecord[]>();
  records.forEach((record, index) => {
    if (!populated(record, contextAliases)) return;
    const identity = firstValue(record, identityAliases);
    const key = identity ? `${kind}:${identity.toLowerCase()}` : `${kind}:missing:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return [...groups.values()];
}

export function assessProcareFleetSourceCoverage(
  records: SourceRecord[],
  datasetCoverage?: { sourceInventory?: SourceInventoryItem[] } | null,
) {
  const normalizedRecords = records.map((record) => new Map(
    Object.entries(record)
      .filter(([, field]) => typeof field === "string" && field.trim())
      .map(([header, field]) => [normalize(header), field.trim()]),
  ));
  const populatedHeaders = new Set<string>();
  for (const record of normalizedRecords) {
    for (const header of record.keys()) populatedHeaders.add(header);
  }
  const domains: ProcareSourceDomain[] = DOMAIN_DEFINITIONS.map((definition) => {
    const groupMatches = definition.groups.map((group) => group.filter((alias) => populatedHeaders.has(normalize(alias))));
    const missingEvidence = groupMatches
      .map((matches, index) => matches.length ? "" : definition.groups[index].join(" or "))
      .filter(Boolean);
    const applicable = applicableGroups(normalizedRecords, definition.applicableTo);
    const incomplete = applicable.filter((recordsForEntity) => definition.groups.some((group) => (
      !recordsForEntity.some((record) => populated(record, group))
    )));
    if (incomplete.length) {
      missingEvidence.push(`${incomplete.length} of ${applicable.length} applicable ${definition.applicableTo} record(s) lack complete evidence`);
    }
    return {
      key: definition.key,
      label: definition.label,
      requiredForSchoolVerification: definition.required,
      status: missingEvidence.length ? "missing" : "present",
      evidence: groupMatches.flat(),
      missingEvidence,
      applicableRecordCount: applicable.length,
      incompleteRecordCount: incomplete.length,
    };
  });
  const inventory = datasetCoverage?.sourceInventory ?? [];
  const ignoredSources = inventory.filter((item) => item.reportKind === "ignored");
  const evidenceOnlySources = inventory.filter((item) => item.reportKind === "evidence_only");
  return {
    domains,
    requiredDomainsComplete: domains.every((domain) => !domain.requiredForSchoolVerification || domain.status === "present"),
    ignoredSources: ignoredSources.map((item) => ({ sourceName: item.sourceName ?? "unnamed source", note: item.note ?? "unrecognized source" })),
    evidenceOnlySources: evidenceOnlySources.map((item) => ({ sourceName: item.sourceName ?? "unnamed source", note: item.note ?? "destination mapping required" })),
  };
}

export type ProcareFleetVerificationInput = {
  batchId: string;
  centerId: string;
  school?: { name: string; crmLocationId?: string | null; locationId?: string | null; city?: string | null; state?: string | null };
  sourceFilename?: string | null;
  importedAt?: string | null;
  sourceSha256?: string | null;
  batchStatus: string;
  sourceInventoryConfirmed: boolean;
  sourceCoverage: ReturnType<typeof assessProcareFleetSourceCoverage>;
  reconciliation: {
    decision: string;
    measures: ReconciliationMeasure[];
    importedRows: number;
    errorRows: number;
    disposedRows: number;
    unresolvedRows: number;
  };
  exceptionsWithoutEvidence: number;
};

export function buildProcareFleetVerificationReport(input: ProcareFleetVerificationInput) {
  const blockers: string[] = [];
  if (!input.sourceSha256) blockers.push("The exact source SHA-256 is missing.");
  if (!input.sourceInventoryConfirmed) blockers.push("The source inventory was not confirmed by the importer.");
  if (input.batchStatus !== "completed") blockers.push(`The import batch status is ${input.batchStatus}, not completed.`);
  for (const domain of input.sourceCoverage.domains) {
    if (domain.requiredForSchoolVerification && domain.status !== "present") {
      blockers.push(`${domain.label} source evidence is missing: ${domain.missingEvidence.join("; ")}.`);
    }
  }
  if (input.sourceCoverage.ignoredSources.length) {
    blockers.push(`${input.sourceCoverage.ignoredSources.length} source file(s) were ignored and require replacement or an approved exclusion.`);
  }
  if (input.sourceCoverage.evidenceOnlySources.length) {
    blockers.push(`${input.sourceCoverage.evidenceOnlySources.length} source file(s) still require a safe destination mapping or approved exclusion.`);
  }
  if (input.reconciliation.decision !== "reconciled") blockers.push("The automated source-to-target reconciliation is not fully matched.");
  if (input.reconciliation.unresolvedRows) blockers.push(`${input.reconciliation.unresolvedRows} import row(s) remain unresolved.`);
  if (input.reconciliation.disposedRows) blockers.push(`${input.reconciliation.disposedRows} import row(s) were excluded and require signed exception review.`);
  if (input.exceptionsWithoutEvidence) blockers.push(`${input.exceptionsWithoutEvidence} excluded row(s) lack complete reason, category, evidence reference, reviewer, or timestamp evidence.`);

  return {
    reportType: "bee_suite_procare_fleet_verification",
    generatedAt: new Date().toISOString(),
    batchId: input.batchId,
    centerId: input.centerId,
    school: input.school ?? null,
    sourceFilename: input.sourceFilename ?? null,
    importedAt: input.importedAt ?? null,
    sourceSha256: input.sourceSha256 ?? null,
    status: blockers.length ? "NOT_VERIFIED" : "READY_FOR_DIRECTOR_REVIEW",
    blockers,
    sourceCoverage: input.sourceCoverage,
    reconciliation: input.reconciliation,
    manualApprovalGates: [
      "Director source and family spot-check approval",
      "Corporate and accounting approval",
      "Technical production and rollback approval",
      "Written ProCare freeze and source-of-truth cutover approval",
      "Separate parent access, invitations, PIN, attendance, billing, and payment activation approvals",
    ],
    enforcement: {
      cutoverAllowed: false,
      reason: "This report can advance a batch only to director review. Written school-specific approvals remain mandatory.",
    },
  } as const;
}
