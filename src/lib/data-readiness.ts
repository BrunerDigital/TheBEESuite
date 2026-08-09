export const DATA_READINESS_STATUSES = [
  "BLOCKED",
  "CONFIRM",
  "READY",
  "EXCLUDED",
  "IMPORTED",
  "VERIFIED",
  "FAILED",
] as const;

export type DataReadinessStatus = (typeof DATA_READINESS_STATUSES)[number];
export type DataReadinessRisk = "critical" | "high" | "medium" | "low";
export type DataReadinessDecision =
  | "confirm"
  | "edit"
  | "match_existing"
  | "create_new"
  | "exclude"
  | "request_information"
  | "defer";

export type DataReadinessTask = {
  id: string;
  resource: "ProcareImportRow" | "ProcareImportBatch";
  resourceId: string;
  batchId: string;
  centerId: string;
  centerName: string;
  entity: string;
  category: string;
  status: DataReadinessStatus;
  risk: DataReadinessRisk;
  priority: number;
  dueDate: string | null;
  reason: string;
  currentValue: string;
  proposedValue: string;
  difference: string;
  sourceFilename: string;
  sourceRow: number | null;
  sourceIds: string[];
  parsingConfidence: "high" | "medium" | "low";
  relatedRecords: string[];
  downstreamImpact: string;
  bulkEligible: boolean;
  decision: DataReadinessDecision | null;
  decisionNote: string;
  updatedAt: string;
};

export type DataReadinessBatch = {
  id: string;
  centerId: string;
  centerName: string;
  filename: string;
  status: string;
  sourceSha256: string;
  reviewFingerprint: string;
  rowCount: number;
  importedRows: number;
  unresolvedRows: number;
  disposedRows: number;
  createdAt: string;
  verified: boolean;
};

export type DataReadinessSummary = Record<DataReadinessStatus, number> & {
  actionable: number;
  total: number;
  completionPercent: number;
  sourceRows: number;
  lastUpdated: string | null;
};

export type DataReadinessWorkspaceData = {
  tasks: DataReadinessTask[];
  batches: DataReadinessBatch[];
  summary: DataReadinessSummary;
  generatedAt: string;
  truncated: boolean;
};

export const GUARDED_PROCARE_GAPS = [
  "Immunization details",
  "Tuition contracts and recurring charge assignments",
  "Fees, credits, discounts, and subsidy or agency responsibility",
  "Employee certifications",
  "Detailed or high-volume ledger history",
] as const;

export const CONFIRMED_PROCARE_AREAS = [
  "Location, family, guardian, child, classroom, and staff identifiers",
  "Contact details, relationships, schedules, enrollment, and classroom placement",
  "Emergency contacts, authorized pickups, allergies, medical notes, and permissions",
  "Balances, attendance, check-in/out evidence, raw fields, and source provenance",
] as const;

const restrictedBulkCategories = new Set([
  "Safety and custody",
  "Access and identity",
  "Billing and balances",
  "Parent communication readiness",
]);

