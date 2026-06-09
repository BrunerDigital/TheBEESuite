import { readCenterLicensingConfiguration } from "@/lib/licensing-config";

export type RequirementScope = "family" | "child" | "staff";
export type ChecklistStatus = "complete" | "submitted" | "requested" | "rejected" | "expired" | "missing";

export type RequiredChecklistDefinition = {
  id: string;
  scope: RequirementScope;
  label: string;
  type: string;
  aliases?: string[];
  restricted?: boolean;
};

export type RequiredChecklistItem = {
  key: string;
  scope: RequirementScope;
  subjectId: string;
  subjectName: string;
  centerLabel: string | null;
  requirementId: string;
  requirementLabel: string;
  requirementType: string;
  status: ChecklistStatus;
  recordId: string | null;
  expiresAt: string | null;
};

export type RequiredChecklistSummary = {
  total: number;
  complete: number;
  submitted: number;
  requested: number;
  rejected: number;
  expired: number;
  missing: number;
  actionNeeded: number;
};

export type RequiredChecklistSubjectGroup = {
  key: string;
  scope: RequirementScope;
  subjectId: string;
  subjectName: string;
  centerLabel: string | null;
  items: RequiredChecklistItem[];
  summary: RequiredChecklistSummary;
  actionNeeded: number;
  completePercent: number;
};

export function requiresChecklistAction(status: ChecklistStatus) {
  return status === "missing" || status === "expired" || status === "rejected";
}

type ChecklistDocument = {
  id: string;
  name: string;
  type: string;
  status: string;
  expiresAt?: Date | string | null;
};

type ChecklistCertification = {
  id: string;
  name: string;
  status: string;
  expiresAt?: Date | string | null;
};

type FamilyInput = {
  id: string;
  name: string;
  center?: { name: string; crmLocationId?: string | null } | null;
  documents: ChecklistDocument[];
  children: Array<{
    id: string;
    fullName: string;
    documents: ChecklistDocument[];
  }>;
};

type StaffInput = {
  id: string;
  title?: string | null;
  user: { name: string };
  center?: { name: string; crmLocationId?: string | null; customFields?: unknown; state?: string | null; licensedCapacity?: number | null } | null;
  certifications: ChecklistCertification[];
};

const familyRequirements: RequiredChecklistDefinition[] = [
  { id: "family-emergency-card", scope: "family", label: "Emergency Card", type: "emergency_card" },
  { id: "family-guardian-pickup", scope: "family", label: "Authorized Pickup Form", type: "authorized_pickup" },
  { id: "family-handbook", scope: "family", label: "Parent Handbook Acknowledgment", type: "handbook_acknowledgment" },
  { id: "family-tuition-policy", scope: "family", label: "Tuition Policy Acknowledgment", type: "tuition_policy" },
];

const childRequirements: RequiredChecklistDefinition[] = [
  { id: "child-immunization", scope: "child", label: "Immunization Record", type: "immunization", aliases: ["shot record", "vaccination"] },
  { id: "child-health-assessment", scope: "child", label: "Health Assessment", type: "health_assessment", aliases: ["physical"] },
  { id: "child-photo-release", scope: "child", label: "Photo/Video Release", type: "photo_video_release" },
  { id: "child-enrollment-packet", scope: "child", label: "Enrollment Packet", type: "enrollment_packet" },
];

const staffRequirements: RequiredChecklistDefinition[] = [
  { id: "staff-background-check", scope: "staff", label: "Background Check", type: "background_check", restricted: true },
  { id: "staff-cpr-first-aid", scope: "staff", label: "CPR / First Aid", type: "cpr_first_aid", aliases: ["cpr", "first aid"] },
  { id: "staff-health-statement", scope: "staff", label: "Staff Health Statement", type: "staff_health_statement" },
  { id: "staff-mandated-reporter", scope: "staff", label: "Mandated Reporter Training", type: "mandated_reporter" },
];

export const requiredChecklistDefinitions = [
  ...familyRequirements,
  ...childRequirements,
  ...staffRequirements,
] as const satisfies readonly RequiredChecklistDefinition[];

function requirementSlug(value: string) {
  return normalize(value)
    .replace(/^staff/, "")
    .slice(0, 64) || "requirement";
}

function requirementType(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "staff_requirement";
}