const categoryRules: Array<{
  category: string;
  priority: number;
  risk: DataReadinessRisk;
  pattern: RegExp;
  impact: string;
}> = [
  {
    category: "Safety and custody",
    priority: 1,
    risk: "critical",
    pattern: /custod|pickup|emergency|allerg|medical|medication|physician|permission|immun|health/i,
    impact: "Incorrect resolution could affect child safety, custody, medical response, or permissions.",
  },
  {
    category: "Access and identity",
    priority: 2,
    risk: "critical",
    pattern: /identity|guardian|parent|payer|relationship|family match|duplicate family|login|access|role|location/i,
    impact: "Incorrect resolution could expose records or connect the wrong person, family, role, or location.",
  },
  {
    category: "Billing and balances",
    priority: 3,
    risk: "high",
    pattern: /bill|balance|invoice|ledger|tuition|charge|credit|discount|subsid|agency|payment/i,
    impact: "Resolution affects reviewed financial evidence. It does not create a charge, invoice, payment, or ledger entry.",
  },
  {
    category: "Enrollment and classroom placement",
    priority: 4,
    risk: "medium",
    pattern: /child|enroll|classroom|room|schedule|start date|end date|capacity|ratio|age group/i,
    impact: "Resolution may affect later enrollment or classroom placement during a separately approved import.",
  },
  {
    category: "Staff readiness",
    priority: 5,
    risk: "high",
    pattern: /staff|employee|teacher|background|work area|certification/i,
    impact: "Resolution may affect staff matching or assignment, but never changes role or location access by itself.",
  },
  {
    category: "Parent communication readiness",
    priority: 6,
    risk: "high",
    pattern: /email|phone|communication|invitation|notification/i,
    impact: "Resolution records readiness only. It does not create an account, invite a parent, or send a message.",
  },
  {
    category: "Historical and informational data",
    priority: 7,
    risk: "low",
    pattern: /.*/i,
    impact: "Resolution preserves the reviewed source evidence for a later guarded import or audit export.",
  },
];

const stableIdPattern = /(^|\s)(account|family|child|person|guardian|parent|payer|employee|staff|classroom|room|location|center)\s*(id|key|number|no)($|\s)/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function normalizedRawData(value: unknown) {
  return Object.entries(asRecord(value)).map(([key, rawValue]) => ({
    key,
    normalizedKey: key.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(),
    value: clean(rawValue),
  }));
}

function firstRawValue(entries: ReturnType<typeof normalizedRawData>, aliases: readonly string[]) {
  const aliasSet = new Set(aliases);
  return entries.find((entry) => aliasSet.has(entry.normalizedKey) && entry.value)?.value ?? "";
}

function inferEntity(entries: ReturnType<typeof normalizedRawData>) {
  if (firstRawValue(entries, ["employee id", "staff id", "employee name", "staff name"])) return "Staff";
  if (firstRawValue(entries, ["child id", "child key", "student id", "child name", "student name"])) return "Child";
  if (firstRawValue(entries, ["classroom id", "room id", "classroom name", "room name"])) return "Classroom";
  if (firstRawValue(entries, ["guardian id", "parent id", "payer id", "guardian name", "parent name"])) return "Guardian";
  if (firstRawValue(entries, ["account id", "account key", "family id", "family name", "account name"])) return "Family";
  return "Imported record";
}

function proposedLabel(entries: ReturnType<typeof normalizedRawData>, entity: string) {
  const names = [
    firstRawValue(entries, ["family name", "account name"]),
    firstRawValue(entries, ["child name", "student name", "child full name"]),
    firstRawValue(entries, ["guardian name", "parent name", "payer name"]),
    firstRawValue(entries, ["employee name", "staff name"]),
    firstRawValue(entries, ["classroom name", "room name"]),
  ].filter(Boolean);
  return names[0] || `${entity} value retained in the reviewed source row`;
}

function decisionStatus(decision: DataReadinessDecision | null): DataReadinessStatus | null {
  if (!decision) return null;
  if (decision === "exclude") return "EXCLUDED";
  if (decision === "request_information" || decision === "defer") return "CONFIRM";
  return "READY";
}

export function statusForImportRow(status: string, message: string) : DataReadinessStatus {
  const normalized = status.toLowerCase();
  if (normalized === "disposed") return "EXCLUDED";
  if (normalized === "imported") return "IMPORTED";
  if (normalized === "error" || normalized === "failed") return "FAILED";
  if (normalized === "ready") return "READY";
  return categoryRules[0].pattern.test(message) || categoryRules[1].pattern.test(message) ? "BLOCKED" : "CONFIRM";
}