export function staffRequirementsForCenter(center?: StaffInput["center"]): RequiredChecklistDefinition[] {
  const config = readCenterLicensingConfiguration(center?.customFields, {
    centerState: center?.state,
    licensedCapacity: center?.licensedCapacity,
  });
  const configuredLabels = config.staffCredentialRules.items;
  if (!configuredLabels.length) return staffRequirements;

  const usedIds = new Set<string>();
  return configuredLabels.map((label, index) => {
    const baseId = `staff-${requirementSlug(label)}`;
    const id = usedIds.has(baseId) ? `${baseId}-${index + 1}` : baseId;
    usedIds.add(id);
    const defaultMatch = staffRequirements.find((requirement) => matchesRequiredChecklistDefinition(requirement, { name: label, type: requirementType(label) }));
    return {
      id,
      scope: "staff",
      label,
      type: defaultMatch?.type ?? requirementType(label),
      aliases: defaultMatch?.aliases,
      restricted: defaultMatch?.restricted ?? /background|fingerprint|screen/i.test(label),
    } satisfies RequiredChecklistDefinition;
  });
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function dateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpired(value: Date | string | null | undefined, now: Date) {
  const expiresAt = dateValue(value);
  if (!expiresAt) return false;
  return expiresAt.getTime() < now.getTime();
}

function centerLabel(center?: { name: string; crmLocationId?: string | null } | null) {
  return center?.crmLocationId || center?.name || null;
}

export function findChecklistDefinition(
  scope: RequirementScope,
  requirementId: string,
  options: { center?: StaffInput["center"] } = {},
) {
  const definitions = scope === "staff"
    ? staffRequirementsForCenter(options.center)
    : requiredChecklistDefinitions.filter((requirement) => requirement.scope === scope);
  return definitions.find((requirement) => requirement.scope === scope && requirement.id === requirementId) ?? null;
}

export function matchesRequiredChecklistDefinition(
  requirement: Pick<RequiredChecklistDefinition, "label" | "type" | "aliases">,
  record: { name: string; type?: string | null },
) {
  const candidateKeys = [record.name, record.type ?? ""].map(normalize);
  const requirementKeys = [requirement.label, requirement.type, ...(requirement.aliases ?? [])].map(normalize);
  return candidateKeys.some((candidate) => candidate && requirementKeys.some((key) => key && candidate.includes(key)));
}

function documentChecklistStatus(document: ChecklistDocument, now: Date): ChecklistStatus {
  const status = normalize(document.status);
  if (isExpired(document.expiresAt, now)) return "expired";
  if (status === "approved" || status === "complete" || status === "completed") return "complete";
  if (status === "submitted") return "submitted";
  if (status === "requested" || status === "draft") return "requested";
  if (status === "rejected") return "rejected";
  return "missing";
}

function certificationChecklistStatus(certification: ChecklistCertification, now: Date): ChecklistStatus {
  const status = normalize(certification.status);
  if (status === "expired" || isExpired(certification.expiresAt, now)) return "expired";
  if (["approved", "active", "complete", "completed", "current"].includes(status)) return "complete";
  if (["submitted", "pending", "inreview"].includes(status)) return "submitted";
  if (["requested", "draft", "missing"].includes(status)) return "requested";
  if (status === "rejected") return "rejected";
  return "missing";
}

const statusRank: Record<ChecklistStatus, number> = {
  complete: 6,
  submitted: 5,
  requested: 4,
  rejected: 3,
  expired: 2,
  missing: 1,
};

function bestDocumentMatch(requirement: RequiredChecklistDefinition, documents: ChecklistDocument[], now: Date) {
  return documents
    .filter((document) => matchesRequiredChecklistDefinition(requirement, document))
    .map((document) => ({ record: document, status: documentChecklistStatus(document, now) }))
    .sort((left, right) => statusRank[right.status] - statusRank[left.status])[0] ?? null;
}

function bestCertificationMatch(requirement: RequiredChecklistDefinition, certifications: ChecklistCertification[], now: Date) {
  return certifications
    .filter((certification) => matchesRequiredChecklistDefinition(requirement, certification))
    .map((certification) => ({ record: certification, status: certificationChecklistStatus(certification, now) }))
    .sort((left, right) => statusRank[right.status] - statusRank[left.status])[0] ?? null;
}

function rowFromDocumentMatch(input: {
  scope: "family" | "child";
  subjectId: string;
  subjectName: string;
  centerLabel: string | null;
  requirement: RequiredChecklistDefinition;
  match: ReturnType<typeof bestDocumentMatch>;
}): RequiredChecklistItem {
  return {
    key: `${input.scope}:${input.subjectId}:${input.requirement.id}`,
    scope: input.scope,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    centerLabel: input.centerLabel,
    requirementId: input.requirement.id,
    requirementLabel: input.requirement.label,
    requirementType: input.requirement.type,
    status: input.match?.status ?? "missing",
    recordId: input.match?.record.id ?? null,
    expiresAt: dateValue(input.match?.record.expiresAt)?.toISOString() ?? null,
  };
}

export function buildRequiredDocumentChecklist(input: {
  families: FamilyInput[];
  staff: StaffInput[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const rows: RequiredChecklistItem[] = [];

  for (const family of input.families) {
    for (const requirement of familyRequirements) {
      rows.push(rowFromDocumentMatch({
        scope: "family",
        subjectId: family.id,
        subjectName: family.name,
        centerLabel: centerLabel(family.center),
        requirement,
        match: bestDocumentMatch(requirement, family.documents, now),
      }));
    }

    for (const child of family.children) {
      for (const requirement of childRequirements) {
        rows.push(rowFromDocumentMatch({
          scope: "child",
          subjectId: child.id,
          subjectName: child.fullName,
          centerLabel: centerLabel(family.center),
          requirement,
          match: bestDocumentMatch(requirement, child.documents, now),
        }));
      }
    }
  }

  for (const staffMember of input.staff) {
    for (const requirement of staffRequirementsForCenter(staffMember.center)) {
      const match = bestCertificationMatch(requirement, staffMember.certifications, now);
      rows.push({
        key: `staff:${staffMember.id}:${requirement.id}`,
        scope: "staff",
        subjectId: staffMember.id,
        subjectName: staffMember.user.name,
        centerLabel: centerLabel(staffMember.center),
        requirementId: requirement.id,
        requirementLabel: requirement.label,
        requirementType: requirement.type,
        status: match?.status ?? "missing",
        recordId: match?.record.id ?? null,
        expiresAt: dateValue(match?.record.expiresAt)?.toISOString() ?? null,
      });
    }
  }

  return rows.sort((left, right) => {
    const leftAction = left.status === "complete" ? 1 : 0;
    const rightAction = right.status === "complete" ? 1 : 0;
    if (leftAction !== rightAction) return leftAction - rightAction;
    return `${left.scope}:${left.centerLabel}:${left.subjectName}:${left.requirementLabel}`.localeCompare(
      `${right.scope}:${right.centerLabel}:${right.subjectName}:${right.requirementLabel}`,
    );
  });
}

export function summarizeRequiredDocumentChecklist(items: RequiredChecklistItem[]): RequiredChecklistSummary {
  const summary: RequiredChecklistSummary = {
    total: items.length,
    complete: 0,
    submitted: 0,
    requested: 0,
    rejected: 0,
    expired: 0,
    missing: 0,
    actionNeeded: 0,
  };
  for (const item of items) {
    summary[item.status] += 1;
    if (requiresChecklistAction(item.status)) {
      summary.actionNeeded += 1;
    }
  }
  return summary;
}

const subjectGroupScopeOrder: Record<RequirementScope, number> = {
  family: 0,
  child: 1,
  staff: 2,
};

export function groupRequiredChecklistBySubject(items: RequiredChecklistItem[]): RequiredChecklistSubjectGroup[] {
  const groupedItems = new Map<string, RequiredChecklistItem[]>();

  for (const item of items) {
    const key = `${item.scope}:${item.subjectId}`;
    const currentItems = groupedItems.get(key);
    if (currentItems) {
      currentItems.push(item);
    } else {
      groupedItems.set(key, [item]);
    }
  }

  return Array.from(groupedItems.entries())
    .map(([key, subjectItems]) => {
      const firstItem = subjectItems[0];
      const summary = summarizeRequiredDocumentChecklist(subjectItems);
      return {
        key,
        scope: firstItem.scope,
        subjectId: firstItem.subjectId,
        subjectName: firstItem.subjectName,
        centerLabel: firstItem.centerLabel,
        items: subjectItems,
        summary,
        actionNeeded: summary.actionNeeded,
        completePercent: summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0,
      };
    })
    .sort((left, right) => {
      if (left.actionNeeded !== right.actionNeeded) {
        return right.actionNeeded - left.actionNeeded;
      }

      if (subjectGroupScopeOrder[left.scope] !== subjectGroupScopeOrder[right.scope]) {
        return subjectGroupScopeOrder[left.scope] - subjectGroupScopeOrder[right.scope];
      }

      return left.subjectName.localeCompare(right.subjectName);
    });
}