export function buildImportRowReadinessTask(input: {
  id: string;
  batchId: string;
  centerId: string;
  centerName: string;
  filename: string;
  rowNumber: number;
  status: string;
  message?: string | null;
  rawData: unknown;
  createdFamilyId?: string | null;
  createdChildId?: string | null;
  createdAt: Date | string;
  decision?: DataReadinessDecision | null;
  decisionNote?: string | null;
  decisionProposedValue?: string | null;
  decisionAt?: Date | string | null;
}) : DataReadinessTask {
  const entries = normalizedRawData(input.rawData);
  const entity = inferEntity(entries);
  const message = clean(input.message, 500) || "This reviewed ProCare row needs a human decision before it can be treated as ready.";
  const categoryRule = categoryRules.find((rule) => rule.pattern.test(`${message} ${entries.map((entry) => entry.normalizedKey).join(" ")}`)) ?? categoryRules.at(-1)!;
  const sourceIds = entries
    .filter((entry) => stableIdPattern.test(entry.normalizedKey) && entry.value)
    .slice(0, 8)
    .map((entry) => `${entry.key}: ${entry.value}`);
  const relatedRecords = [
    input.createdFamilyId ? `BEE family ${input.createdFamilyId}` : "",
    input.createdChildId ? `BEE child ${input.createdChildId}` : "",
  ].filter(Boolean);
  const baseStatus = statusForImportRow(input.status, message);
  const auditedStatus = decisionStatus(input.decision ?? null);
  const status = auditedStatus ?? baseStatus;
  const stableIds = sourceIds.length > 0;
  const bulkEligible = status === "CONFIRM"
    && categoryRule.risk === "low"
    && stableIds
    && !restrictedBulkCategories.has(categoryRule.category);
  const currentValue = relatedRecords.length
    ? `Matched ${relatedRecords.join(" and ")}`
    : "No confirmed BEE record decision";
  const proposedValue = clean(input.decisionProposedValue, 500) || proposedLabel(entries, entity);
  const parsingConfidence = stableIds ? "high" : proposedValue.includes("retained in") ? "low" : "medium";
  const updatedAt = new Date(input.decisionAt ?? input.createdAt).toISOString();

  return {
    id: `row:${input.id}`,
    resource: "ProcareImportRow",
    resourceId: input.id,
    batchId: input.batchId,
    centerId: input.centerId,
    centerName: input.centerName,
    entity,
    category: categoryRule.category,
    status,
    risk: categoryRule.risk,
    priority: categoryRule.priority,
    dueDate: status === "BLOCKED" || status === "FAILED" ? updatedAt.slice(0, 10) : null,
    reason: message,
    currentValue,
    proposedValue,
    difference: currentValue === proposedValue ? "No visible difference" : "The reviewed ProCare value is not yet a confirmed BEE value.",
    sourceFilename: input.filename,
    sourceRow: input.rowNumber,
    sourceIds,
    parsingConfidence,
    relatedRecords,
    downstreamImpact: categoryRule.impact,
    bulkEligible,
    decision: input.decision ?? null,
    decisionNote: clean(input.decisionNote, 1000),
    updatedAt,
  };
}

export function buildImportBatchReadinessTask(input: {
  id: string;
  centerId: string;
  centerName: string;
  filename: string;
  status: string;
  createdAt: Date | string;
  sourceSha256?: string;
  reviewFingerprint?: string;
  rowCount: number;
  importedRows: number;
  unresolvedRows: number;
  verified: boolean;
  decision?: DataReadinessDecision | null;
  decisionNote?: string | null;
  decisionProposedValue?: string | null;
  decisionAt?: Date | string | null;
}) : DataReadinessTask {
  const baseStatus: DataReadinessStatus = input.verified
    ? "VERIFIED"
    : /error|failed/i.test(input.status)
      ? "FAILED"
      : input.unresolvedRows
        ? "CONFIRM"
        : input.importedRows
          ? "IMPORTED"
          : "CONFIRM";
  const status = decisionStatus(input.decision ?? null) ?? baseStatus;
  const updatedAt = new Date(input.decisionAt ?? input.createdAt).toISOString();
  return {
    id: `batch:${input.id}`,
    resource: "ProcareImportBatch",
    resourceId: input.id,
    batchId: input.id,
    centerId: input.centerId,
    centerName: input.centerName,
    entity: "Import batch",
    category: "Historical and informational data",
    status,
    risk: input.unresolvedRows || status === "FAILED" ? "high" : "medium",
    priority: input.unresolvedRows || status === "FAILED" ? 3 : 7,
    dueDate: input.unresolvedRows || status === "FAILED" ? updatedAt.slice(0, 10) : null,
    reason: input.verified
      ? "Post-import reconciliation evidence was exported for this batch."
      : input.unresolvedRows
        ? `${input.unresolvedRows.toLocaleString()} reviewed row(s) remain unresolved.`
        : "The batch is retained for post-import verification and audit evidence.",
    currentValue: `${input.importedRows.toLocaleString()} imported · ${input.unresolvedRows.toLocaleString()} unresolved`,
    proposedValue: clean(input.decisionProposedValue, 500) || (input.verified ? "Post-import evidence recorded" : "Complete sample verification and reconciliation"),
    difference: input.verified ? "Reconciliation evidence exists" : "Post-import verification is not yet evidenced in this queue",
    sourceFilename: input.filename,
    sourceRow: null,
    sourceIds: [
      input.sourceSha256 ? `Source SHA-256: ${input.sourceSha256}` : "",
      input.reviewFingerprint ? `Review fingerprint: ${input.reviewFingerprint}` : "",
    ].filter(Boolean),
    parsingConfidence: input.sourceSha256 && input.reviewFingerprint ? "high" : "medium",
    relatedRecords: [`${input.rowCount.toLocaleString()} retained source row(s)`],
    downstreamImpact: "Batch decisions document readiness only. Parent invitations, kiosk activation, billing activation, and launch approval remain separate gates.",
    bulkEligible: false,
    decision: input.decision ?? null,
    decisionNote: clean(input.decisionNote, 1000),
    updatedAt,
  };
}

export function canBulkConfirmReadinessTask(task: DataReadinessTask) {
  return task.bulkEligible
    && task.status === "CONFIRM"
    && task.risk === "low"
    && task.sourceIds.length > 0
    && !restrictedBulkCategories.has(task.category);
}

export function summarizeDataReadiness(tasks: DataReadinessTask[], sourceRows = 0): DataReadinessSummary {
  const summary = Object.fromEntries(DATA_READINESS_STATUSES.map((status) => [status, 0])) as Record<DataReadinessStatus, number>;
  for (const task of tasks) summary[task.status] += 1;
  const actionable = summary.BLOCKED + summary.CONFIRM + summary.FAILED;
  const completed = summary.READY + summary.EXCLUDED + summary.IMPORTED + summary.VERIFIED;
  const total = tasks.length;
  return {
    ...summary,
    actionable,
    total,
    completionPercent: total ? Math.round((completed / total) * 100) : 100,
    sourceRows,
    lastUpdated: tasks.map((task) => task.updatedAt).sort().at(-1) ?? null,
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function dataReadinessCsv(tasks: DataReadinessTask[]) {
  const headers = [
    "Status", "Risk", "Priority", "Category", "Entity", "Location", "Reason", "Current BEE value",
    "ProCare value", "Difference", "Source filename", "Source row", "Source IDs", "Confidence",
    "Downstream impact", "Decision", "Decision note", "Updated at",
  ];
  const rows = tasks.map((task) => [
    task.status, task.risk, task.priority, task.category, task.entity, task.centerName, task.reason,
    task.currentValue, task.proposedValue, task.difference, task.sourceFilename, task.sourceRow ?? "",
    task.sourceIds.join(" | "), task.parsingConfidence, task.downstreamImpact, task.decision ?? "",
    task.decisionNote, task.updatedAt,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
