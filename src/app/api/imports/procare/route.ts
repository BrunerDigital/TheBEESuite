import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  isActiveProcareStaffStatus,
  isActiveProcareEnrollmentStatus,
  analyzeProcareHeaders,
  applyProcareFieldMapping,
  buildProcareCorrelationReview,
  PROCARE_FIELD_OPTIONS,
  normalizeProcareEnrollmentStatus,
  procareAgeGroup,
  procareChildFullName,
  procareChildPreferredName,
  procareClassroomName,
  procareFamilyName,
  procareSourceFields,
  procareStaffName,
  procareValue as value,
  type ProcareFieldMapping,
} from "@/lib/procare-import-fields";
import { prisma } from "@/lib/prisma";
import { buildCenterAliasMap, resolveImportCenter, type CenterAliasMap } from "@/lib/import-center-mapping";
import {
  buildProcareDuplicateMatch,
  scoreProcareDuplicateCandidate,
  type ProcareDuplicateMatch,
} from "@/lib/procare-duplicate-matching";
import { hasSupabaseAdminAuthConfig, upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";
import { generateTeacherLoginCredentials } from "@/lib/teacher-login";
import {
  PROCARE_DUPLICATE_REVIEW_ROW_LIMIT,
  procareImportReviewFingerprint,
  procareSourceSha256,
} from "@/lib/procare-import-review";
import { buildProcareReconciliationReport, procareRetentionReviewDue } from "@/lib/procare-migration-controls";
import {
  buildProcareMultiReportRowsFromFiles,
  decodeProcareTabularBuffer,
  expandProcareSourceEntries,
} from "@/lib/procare-multi-report-import";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDelimited(text: string, delimiter: "," | "\t" | ";" | "|") {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      current = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseImportRows(text: string) {
  const candidates = [",", "\t", ";", "|"] as const;
  const parsed = candidates.map((delimiter) => {
    const rows = parseDelimited(text, delimiter);
    const score = rows.slice(0, 20).reduce((sum, row) => sum + row.length, 0);
    return { delimiter, rows, score };
  });
  parsed.sort((a, b) => b.score - a.score);
  return parsed[0]?.rows ?? [];
}

function parseCurrencyCents(input: string) {
  const source = input.trim();
  if (!source) return { present: false, valid: true, cents: 0 };
  const accountingNegative = source.startsWith("(") && source.endsWith(")");
  const normalized = (accountingNegative ? source.slice(1, -1) : source)
    .replace(/[$,\s]/g, "");
  if ((accountingNegative && /^[+-]/.test(normalized)) || !/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(normalized)) {
    return { present: true, valid: false, cents: 0 };
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return { present: true, valid: false, cents: 0 };
  return { present: true, valid: true, cents: Math.round(amount * 100) * (accountingNegative ? -1 : 1) };
}

function boolValue(input: string) {
  return /^(yes|y|true|1|allowed|permission|granted|checked|on)$/i.test(input.trim());
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function mergeCustomFields(
  existing: Prisma.JsonValue | null | undefined,
  imported: Record<string, unknown>,
) {
  return { ...jsonObject(existing), ...imported } as Prisma.InputJsonValue;
}

function parseDate(input: string) {
  const date = input ? new Date(input) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function parseDateAndTime(dateInput: string, timeInput: string) {
  const direct = parseDate(timeInput);
  if (direct) return direct;

  const base = parseDate(dateInput);
  if (!base || !timeInput) return null;

  const match = timeInput.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  const combined = new Date(base);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function metadataFromRow(rawData: Record<string, string>, extra: Record<string, unknown> = {}) {
  const userDefined = Object.fromEntries(
    Object.entries(rawData).filter(([key, value]) => value && /user\s*defined|udf|tracking|custom|school\s*field/i.test(key)),
  );
  return {
    source: "procare_import",
    rawData,
    sourceFields: procareSourceFields(rawData),
    userDefined,
    ...extra,
  };
}

function externalValue(rawData: Record<string, string>, aliases: string[]) {
  const found = value(rawData, aliases);
  return found || null;
}

function hasImportField(rawData: Record<string, string>, aliases: string[]) {
  const keys = new Set(Object.keys(rawData).map((key) => key.toLowerCase().replace(/^\ufeff/, "").replace(/[_./\\-]+/g, " ").replace(/\s+/g, " ").trim()));
  return aliases.some((alias) => keys.has(alias.toLowerCase().replace(/[_./\\-]+/g, " ").replace(/\s+/g, " ").trim()));
}

function embeddedImportRecord(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).map(([key, field]) => [
      key.toLowerCase().replace(/^\ufeff/, "").replace(/[_./\\-]+/g, " ").replace(/\s+/g, " ").trim(),
      typeof field === "string" ? field.trim() : "",
    ]),
  );
}

type ProcareRelationshipRecord = {
  externalId?: string;
  name?: string;
  relation?: string;
  email?: string;
  phone?: string;
  livesWith?: boolean;
  emergency?: boolean;
  authorizedPickup?: boolean;
  guardian?: boolean;
};

type ProcareGuardianImport = {
  name: string;
  guardianEmail: string;
  guardianPhone: string;
  externalId: string | null;
  relation: string;
  billingContact: boolean;
  employer: string;
};

function procareRelationshipRecords(rawData: Record<string, string>): ProcareRelationshipRecord[] {
  try {
    const parsed = JSON.parse(value(rawData, ["procare relationship records"]) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ProcareRelationshipRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      : [];
  } catch {
    return [];
  }
}

function procareGuardianImports(rawData: Record<string, string>, childPersonExternalId = ""): ProcareGuardianImport[] {
  const guardianImports: ProcareGuardianImport[] = [
    {
      name: value(rawData, ["guardian name", "parent/guardian", "parent name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent", "mother", "father"]),
      guardianEmail: value(rawData, ["email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email"]).toLowerCase(),
      guardianPhone: value(rawData, ["phone", "guardian phone", "parent phone", "primary phone", "payer phone", "payer 1 phone", "primary payer phone"]),
      externalId: externalValue(rawData, ["payer id", "primary payer id", "guardian id", "parent id", "payer 1 id", "primary parent id"]),
      relation: value(rawData, ["guardian relation", "parent relation", "payer relation"]) || "Guardian",
      billingContact: true,
      employer: value(rawData, ["employer", "guardian employer", "parent employer", "payer employer"]),
    },
    {
      name: value(rawData, ["secondary guardian", "secondary payer", "secondary parent", "parent 2", "payer 2", "spouse"]),
      guardianEmail: value(rawData, ["secondary email", "secondary guardian email", "secondary payer email", "parent 2 email", "payer 2 email"]).toLowerCase(),
      guardianPhone: value(rawData, ["secondary phone", "secondary guardian phone", "secondary payer phone", "parent 2 phone", "payer 2 phone"]),
      externalId: externalValue(rawData, ["secondary guardian id", "secondary payer id", "parent 2 id", "payer 2 id"]),
      relation: value(rawData, ["secondary relation", "secondary guardian relation", "parent 2 relation"]) || "Secondary Guardian",
      billingContact: false,
      employer: value(rawData, ["secondary employer", "secondary guardian employer", "secondary payer employer", "parent 2 employer"]),
    },
  ];

  try {
    const accountPeople = JSON.parse(value(rawData, ["procare account person records"]) || "[]") as unknown;
    if (Array.isArray(accountPeople)) {
      for (const person of accountPeople) {
        const fields = embeddedImportRecord(person);
        if (!/payer/i.test(value(fields, ["person type", "type"]))) continue;
        if (childPersonExternalId && externalValue(fields, ["person id"]) === childPersonExternalId) continue;
        guardianImports.push({
          name: procareChildFullName(fields),
          guardianEmail: value(fields, ["email", "email address"]).toLowerCase(),
          guardianPhone: value(fields, ["phone 1", "phone 2", "phone 3", "phone 4", "phone 5", "phone"]),
          externalId: externalValue(fields, ["person id", "payer id", "parent id"]),
          relation: value(fields, ["relation", "relationship"]) || "Guardian",
          billingContact: false,
          employer: value(fields, ["employer", "company", "workplace"]),
        });
      }
    }
  } catch {
    // The raw record remains reviewable; malformed embedded JSON cannot create a parent profile.
  }

  for (const relationship of procareRelationshipRecords(rawData)) {
    if (!relationship.guardian) continue;
    guardianImports.push({
      name: clean(relationship.name),
      guardianEmail: clean(relationship.email).toLowerCase(),
      guardianPhone: clean(relationship.phone),
      externalId: clean(relationship.externalId) || null,
      relation: clean(relationship.relation) || "Guardian",
      billingContact: false,
      employer: "",
    });
  }

  const uniqueGuardians = new Map<string, ProcareGuardianImport>();
  for (const guardian of guardianImports) {
    if (!guardian.name && !guardian.guardianEmail && !guardian.guardianPhone) continue;
    const identity = guardian.externalId
      ? `id:${guardian.externalId.toLowerCase()}`
      : guardian.guardianEmail
        ? `email:${guardian.guardianEmail}`
        : guardian.guardianPhone
          ? `phone:${guardian.guardianPhone.replace(/\D/g, "") || guardian.guardianPhone.toLowerCase()}`
          : `name:${guardian.name.toLowerCase()}`;
    const existing = uniqueGuardians.get(identity);
    if (!existing) {
      uniqueGuardians.set(identity, guardian);
      continue;
    }
    uniqueGuardians.set(identity, {
      name: existing.name || guardian.name,
      guardianEmail: existing.guardianEmail || guardian.guardianEmail,
      guardianPhone: existing.guardianPhone || guardian.guardianPhone,
      externalId: existing.externalId || guardian.externalId,
      relation: /^(secondary\s+)?guardian$/i.test(existing.relation) && guardian.relation ? guardian.relation : existing.relation,
      billingContact: existing.billingContact || guardian.billingContact,
      employer: existing.employer || guardian.employer,
    });
  }
  return [...uniqueGuardians.values()];
}

function splitPeopleList(input: string) {
  return input
    .split(/\r?\n|;|\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function intValue(input: string, fallback: number) {
  const parsed = Number.parseInt(input.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

type ProcareClassroomDb = Pick<Prisma.TransactionClient, "classroom">;

async function findOrCreateClassroom({
  centerId,
  name,
  ageGroup,
  rawData,
}: {
  centerId: string;
  name: string;
  ageGroup: string;
  rawData: Record<string, string>;
}, db: ProcareClassroomDb = prisma) {
  const providedClassroomExternalId = externalValue(rawData, ["classroom id", "room id", "class id", "classroom key", "room key"]);
  const classroomExternalId = providedClassroomExternalId || name;
  const matches = providedClassroomExternalId
    ? await db.classroom.findMany({
        where: { centerId, sourceSystem: "procare", externalId: classroomExternalId },
        take: 2,
        select: { id: true, capacity: true, ratioRule: true, customFields: true },
      })
    : await db.classroom.findMany({
        where: { centerId, name },
        take: 2,
        select: { id: true, capacity: true, ratioRule: true, customFields: true },
      });
  if (matches.length > 1) {
    throw new Error("Multiple classrooms match this ProCare room. Resolve the duplicate classrooms before importing.");
  }
  const existing = matches[0] ?? null;
  const capacity = value(rawData, ["capacity", "licensed capacity", "room capacity"]);
  const ratioRule = value(rawData, ["ratio", "ratio rule", "staff ratio"]);
  const importedCapacity = capacity ? intValue(capacity, -1) : null;
  if (importedCapacity !== null && importedCapacity < 0) {
    throw new Error("The ProCare classroom capacity is invalid. Correct the source value before importing this row.");
  }
  if (existing) {
    const legacyUnverifiedClassroom = existing.capacity === 12
      && /Imported from ProCare; verify capacity and ratio\./i.test(existing.ratioRule ?? "");
    const nextCapacity = importedCapacity ?? (legacyUnverifiedClassroom ? 0 : existing.capacity);
    const nextRatioRule = ratioRule || (legacyUnverifiedClassroom
      ? "Imported from ProCare; capacity and ratio need director verification."
      : existing.ratioRule);
    await db.classroom.update({
      where: { id: existing.id },
      data: {
        name,
        ageGroup,
        capacity: nextCapacity,
        ratioRule: nextRatioRule,
        sourceSystem: "procare",
        externalId: classroomExternalId,
        customFields: mergeCustomFields(
          existing.customFields,
          metadataFromRow(rawData, {
            mappedCenterId: centerId,
            importedFromColumn: "classroom",
            capacityImported: Boolean(capacity),
            ratioRuleImported: Boolean(ratioRule),
            setupVerificationRequired: nextCapacity <= 0 || !nextRatioRule,
          }),
        ),
      },
    });
    return { id: existing.id, created: false };
  }

  const classroom = await db.classroom.create({
    data: {
      centerId,
      name,
      ageGroup,
      capacity: importedCapacity ?? 0,
      ratioRule: ratioRule || "Imported from ProCare; capacity and ratio need director verification.",
      sourceSystem: "procare",
      externalId: classroomExternalId,
      customFields: metadataFromRow(rawData, {
        mappedCenterId: centerId,
        importedFromColumn: "classroom",
        capacityImported: Boolean(capacity),
        ratioRuleImported: Boolean(ratioRule),
        setupVerificationRequired: !capacity || !ratioRule,
      }),
    },
    select: { id: true },
  });
  return { id: classroom.id, created: true };
}

type ImportCenter = {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  city: string | null;
  state: string | null;
};

type TeacherCenterGrantDb = Pick<Prisma.TransactionClient, "userAccessGrant">;

async function ensureTeacherCenterGrant(input: {
  userId: string;
  tenantId: string;
  organizationId?: string | null;
  centerId: string;
}, db: TeacherCenterGrantDb = prisma) {
  await db.userAccessGrant.updateMany({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      isActive: true,
      centerId: { not: input.centerId },
    },
    data: { isActive: false },
  });

  const existing = await db.userAccessGrant.findFirst({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      centerId: input.centerId,
    },
    select: { id: true },
  });

  if (existing) {
    return db.userAccessGrant.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        organizationId: input.organizationId ?? null,
      },
    });
  }

  return db.userAccessGrant.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? null,
      centerId: input.centerId,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      permissions: { createdFromProcareImport: true },
    },
  });
}

function normalizedStaffContactEmail(value: string) {
  return isEmail(value) ? value.toLowerCase() : "";
}

async function findExistingImportedStaffProfile(input: {
  centerId: string;
  externalId: string | null;
  contactEmail: string;
  rejectAmbiguous?: boolean;
}) {
  const identityWhere: Prisma.StaffProfileWhereInput | null = input.externalId
    ? { sourceSystem: "procare", externalId: input.externalId }
    : input.contactEmail
      ? { customFields: { path: ["staffContactEmail"], equals: input.contactEmail } }
      : null;
  if (!identityWhere) return null;

  const matches = await prisma.staffProfile.findMany({
    where: { centerId: input.centerId, ...identityWhere },
    take: 2,
    select: {
      id: true,
      userId: true,
      customFields: true,
      user: { select: { id: true, email: true, tenantId: true, organizationId: true, role: true } },
    },
  });
  if (input.rejectAmbiguous && matches.length > 1) {
    throw new Error("Multiple staff profiles use this ProCare identity. Resolve the duplicate staff records before importing.");
  }
  return matches[0] ?? null;
}

type DuplicateMatchMode = "review" | "strict" | "auto";

function duplicateMatchMode(input: string): DuplicateMatchMode {
  return input === "strict" || input === "auto" ? input : "review";
}

function duplicateMatchNeedsReview(match: ProcareDuplicateMatch, mode: DuplicateMatchMode) {
  if (!match.candidates.length) return false;
  if (mode === "strict") return true;
  return match.resolution === "needs_review";
}

function previewImportKey(...parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.trim().toLowerCase())
    .join(":");
}

function previewImportIdentityKey(scope: string, ...candidates: Array<string | null | undefined>) {
  const identity = candidates.find((candidate) => Boolean(candidate?.trim()));
  return identity ? previewImportKey(scope, identity) : "";
}

function parseImportRowNumbers(input: string) {
  return [...new Set(
    input
      .split(",")
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1),
  )].sort((left, right) => left - right);
}

function importReviewEvidence(input: {
  sourceSha256: string;
  mappingSignature: string;
  warningRowNumbers: number[];
  duplicateReviewRowNumbers: number[];
}) {
  return JSON.stringify({
    sourceSha256: input.sourceSha256,
    mappingSignature: input.mappingSignature,
    warningRowNumbers: [...input.warningRowNumbers].sort((left, right) => left - right),
    duplicateReviewRowNumbers: [...input.duplicateReviewRowNumbers].sort((left, right) => left - right),
  });
}

async function findProcareDuplicateMatches({
  rowNumber,
  targetCenterId,
  rawData,
}: {
  rowNumber: number;
  targetCenterId: string;
  rawData: Record<string, string>;
}) {
  const accountExternalId = externalValue(rawData, ["account key", "account id", "account number", "account no", "family id", "family key", "key", "procare account id"]);
  const familyName = procareFamilyName(rawData);
  const childName = procareChildFullName(rawData);
  const childExternalId = externalValue(rawData, ["child id", "child key", "student id", "student key", "person id", "procare child id"]);
  const childDob = parseDate(value(rawData, ["dob", "birth date", "date of birth", "birthday", "birthdate"]));
  const guardianName = value(rawData, ["guardian name", "parent/guardian", "parent name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent", "mother", "father"]);
  const email = value(rawData, ["email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email"]).toLowerCase();
  const phone = value(rawData, ["phone", "guardian phone", "parent phone", "primary phone", "payer phone", "payer 1 phone", "primary payer phone"]);
  const address = value(rawData, ["address", "street address", "home address", "mailing address", "primary address", "payer address"]);
  const matches: ProcareDuplicateMatch[] = [];

  const familyWhere: Prisma.FamilyWhereInput[] = accountExternalId
    ? [{ sourceSystem: "procare", externalId: accountExternalId }]
    : [
        familyName ? { name: familyName } : undefined,
        email ? { billingEmail: email } : undefined,
        address ? { address } : undefined,
        childName ? { children: { some: { fullName: childName } } } : undefined,
        guardianName ? { guardians: { some: { fullName: guardianName } } } : undefined,
        email ? { guardians: { some: { email } } } : undefined,
        phone ? { guardians: { some: { phone } } } : undefined,
      ].filter(Boolean) as Prisma.FamilyWhereInput[];
  if (familyName || childName || email || phone || accountExternalId) {
    const familyCandidates = familyWhere.length
      ? await prisma.family.findMany({
          where: { centerId: targetCenterId, OR: familyWhere },
          take: 8,
          include: {
            guardians: { select: { fullName: true, email: true, phone: true } },
            children: { select: { fullName: true, dateOfBirth: true } },
          },
        })
      : [];
    const scoredFamilies = familyCandidates
      .map((candidate) => scoreProcareDuplicateCandidate(
        {
          entity: "family",
          externalId: accountExternalId,
          name: familyName || childName || email,
          email,
          phone,
          address,
          childName,
          dateOfBirth: childDob,
          guardianName,
        },
        {
          entity: "family",
          recordId: candidate.id,
          label: candidate.name,
          externalId: candidate.externalId,
          name: candidate.name,
          email: candidate.billingEmail,
          address: candidate.address,
          childNames: candidate.children.map((child) => child.fullName),
          childDatesOfBirth: candidate.children.map((child) => child.dateOfBirth),
          guardianNames: candidate.guardians.map((guardian) => guardian.fullName),
          guardianEmails: candidate.guardians.map((guardian) => guardian.email),
          guardianPhones: candidate.guardians.map((guardian) => guardian.phone),
        },
      ))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    if (scoredFamilies.length) {
      matches.push(buildProcareDuplicateMatch({
        rowNumber,
        entity: "family",
        importLabel: familyName || childName || email,
        candidates: scoredFamilies,
      }));
    }
  }

  const childWhere: Prisma.ChildWhereInput[] = childExternalId
    ? [{ sourceSystem: "procare", externalId: childExternalId }]
    : childName
      ? [{ fullName: childName }]
      : [];
  if (childName && childWhere.length) {
    const childCandidates = await prisma.child.findMany({
      where: { family: { centerId: targetCenterId }, OR: childWhere },
      take: 8,
      include: { family: { select: { name: true } } },
    });
    const scoredChildren = childCandidates
      .map((candidate) => scoreProcareDuplicateCandidate(
        {
          entity: "child",
          externalId: childExternalId,
          name: childName,
          familyName,
          dateOfBirth: childDob,
        },
        {
          entity: "child",
          recordId: candidate.id,
          label: `${candidate.fullName} (${candidate.family.name})`,
          externalId: candidate.externalId,
          name: candidate.fullName,
          familyName: candidate.family.name,
          dateOfBirth: candidate.dateOfBirth,
        },
      ))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    if (scoredChildren.length) {
      matches.push(buildProcareDuplicateMatch({
        rowNumber,
        entity: "child",
        importLabel: childName,
        candidates: scoredChildren,
      }));
    }
  }

  const guardianImports = procareGuardianImports(
    rawData,
    externalValue(rawData, ["child person id"]) ?? "",
  );

  const guardianLookupWhere = guardianImports.flatMap((guardianImport): Prisma.GuardianWhereInput[] => (
    guardianImport.externalId
      ? [{ sourceSystem: "procare", externalId: guardianImport.externalId }]
      : [
          guardianImport.guardianEmail ? { email: guardianImport.guardianEmail } : undefined,
          guardianImport.guardianPhone ? { phone: guardianImport.guardianPhone } : undefined,
          guardianImport.name ? { fullName: guardianImport.name } : undefined,
        ].filter(Boolean) as Prisma.GuardianWhereInput[]
  ));
  const guardianCandidates = guardianLookupWhere.length
    ? await prisma.guardian.findMany({
        where: { family: { centerId: targetCenterId }, OR: guardianLookupWhere },
        take: Math.min(Math.max(guardianImports.length * 8, 8), 40),
        include: { family: { select: { name: true } } },
      })
    : [];

  for (const guardianImport of guardianImports) {
    const matchingGuardianCandidates = guardianCandidates.filter((candidate) => (
      guardianImport.externalId
        ? candidate.sourceSystem === "procare" && candidate.externalId === guardianImport.externalId
        : Boolean(
            (guardianImport.guardianEmail && candidate.email === guardianImport.guardianEmail)
            || (guardianImport.guardianPhone && candidate.phone === guardianImport.guardianPhone)
            || (guardianImport.name && candidate.fullName === guardianImport.name)
          )
    ));
    const scoredGuardians = matchingGuardianCandidates
      .map((candidate) => scoreProcareDuplicateCandidate(
        {
          entity: "guardian",
          externalId: guardianImport.externalId,
          name: guardianImport.name,
          email: guardianImport.guardianEmail,
          phone: guardianImport.guardianPhone,
          familyName,
          relation: guardianImport.relation,
        },
        {
          entity: "guardian",
          recordId: candidate.id,
          label: `${candidate.fullName} (${candidate.family.name})`,
          externalId: candidate.externalId,
          name: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          familyName: candidate.family.name,
          relation: candidate.relation,
        },
      ))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    if (scoredGuardians.length) {
      matches.push(buildProcareDuplicateMatch({
        rowNumber,
        entity: "guardian",
        importLabel: guardianImport.name || guardianImport.guardianEmail || guardianImport.guardianPhone,
        candidates: scoredGuardians,
      }));
    }
  }

  return matches;
}

async function previewImportRows({
  rows,
  headers,
  autoMap,
  defaultCenter,
  centerByAlias,
  sourceType,
  filename,
  duplicateMode,
}: {
  rows: string[][];
  headers: string[];
  autoMap: boolean;
  defaultCenter: ImportCenter;
  centerByAlias: CenterAliasMap<ImportCenter>;
  sourceType: string;
  filename: string;
  duplicateMode: DuplicateMatchMode;
}) {
  const importRowCount = Math.max(rows.length - 1, 0);
  const runDatabasePreviewLookups = true;
  let familyRows = 0;
  let staffRows = 0;
  let matchedFamilies = 0;
  let newFamilies = 0;
  let matchedChildren = 0;
  let newChildren = 0;
  let matchedStaff = 0;
  let newStaff = 0;
  let balanceRows = 0;
  let attendanceRows = 0;
  let checkLogRows = 0;
  let unmappedRows = 0;
  const centersTouched = new Set<string>();
  const classroomsReferenced = new Set<string>();
  const importFamilyKeys = new Set<string>();
  const importChildKeys = new Set<string>();
  const importGuardianKeys = new Set<string>();
  const familyChildLinkKeys = new Set<string>();
  const familyGuardianLinkKeys = new Set<string>();
  const familiesWithChildren = new Set<string>();
  const familiesWithGuardians = new Set<string>();
  const importStaffKeys = new Set<string>();
  const duplicateReviewRows = new Set<number>();
  const duplicateMatches: ProcareDuplicateMatch[] = [];
  const warnings: Array<{ rowNumber: number; message: string }> = [];
  const rowResults: Array<{
    rowNumber: number;
    status: "ready" | "warning";
    entity: "family_child" | "staff" | "unknown";
    center: string;
    action: string;
    familyName?: string;
    childName?: string;
    staffName?: string;
    relationshipSummary?: string;
    message?: string;
  }> = [];

  // Standard ProCare exports carry stable family, child, and guardian IDs. Load
  // those exact identities once so a large director review does not make the
  // same three-to-five database round trips for every row. Rows without stable
  // IDs (and any ambiguous exact IDs) still use the complete duplicate matcher
  // below, so the faster path does not weaken review safeguards.
  const previewExactIdentities = rows.slice(1).map((row) => {
    const rawData = Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""]));
    const rowCenterValue = value(rawData, [
      "location id",
      "crm location id",
      "school id",
      "school",
      "school name",
      "center",
      "center name",
      "location",
      "site",
    ]);
    const targetCenter = autoMap
      ? resolveImportCenter(centerByAlias, rowCenterValue)
      : defaultCenter;
    return {
      targetCenter,
      familyExternalId: externalValue(rawData, ["account key", "account id", "account number", "account no", "family id", "family key", "key", "procare account id"]),
      childExternalId: externalValue(rawData, ["child id", "child key", "student id", "student key", "person id", "procare child id"]),
      guardianExternalIds: procareGuardianImports(
        rawData,
        externalValue(rawData, ["child person id"]) ?? "",
      )
        .map((guardian) => guardian.externalId)
        .filter((externalId): externalId is string => Boolean(externalId)),
    };
  });
  const previewCenterIds = [...new Set(previewExactIdentities.map((item) => item.targetCenter?.id).filter((id): id is string => Boolean(id)))];
  const previewFamilyExternalIds = [...new Set(previewExactIdentities.map((item) => item.familyExternalId).filter((id): id is string => Boolean(id)))];
  const previewChildExternalIds = [...new Set(previewExactIdentities.map((item) => item.childExternalId).filter((id): id is string => Boolean(id)))];
  const previewGuardianExternalIds = [...new Set(previewExactIdentities.flatMap((item) => item.guardianExternalIds))];
  const previewExactIdentityLookupResults = await Promise.all([
    previewCenterIds.length && previewFamilyExternalIds.length
      ? prisma.family.findMany({
          where: { centerId: { in: previewCenterIds }, sourceSystem: "procare", externalId: { in: previewFamilyExternalIds } },
          select: { id: true, centerId: true, externalId: true },
        })
      : Promise.resolve([]),
    previewCenterIds.length && previewChildExternalIds.length
      ? prisma.child.findMany({
          where: { family: { centerId: { in: previewCenterIds } }, sourceSystem: "procare", externalId: { in: previewChildExternalIds } },
          select: { id: true, externalId: true, family: { select: { centerId: true } } },
        })
      : Promise.resolve([]),
    previewCenterIds.length && previewGuardianExternalIds.length
      ? prisma.guardian.findMany({
          where: { family: { centerId: { in: previewCenterIds } }, sourceSystem: "procare", externalId: { in: previewGuardianExternalIds } },
          select: { id: true, externalId: true, family: { select: { centerId: true } } },
        })
      : Promise.resolve([]),
  ]);
  const previewFamiliesByExternalId = previewExactIdentityLookupResults[0] as unknown as Array<{ id: string; centerId: string | null; externalId: string | null }>;
  const previewChildrenByExternalId = previewExactIdentityLookupResults[1] as unknown as Array<{ id: string; externalId: string | null; family: { centerId: string | null } }>;
  const previewGuardiansByExternalId = previewExactIdentityLookupResults[2] as unknown as Array<{ id: string; externalId: string | null; family: { centerId: string | null } }>;
  const exactIdentityKey = (centerId: string, externalId: string) => `${centerId}:${externalId}`;
  const indexExactIdentities = <T extends { id: string; centerId: string | null; externalId: string | null }>(items: T[]) => {
    const index = new Map<string, { id: string; count: number }>();
    for (const item of items) {
      if (!item.centerId || !item.externalId) continue;
      const key = exactIdentityKey(item.centerId, item.externalId);
      const existing = index.get(key);
      index.set(key, { id: existing?.id ?? item.id, count: (existing?.count ?? 0) + 1 });
    }
    return index;
  };
  const exactFamilyMatches = indexExactIdentities(previewFamiliesByExternalId);
  const exactChildMatches = indexExactIdentities(previewChildrenByExternalId.map((child) => ({ ...child, centerId: child.family.centerId })));
  const exactGuardianMatches = indexExactIdentities(previewGuardiansByExternalId.map((guardian) => ({ ...guardian, centerId: guardian.family.centerId })));

  await forEachWithConcurrency(rows.slice(1), 10, async (_row, rowIndex) => {
    const index = rowIndex + 1;
    const rawData = Object.fromEntries(headers.map((header, column) => [header, rows[index]?.[column] ?? ""]));
    const rowNumber = index + 1;
    const rowCenterValue = value(rawData, [
      "location id",
      "crm location id",
      "school id",
      "school",
      "school name",
      "center",
      "center name",
      "location",
      "site",
    ]);
    const targetCenter = autoMap
      ? resolveImportCenter(centerByAlias, rowCenterValue)
      : defaultCenter;
    if (!targetCenter) {
      unmappedRows += 1;
      const message = `Could not map row to a center from "${rowCenterValue || "blank location"}".`;
      warnings.push({ rowNumber, message });
      rowResults.push({ rowNumber, status: "warning", entity: "unknown", center: "Unmapped", action: "Skipped until mapped", message });
      return;
    }

    centersTouched.add(targetCenter.id);
    const importWarning = value(rawData, ["import warning"]);
    if (importWarning) {
      warnings.push({ rowNumber, message: importWarning });
      rowResults.push({ rowNumber, status: "warning", entity: "unknown", center: targetCenter.crmLocationId ?? targetCenter.name, action: "Resolve account relationship", message: importWarning });
      return;
    }
    const employeeName = procareStaffName(rawData);
    const employeeEmail = value(rawData, ["employee email", "staff email", "teacher email", "work email", "email"]);
    const employeeExternalId = externalValue(rawData, ["employee id", "staff id", "teacher id", "employee key", "person id"]);
    const childName = procareChildFullName(rawData);
    const familyName = procareFamilyName(rawData);
    const email = value(rawData, ["email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email"]).toLowerCase();
    const accountExternalId = externalValue(rawData, ["account key", "account id", "account number", "account no", "family id", "family key", "key", "procare account id"]);
    const childExternalId = externalValue(rawData, ["child id", "child key", "student id", "student key", "person id", "procare child id"]);
    const classroomName = procareClassroomName(rawData);
    if (classroomName) classroomsReferenced.add(`${targetCenter.id}:${classroomName}`);
    const previewEnrollmentStatusValue = value(rawData, ["child status", "status", "enrollment status", "student status"]);
    if (childName && previewEnrollmentStatusValue && normalizeProcareEnrollmentStatus(previewEnrollmentStatusValue) === "enrolled" && !classroomName) {
      const message = "An enrolled child is missing a classroom assignment.";
      warnings.push({ rowNumber, message });
      rowResults.push({ rowNumber, status: "warning", entity: "family_child", center: targetCenter.crmLocationId ?? targetCenter.name, action: "Assign a classroom", familyName: familyName || undefined, childName, message });
      return;
    }

    if (employeeName && !childName && !familyName) {
      staffRows += 1;
      const staffContactEmail = normalizedStaffContactEmail(employeeEmail);
      const staffKey = previewImportIdentityKey(targetCenter.id, employeeExternalId, staffContactEmail, employeeName);
      if (staffKey) importStaffKeys.add(staffKey);
      const existingStaff = runDatabasePreviewLookups
        ? await findExistingImportedStaffProfile({
            centerId: targetCenter.id,
            externalId: employeeExternalId,
            contactEmail: staffContactEmail,
          })
        : null;
      if (runDatabasePreviewLookups) {
        if (existingStaff) matchedStaff += 1; else newStaff += 1;
      }
      rowResults.push({
        rowNumber,
        status: "ready",
        entity: "staff",
        center: targetCenter.crmLocationId ?? targetCenter.name,
        action: runDatabasePreviewLookups ? existingStaff ? "Update staff" : "Create staff" : "Ready to import staff",
        staffName: employeeName,
      });
      return;
    }

    if (!familyName && !childName && !email) {
      const message = "Missing family, child, or email fields.";
      warnings.push({ rowNumber, message });
      rowResults.push({ rowNumber, status: "warning", entity: "unknown", center: targetCenter.crmLocationId ?? targetCenter.name, action: "Needs cleanup", message });
      return;
    }

    familyRows += 1;
    const familyIdentity = accountExternalId || familyName || email || childName;
    const familyKey = previewImportIdentityKey(targetCenter.id, accountExternalId, familyName, email, childName);
    if (familyKey) importFamilyKeys.add(familyKey);
    const childKey = childName ? previewImportKey(targetCenter.id, familyIdentity, childExternalId || childName) : "";
    if (childKey) importChildKeys.add(childKey);
    const guardianImports = procareGuardianImports(
      rawData,
      externalValue(rawData, ["child person id"]) ?? "",
    );
    if (familyKey && childKey) {
      familyChildLinkKeys.add(previewImportKey(familyKey, childKey));
      familiesWithChildren.add(familyKey);
    }
    for (const guardian of guardianImports) {
      const guardianKey = previewImportIdentityKey(
        targetCenter.id,
        guardian.externalId,
        guardian.guardianEmail,
        guardian.guardianPhone,
        guardian.name,
      );
      if (!guardianKey) continue;
      importGuardianKeys.add(guardianKey);
      if (familyKey) {
        familyGuardianLinkKeys.add(previewImportKey(familyKey, guardianKey));
        familiesWithGuardians.add(familyKey);
      }
    }
    if (value(rawData, ["balance", "account balance", "ledger balance", "amount due"])) balanceRows += 1;
    if (value(rawData, ["attendance date", "date", "absence date", "attendance status", "attendance"])) attendanceRows += 1;
    if (value(rawData, ["check in", "check-in", "time in", "check out", "check-out", "time out"])) checkLogRows += 1;

    const fallbackFamilyMatchers = [
      familyName ? { name: familyName } : undefined,
      email ? { billingEmail: email } : undefined,
    ].filter(Boolean) as Array<{ name?: string; billingEmail?: string }>;
    const exactFamilyMatch = accountExternalId
      ? exactFamilyMatches.get(exactIdentityKey(targetCenter.id, accountExternalId))
      : undefined;
    const existingFamily = !runDatabasePreviewLookups
      ? null
      : accountExternalId
        ? exactFamilyMatch ? { id: exactFamilyMatch.id } : null
        : fallbackFamilyMatchers.length
          ? await prisma.family.findFirst({
              where: { centerId: targetCenter.id, OR: fallbackFamilyMatchers },
              select: { id: true },
            })
          : null;
    if (runDatabasePreviewLookups) {
      if (existingFamily) matchedFamilies += 1; else newFamilies += 1;
    }

    let existingChild: { id: string } | null = null;
    if (runDatabasePreviewLookups && childName) {
      const exactChildMatch = childExternalId
        ? exactChildMatches.get(exactIdentityKey(targetCenter.id, childExternalId))
        : undefined;
      existingChild = childExternalId
        ? exactChildMatch ? { id: exactChildMatch.id } : null
        : existingFamily
          ? await prisma.child.findFirst({
              where: { familyId: existingFamily.id, fullName: childName },
              select: { id: true },
            })
          : null;
    }
    if (runDatabasePreviewLookups && childName) {
      if (existingChild) matchedChildren += 1; else newChildren += 1;
    }
    const exactFamilyIdentityIsSafe = Boolean(accountExternalId) && (exactFamilyMatch?.count ?? 0) <= 1;
    const exactChildIdentityIsSafe = !childName || (childExternalId
      ? (exactChildMatches.get(exactIdentityKey(targetCenter.id, childExternalId))?.count ?? 0) <= 1
      : false);
    const exactGuardianIdentitiesAreSafe = guardianImports.every((guardian) => {
      if (!guardian.externalId) return false;
      return (exactGuardianMatches.get(exactIdentityKey(targetCenter.id, guardian.externalId))?.count ?? 0) <= 1;
    });
    const canUseExactIdentityFastPath = duplicateMode !== "strict"
      && exactFamilyIdentityIsSafe
      && exactChildIdentityIsSafe
      && exactGuardianIdentitiesAreSafe;
    const rowDuplicateMatches = runDatabasePreviewLookups && !canUseExactIdentityFastPath
      ? await findProcareDuplicateMatches({ rowNumber, targetCenterId: targetCenter.id, rawData })
      : [];
    const rowDuplicateWarnings = rowDuplicateMatches.filter((match) => duplicateMatchNeedsReview(match, duplicateMode));
    if (rowDuplicateMatches.length) duplicateMatches.push(...rowDuplicateMatches);
    if (rowDuplicateWarnings.length) {
      duplicateReviewRows.add(rowNumber);
      const message = `Review possible duplicate ${rowDuplicateWarnings.map((match) => match.entity).join(", ")} match before import.`;
      warnings.push({ rowNumber, message });
    }
    rowResults.push({
      rowNumber,
      status: rowDuplicateWarnings.length ? "warning" : "ready",
      entity: "family_child",
      center: targetCenter.crmLocationId ?? targetCenter.name,
      action: rowDuplicateWarnings.length
        ? "Review duplicate matches"
        : runDatabasePreviewLookups
          ? existingFamily ? "Update and link profiles" : "Create and link profiles"
          : "Ready to import family",
      familyName: familyName || email || childName,
      childName: childName || undefined,
      relationshipSummary: [
        childName ? "1 child" : "",
        guardianImports.length ? `${guardianImports.length} parent profile${guardianImports.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" + ") || "Family profile",
      message: rowDuplicateWarnings.length ? rowDuplicateWarnings.map((match) => `${match.entity}: ${match.importLabel}`).join("; ") : undefined,
    });
  });

  warnings.sort((a, b) => a.rowNumber - b.rowNumber);
  rowResults.sort((a, b) => a.rowNumber - b.rowNumber);
  duplicateMatches.sort((a, b) => a.rowNumber - b.rowNumber || a.entity.localeCompare(b.entity));

  return {
    center: autoMap ? "Auto-mapped from ProCare export" : defaultCenter.crmLocationId ?? defaultCenter.name,
    sourceType,
    filename,
    rows: Math.max(rows.length - 1, 0),
    readyRows: rowResults.filter((row) => row.status === "ready").length,
    warningRows: rowResults.filter((row) => row.status === "warning").length,
    unmappedRows,
    familyRows,
    staffRows,
    sourceFamilyGroups: importFamilyKeys.size,
    sourceChildGroups: importChildKeys.size,
    sourceGuardianGroups: importGuardianKeys.size,
    familyChildLinks: familyChildLinkKeys.size,
    familyGuardianLinks: familyGuardianLinkKeys.size,
    familiesWithCompleteProfileLinks: [...familiesWithChildren].filter((familyKey) => familiesWithGuardians.has(familyKey)).length,
    sourceStaffGroups: importStaffKeys.size,
    matchedFamilies,
    newFamilies,
    matchedChildren,
    newChildren,
    matchedStaff,
    newStaff,
    classroomsReferenced: classroomsReferenced.size,
    balanceRows,
    attendanceRows,
    checkLogRows,
    centersTouched: centersTouched.size,
    duplicateMatches: duplicateMatches.length,
    duplicateReviewRows: duplicateReviewRows.size,
    warningRowNumbers: [...new Set(warnings.map((warning) => warning.rowNumber))],
    duplicateReviewRowNumbers: [...duplicateReviewRows],
    duplicateScanSkipped: false,
    exactIdentityLookupsBatched: true,
    duplicateScanRowLimit: PROCARE_DUPLICATE_REVIEW_ROW_LIMIT,
    duplicateReviewChunks: Math.max(Math.ceil(importRowCount / PROCARE_DUPLICATE_REVIEW_ROW_LIMIT), 1),
    relationshipSafeReview: true,
    existingMatchPreviewSkipped: false,
    duplicateMatchesByEntity: {
      families: duplicateMatches.filter((match) => match.entity === "family").length,
      children: duplicateMatches.filter((match) => match.entity === "child").length,
      guardians: duplicateMatches.filter((match) => match.entity === "guardian").length,
    },
    duplicateMatchMode: duplicateMode,
    duplicateMatchDetails: duplicateMatches.slice(0, 50),
    warnings: warnings.slice(0, 25),
    rowResults: rowResults.slice(0, 500),
  };
}

function isZipBuffer(buffer: Buffer) {
  return buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
}

const STANDARD_MULTI_REPORT_HINT_GROUPS = [
  ["enrollment status", "relationship 1 id"],
  ["account key", "person sort id"],
  ["relationship type", "authorized pickup"],
  ["category description", "item description"],
] as const;
const MAX_PROCARE_SOURCE_FILES = 500;
const MAX_PROCARE_UPLOAD_BYTES = 100 * 1024 * 1024;

function normalizedImportHeader(value: string) {
  return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeStandardMultiReportShard(headers: string[]) {
  const normalized = new Set(headers.map(normalizedImportHeader));
  return STANDARD_MULTI_REPORT_HINT_GROUPS.some((group) => group.every((header) => normalized.has(header)));
}

function buildConsolidatedRowsFromFiles(entries: Map<string, Buffer>) {
  const sources: Array<{ sourceName: string; records: Record<string, string>[]; recognizedHeaders: number }> = [];
  const inventory: Array<{ sourceName: string; reportKind: "consolidated" | "ignored"; rows: number; matchedHeaderAliases: number; note?: string }> = [];
  let hasStandardReportShard = false;

  for (const [sourceName, buffer] of entries) {
    let rows: string[][];
    try {
      rows = parseImportRows(decodeProcareTabularBuffer(buffer));
    } catch (error) {
      inventory.push({
        sourceName,
        reportKind: "ignored",
        rows: 0,
        matchedHeaderAliases: 0,
        note: error instanceof Error ? error.message : "This file is not a supported tabular report.",
      });
      continue;
    }
    const rawHeaders = rows[0]?.map((header) => header.trim().replace(/^\ufeff/, "")) ?? [];
    if (looksLikeStandardMultiReportShard(rawHeaders)) hasStandardReportShard = true;
    const headerAnalysis = analyzeProcareHeaders(rawHeaders);
    const headerMap = rawHeaders.map((header, index) => headerAnalysis[index]?.suggestedField || header);
    const recognizedHeaders = headerAnalysis.filter((header) => header.recognized).length;
    if (rows.length < 2 || !recognizedHeaders) {
      inventory.push({
        sourceName,
        reportKind: "ignored",
        rows: Math.max(rows.length - 1, 0),
        matchedHeaderAliases: recognizedHeaders,
        note: rows.length < 2 ? "No data rows were found." : "No supported ProCare import columns were recognized.",
      });
      continue;
    }
    sources.push({
      sourceName,
      recognizedHeaders,
      records: rows.slice(1).map((row, rowIndex) => {
        const record: Record<string, string> = {
          "bee import source file": sourceName,
          "bee import source row": String(rowIndex + 2),
        };
        for (const [column, header] of headerMap.entries()) {
          const cell = row[column] ?? "";
          if (!cell) continue;
          record[header] = record[header] || cell;
        }
        return record;
      }),
    });
    inventory.push({
      sourceName,
      reportKind: "consolidated",
      rows: rows.length - 1,
      matchedHeaderAliases: recognizedHeaders,
    });
  }

  if (hasStandardReportShard) return null;
  if (!sources.length) {
    throw new Error("No supported ProCare report or consolidated CSV columns were recognized. Upload the four standard ProCare reports, a ZIP containing them, or a consolidated CSV with headings such as Family Name, Child Name, Guardian Email, Balance, or Classroom.");
  }

  const dataHeaders = [...new Set(sources.flatMap((source) => source.records.flatMap((record) => Object.keys(record))))];
  const seenRows = new Set<string>();
  const records: Record<string, string>[] = [];
  let rawRows = 0;
  for (const source of sources) {
    for (const record of source.records) {
      rawRows += 1;
      const fingerprint = JSON.stringify(dataHeaders.filter((header) => !header.startsWith("bee import source ")).map((header) => [header, record[header] ?? ""]));
      if (seenRows.has(fingerprint)) continue;
      seenRows.add(fingerprint);
      records.push(record);
    }
  }
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const datasetCoverage = {
    version: "consolidated-multi-file-v1",
    reportDetection: {
      consolidated: {
        sourceName: sources.map((source) => source.sourceName).join(", "),
        sourceNames: sources.map((source) => source.sourceName),
        sourceFileCount: sources.length,
        matchedHeaderAliases: sources.reduce((total, source) => total + source.recognizedHeaders, 0),
      },
    },
    sourceInventory: inventory,
    sourceRows: { consolidated: records.length },
    rawSourceRows: { consolidated: rawRows },
    duplicateSourceRowsRemoved: { consolidated: rawRows - records.length },
  };
  return {
    text: JSON.stringify({ records, datasetCoverage }),
    filename: sources.map((source) => source.sourceName).join(", "),
    sourceType: "csv_files",
    datasetCoverage,
    parsedRows: [headers, ...records.map((record) => headers.map((header) => record[header] ?? ""))],
  };
}

async function readImportText(files: FormDataEntryValue[], pastedCsv: string) {
  const uploadedFiles = files.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (uploadedFiles.length && pastedCsv.trim()) {
    throw new Error("Choose either uploaded files or pasted CSV text before submitting the ProCare import review.");
  }
  if (uploadedFiles.length > MAX_PROCARE_SOURCE_FILES) {
    throw new Error(`The selected ProCare sources contain more than ${MAX_PROCARE_SOURCE_FILES} files. Split the handoff into reviewed batches.`);
  }
  const uploadedBytes = uploadedFiles.reduce((total, file) => total + file.size, 0);
  if (uploadedBytes > MAX_PROCARE_UPLOAD_BYTES) {
    throw new Error("The selected ProCare sources are larger than 100 MB. Split the handoff into reviewed batches.");
  }
  if (!uploadedFiles.length) {
    return { text: pastedCsv, filename: "pasted-procare-import.csv", sourceType: "csv_text", datasetCoverage: null };
  }

  if (uploadedFiles.length > 1) {
    const entries = new Map<string, Buffer>();
    for (const [index, file] of uploadedFiles.entries()) {
      const buffer = Buffer.from(await file.arrayBuffer());
      entries.set(`upload-${index + 1}:${file.name || "unnamed"}`, buffer);
    }
    const expandedEntries = await expandProcareSourceEntries(entries);
    let records: Array<Record<string, string>>;
    try {
      records = await buildProcareMultiReportRowsFromFiles(expandedEntries);
    } catch (error) {
      const consolidated = buildConsolidatedRowsFromFiles(expandedEntries);
      if (consolidated) return consolidated;
      throw error;
    }
    const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const datasetCoverage = records[0]?.["procare dataset coverage manifest"]
      ? JSON.parse(records[0]["procare dataset coverage manifest"])
      : null;
    return {
      text: JSON.stringify(records),
      filename: uploadedFiles.map((file) => file.name).join(", "),
      sourceType: "procare_multi_report_files",
      datasetCoverage,
      parsedRows: [headers, ...records.map((record) => headers.map((header) => record[header as keyof typeof record] ?? ""))],
    };
  }

  const file = uploadedFiles[0];
  const buffer = Buffer.from(await file.arrayBuffer());
  if (isZipBuffer(buffer)) {
    const expandedEntries = await expandProcareSourceEntries(new Map([[file.name || "uploaded-procare.zip", buffer]]));
    let records: Array<Record<string, string>>;
    try {
      records = await buildProcareMultiReportRowsFromFiles(expandedEntries);
    } catch (error) {
      const consolidated = buildConsolidatedRowsFromFiles(expandedEntries);
      if (consolidated) return { ...consolidated, filename: file.name || consolidated.filename };
      throw error;
    }
    const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const datasetCoverage = records[0]?.["procare dataset coverage manifest"]
      ? JSON.parse(records[0]["procare dataset coverage manifest"])
      : null;
    return {
      text: JSON.stringify(records),
      filename: file.name,
      sourceType: "procare_multi_report_zip",
      datasetCoverage,
      parsedRows: [headers, ...records.map((record) => headers.map((header) => record[header as keyof typeof record] ?? ""))],
    };
  }
  return { text: decodeProcareTabularBuffer(buffer), filename: file.name || "unnamed-procare-export", sourceType: "csv_file", datasetCoverage: null };
}

const importBackupInclude = {
  center: {
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      city: true,
      state: true,
    },
  },
  uploadedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  rows: {
    orderBy: { rowNumber: "asc" as const },
    select: {
      id: true,
      rowNumber: true,
      status: true,
      message: true,
      rawData: true,
      createdFamilyId: true,
      createdChildId: true,
    },
  },
} as const;

function importBatchCenterIds(batch: {
  centerId: string;
  summary?: Prisma.JsonValue | null;
  rows?: Array<{ rawData: Prisma.JsonValue }>;
}) {
  const centerIds = new Set([batch.centerId]);
  if (batch.summary && typeof batch.summary === "object" && !Array.isArray(batch.summary)) {
    const savedCenterIds = (batch.summary as Record<string, Prisma.JsonValue>)["centerIdsTouched"];
    if (Array.isArray(savedCenterIds)) {
      for (const centerId of savedCenterIds) if (typeof centerId === "string" && centerId) centerIds.add(centerId);
    }
  }
  for (const row of batch.rows ?? []) {
    if (!row.rawData || typeof row.rawData !== "object" || Array.isArray(row.rawData)) continue;
    const mappedCenterId = (row.rawData as Record<string, Prisma.JsonValue>)["mappedCenterId"];
    if (typeof mappedCenterId === "string" && mappedCenterId) centerIds.add(mappedCenterId);
  }
  return [...centerIds];
}

function safeBackupFilename(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "procare-import";
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "ProCare import backups are not allowed for this role." }, { status: 403 });
  }

  const requestedBatchId = clean(request.nextUrl.searchParams.get("batchId") || request.nextUrl.searchParams.get("id"));
  const requestedCenterId = clean(request.nextUrl.searchParams.get("centerId"));
  const reportType = clean(request.nextUrl.searchParams.get("report"));
  const wantsLatest = !requestedBatchId || requestedBatchId.toLowerCase() === "latest";

  const batch = wantsLatest
    ? await (async () => {
        const autoCenter = ["auto", "all", "bulk", ""].includes(requestedCenterId.toLowerCase());
        if (!autoCenter && requestedCenterId && !canAccessCenter(user, requestedCenterId)) {
          return { forbidden: true as const };
        }
        const centerIds = !autoCenter && requestedCenterId
          ? [requestedCenterId]
          : user.centerIds.length
            ? user.centerIds
            : ["__no_authorized_center__"];
        return prisma.procareImportBatch.findFirst({
          where: { centerId: { in: centerIds } },
          orderBy: { createdAt: "desc" },
          include: importBackupInclude,
        });
      })()
    : await prisma.procareImportBatch.findUnique({
        where: { id: requestedBatchId },
        include: importBackupInclude,
      });

  if (batch && "forbidden" in batch) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }
  if (!batch) {
    return NextResponse.json({ ok: false, error: "ProCare import batch not found." }, { status: 404 });
  }
  if (importBatchCenterIds(batch).some((centerId) => !canAccessCenter(user, centerId))) {
    return NextResponse.json({ ok: false, error: "You do not have access to this import batch." }, { status: 403 });
  }

  if (reportType === "reconciliation") {
    const importedRecords = batch.rows
      .filter((row) => row.status === "imported")
      .map((row) => {
        const raw = row.rawData && typeof row.rawData === "object" && !Array.isArray(row.rawData)
          ? Object.fromEntries(Object.entries(row.rawData).map(([key, field]) => [key, typeof field === "string" ? field : ""]))
          : {};
        return { raw, centerId: clean(raw.mappedCenterId) || batch.centerId };
      });
    const scopedIdentity = (centerId: string, externalId: string) => `${centerId}\0${externalId}`;
    const scopedIdentityParts = (identity: string) => {
      const separator = identity.indexOf("\0");
      return { centerId: identity.slice(0, separator), externalId: identity.slice(separator + 1) };
    };
    const familyExternalIds = new Set<string>();
    const childExternalIds = new Set<string>();
    const guardianExternalIds = new Set<string>();
    const emergencyContactExternalIds = new Set<string>();
    const authorizedPickupExternalIds = new Set<string>();
    const staffExternalIds = new Set<string>();
    const classroomExternalIds = new Set<string>();
    const balancesByFamily = new Map<string, number>();
    let familiesComplete = true;
    let childrenComplete = true;
    let guardiansComplete = true;
    let emergencyContactsComplete = true;
    let authorizedPickupsComplete = true;
    let staffComplete = true;
    let balancesComplete = true;
    let hasFamilyRows = false;
    let hasChildRows = false;
    let hasGuardianRows = false;
    let hasEmergencyContactRows = false;
    let hasAuthorizedPickupRows = false;
    let hasStaffRows = false;
    let hasClassroomRows = false;
    let hasBalanceRows = false;

    for (const { raw, centerId: mappedCenterId } of importedRecords) {
      const familyName = procareFamilyName(raw);
      const childName = procareChildFullName(raw);
      const employeeName = procareStaffName(raw);
      const accountExternalId = externalValue(raw, ["account key", "account id", "account number", "account no", "family id", "family key", "key", "procare account id"]);
      const childExternalId = externalValue(raw, ["child id", "child key", "student id", "student key", "person id", "procare child id"]);
      const childPersonExternalId = externalValue(raw, ["child person id"]) ?? "";
      const isStaffRow = Boolean(employeeName && !childName && !familyName);
      if (isStaffRow) {
        hasStaffRows = true;
        const staffExternalId = externalValue(raw, ["employee id", "staff id", "teacher id", "employee key", "person id"]);
        if (staffExternalId) staffExternalIds.add(scopedIdentity(mappedCenterId, staffExternalId)); else staffComplete = false;
        continue;
      }

      hasFamilyRows = true;
      if (accountExternalId) familyExternalIds.add(scopedIdentity(mappedCenterId, accountExternalId)); else familiesComplete = false;
      if (childName) {
        hasChildRows = true;
        if (childExternalId) childExternalIds.add(scopedIdentity(mappedCenterId, childExternalId)); else childrenComplete = false;
      }
      const classroomName = procareClassroomName(raw);
      if (classroomName) {
        hasClassroomRows = true;
        classroomExternalIds.add(scopedIdentity(mappedCenterId, externalValue(raw, ["classroom id", "room id", "class id", "classroom key", "room key"]) || classroomName));
      }

      const guardianCandidates = [
        {
          id: externalValue(raw, ["payer id", "primary payer id", "guardian id", "parent id", "payer 1 id", "primary parent id"]),
          present: Boolean(value(raw, ["guardian name", "parent/guardian", "parent name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent", "mother", "father", "email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email", "phone", "guardian phone", "parent phone", "primary phone", "payer phone", "payer 1 phone", "primary payer phone"])),
        },
        {
          id: externalValue(raw, ["secondary guardian id", "secondary payer id", "parent 2 id", "payer 2 id"]),
          present: Boolean(value(raw, ["secondary guardian", "secondary payer", "secondary parent", "parent 2", "payer 2", "spouse", "secondary email", "secondary guardian email", "secondary payer email", "parent 2 email", "payer 2 email", "secondary phone", "secondary guardian phone", "secondary payer phone", "parent 2 phone", "payer 2 phone"])),
        },
      ];
      if (hasImportField(raw, ["procare relationship records"])) {
        hasGuardianRows = true;
        hasEmergencyContactRows = true;
        hasAuthorizedPickupRows = true;
        try {
          const relationships = JSON.parse(value(raw, ["procare relationship records"]) || "[]") as unknown;
          if (!Array.isArray(relationships)) throw new Error("ProCare relationship records must be an array.");
          for (const relationship of relationships) {
            if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) continue;
            const record = relationship as ProcareRelationshipRecord;
            const relationshipId = clean(record.externalId);
            if (relationshipId && relationshipId === childPersonExternalId) continue;
            if (record.guardian) guardianCandidates.push({ id: relationshipId || null, present: true });
            if (record.emergency) {
              if (relationshipId) emergencyContactExternalIds.add(scopedIdentity(mappedCenterId, relationshipId));
              else emergencyContactsComplete = false;
            }
            if (record.authorizedPickup) {
              if (relationshipId) authorizedPickupExternalIds.add(scopedIdentity(mappedCenterId, relationshipId));
              else authorizedPickupsComplete = false;
            }
          }
        } catch {
          guardiansComplete = false;
          emergencyContactsComplete = false;
          authorizedPickupsComplete = false;
        }
      }
      try {
        const accountPeople = JSON.parse(value(raw, ["procare account person records"]) || "[]") as unknown;
        if (Array.isArray(accountPeople)) {
          for (const person of accountPeople) {
            if (!person || typeof person !== "object") continue;
            const fields = embeddedImportRecord(person);
            if (value(fields, ["person type", "type"]).toLowerCase() !== "payer") continue;
            const guardianExternalId = externalValue(fields, ["person id", "payer id", "parent id"]);
            if (guardianExternalId && guardianExternalId === childPersonExternalId) continue;
            guardianCandidates.push({ id: guardianExternalId, present: true });
          }
        }
      } catch { /* Invalid account-person JSON is already retained in the reviewed source row. */ }
      for (const guardian of guardianCandidates) {
        if (!guardian.present) continue;
        if (guardian.id && guardian.id === childPersonExternalId) continue;
        hasGuardianRows = true;
        if (guardian.id) guardianExternalIds.add(scopedIdentity(mappedCenterId, guardian.id)); else guardiansComplete = false;
      }
      if (!accountExternalId) {
        if (hasGuardianRows) guardiansComplete = false;
        if (hasEmergencyContactRows) emergencyContactsComplete = false;
        if (hasAuthorizedPickupRows) authorizedPickupsComplete = false;
      }

      const balanceAliases = ["balance", "account balance", "ledger balance", "amount due"];
      const balanceSourceValue = value(raw, balanceAliases);
      if (hasImportField(raw, balanceAliases) && balanceSourceValue) {
        hasBalanceRows = true;
        if (!accountExternalId) {
          balancesComplete = false;
        } else {
          const parsedBalance = parseCurrencyCents(balanceSourceValue);
          if (!parsedBalance.valid) {
            balancesComplete = false;
            continue;
          }
          const importedBalance = parsedBalance.cents;
          const balanceIdentity = scopedIdentity(mappedCenterId, accountExternalId);
          const priorBalance = balancesByFamily.get(balanceIdentity);
          if (priorBalance !== undefined && priorBalance !== importedBalance) balancesComplete = false;
          balancesByFamily.set(balanceIdentity, importedBalance);
        }
      }
    }

    const familyScopes = [...familyExternalIds].map(scopedIdentityParts);
    const childScopes = [...childExternalIds].map(scopedIdentityParts);
    const staffScopes = [...staffExternalIds].map(scopedIdentityParts);
    const classroomScopes = [...classroomExternalIds].map(scopedIdentityParts);
    const balanceScopes = [...balancesByFamily.keys()].map(scopedIdentityParts);
    const procareRelationshipRowsAcrossSourceFamilies = familyScopes.map(({ centerId, externalId }) => ({
      family: { centerId, sourceSystem: "procare", externalId },
      sourceSystem: "procare",
      externalId: { not: null },
    }));
    const [families, children, guardians, emergencyContacts, authorizedPickups, staff, classrooms, billingBalances] = await Promise.all([
      familyScopes.length ? prisma.family.count({ where: { OR: familyScopes.map(({ centerId, externalId }) => ({ centerId, sourceSystem: "procare", externalId })) } }) : Promise.resolve(0),
      childScopes.length ? prisma.child.count({ where: { OR: childScopes.map(({ centerId, externalId }) => ({ family: { centerId }, sourceSystem: "procare", externalId })) } }) : Promise.resolve(0),
      procareRelationshipRowsAcrossSourceFamilies.length ? prisma.guardian.count({ where: { OR: procareRelationshipRowsAcrossSourceFamilies } }) : Promise.resolve(0),
      procareRelationshipRowsAcrossSourceFamilies.length ? prisma.emergencyContact.count({ where: { OR: procareRelationshipRowsAcrossSourceFamilies } }) : Promise.resolve(0),
      procareRelationshipRowsAcrossSourceFamilies.length ? prisma.authorizedPickup.count({ where: { OR: procareRelationshipRowsAcrossSourceFamilies } }) : Promise.resolve(0),
      staffScopes.length ? prisma.staffProfile.count({ where: { OR: staffScopes.map(({ centerId, externalId }) => ({ centerId, sourceSystem: "procare", externalId })) } }) : Promise.resolve(0),
      classroomScopes.length ? prisma.classroom.count({ where: { OR: classroomScopes.map(({ centerId, externalId }) => ({ centerId, sourceSystem: "procare", externalId })) } }) : Promise.resolve(0),
      balanceScopes.length
        ? prisma.billingAccount.aggregate({
            where: { OR: balanceScopes.map(({ centerId, externalId }) => ({ family: { centerId, sourceSystem: "procare", externalId } })) },
            _sum: { balanceCents: true },
          })
        : Promise.resolve({ _sum: { balanceCents: null } }),
    ]);
    const summary = batch.summary && typeof batch.summary === "object" && !Array.isArray(batch.summary)
      ? batch.summary as Record<string, unknown>
      : {};
    const report = buildProcareReconciliationReport({
      batchId: batch.id,
      sourceSha256: typeof summary.sourceSha256 === "string" ? summary.sourceSha256 : undefined,
      batchStatus: batch.status,
      importedRows: batch.rows.filter((row) => row.status === "imported").length,
      errorRows: batch.rows.filter((row) => row.status !== "imported").length,
      reviewedRows: batch.rows.length,
      disposedRows: batch.rows.filter((row) => row.status === "disposed").length,
      unresolvedRows: batch.rows.filter((row) => row.status === "needs_resolution").length,
      source: {
        families: hasFamilyRows && familiesComplete ? familyExternalIds.size : null,
        children: hasChildRows && childrenComplete ? childExternalIds.size : null,
        guardians: hasGuardianRows && guardiansComplete ? guardianExternalIds.size : null,
        emergencyContacts: hasEmergencyContactRows && emergencyContactsComplete ? emergencyContactExternalIds.size : null,
        authorizedPickups: hasAuthorizedPickupRows && authorizedPickupsComplete ? authorizedPickupExternalIds.size : null,
        staff: hasStaffRows && staffComplete ? staffExternalIds.size : null,
        classrooms: hasClassroomRows ? classroomExternalIds.size : null,
        balanceCents: hasBalanceRows && balancesComplete ? [...balancesByFamily.values()].reduce((sum, amount) => sum + amount, 0) : null,
        creditsCents: null,
        openInvoicesCents: null,
      },
      target: {
        families: hasFamilyRows && familiesComplete ? families : null,
        children: hasChildRows && childrenComplete ? children : null,
        guardians: hasGuardianRows && guardiansComplete ? guardians : null,
        emergencyContacts: hasEmergencyContactRows && emergencyContactsComplete ? emergencyContacts : null,
        authorizedPickups: hasAuthorizedPickupRows && authorizedPickupsComplete ? authorizedPickups : null,
        staff: hasStaffRows && staffComplete ? staff : null,
        classrooms: hasClassroomRows ? classrooms : null,
        balanceCents: hasBalanceRows && balancesComplete ? billingBalances._sum.balanceCents ?? 0 : null,
        creditsCents: null,
        openInvoicesCents: null,
      },
    });
    await writeAuditLog(user, {
      centerId: batch.centerId,
      action: "procare.import.reconciliation_exported",
      resource: "ProcareImportBatch",
      resourceId: batch.id,
      metadata: { decision: report.decision, sourceSha256: report.sourceSha256 },
    });
    return NextResponse.json({
      ok: true,
      report,
      retention: {
        rawRowsReviewDue: procareRetentionReviewDue(batch.createdAt).toISOString(),
        enforcementPoint: "Deletion requires approved retention ownership and a separately authorized audited cleanup action.",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const exportPayload = {
    exportType: "procare_import_backup",
    exportedAt: new Date().toISOString(),
    exportedBy: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    batch: {
      id: batch.id,
      filename: batch.filename,
      status: batch.status,
      summary: batch.summary,
      createdAt: batch.createdAt,
      rawRowsRetentionReviewDue: procareRetentionReviewDue(batch.createdAt),
      center: batch.center,
      uploadedBy: batch.uploadedBy,
    },
    rows: batch.rows,
  };

  await writeAuditLog(user, {
    centerId: batch.centerId,
    action: "procare.import.backup_exported",
    resource: "ProcareImportBatch",
    resourceId: batch.id,
    metadata: {
      filename: batch.filename,
      rowCount: batch.rows.length,
      status: batch.status,
    },
  });

  const centerLabel = batch.center.crmLocationId || batch.center.name;
  const filename = `${safeBackupFilename(centerLabel)}-${safeBackupFilename(batch.filename)}-${batch.id}.json`;
  return new Response(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "ProCare imports are not allowed for this role." }, { status: 403 });
  }

  const formData = await request.formData();
  const requestedCenterId = clean(formData.get("centerId"));
  const dryRun = clean(formData.get("dryRun")).toLowerCase() === "true";
  const duplicateMode = duplicateMatchMode(clean(formData.get("duplicateMatchMode")));
  const duplicateReviewConfirmed = clean(formData.get("duplicateReviewConfirmed")).toLowerCase() === "true";
  const sourceInventoryConfirmed = clean(formData.get("sourceInventoryConfirmed")).toLowerCase() === "true";
  const submittedSourceSha256 = clean(formData.get("sourceSha256"));
  const submittedReviewFingerprint = clean(formData.get("reviewFingerprint"));
  const submittedWarningRowNumbers = parseImportRowNumbers(clean(formData.get("reviewWarningRowNumbers")));
  const submittedDuplicateReviewRowNumbers = parseImportRowNumbers(clean(formData.get("reviewDuplicateWarningRowNumbers")));
  const submittedCorrelationConfirmations = new Set(
    clean(formData.get("correlationConfirmations")).split(",").map(clean).filter(Boolean),
  );
  const requestedBatchId = clean(formData.get("batchId"));
  const chunkSizeInput = clean(formData.get("chunkSize"));
  const parsedChunkSize = Number.parseInt(chunkSizeInput, 10);
  const requestedChunkSize = Number.isInteger(parsedChunkSize) && parsedChunkSize > 0
    ? Math.min(parsedChunkSize, 20)
    : Number.MAX_SAFE_INTEGER;
  if (!dryRun && !chunkSizeInput) {
    return NextResponse.json({ ok: false, error: "This import page is out of date. Refresh the page, select the ProCare export again, and restart the import." }, { status: 409 });
  }
  let fieldMapping: ProcareFieldMapping = {};
  try {
    const mappingJson = clean(formData.get("fieldMapping"));
    fieldMapping = mappingJson ? JSON.parse(mappingJson) as ProcareFieldMapping : {};
  } catch {
    return NextResponse.json({ ok: false, error: "The ProCare field mapping is invalid. Review the column matches and try again." }, { status: 400 });
  }
  const autoMap = ["auto", "all", "bulk", ""].includes(requestedCenterId.toLowerCase()) && canAccessAllCenters(user);
  const centerId = autoMap ? "" : requestedCenterId || user.primaryCenterId;
  const files = formData.getAll("file");
  const pastedCsv = clean(formData.get("csv"));
  if (!centerId && !autoMap) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
  if (centerId && !canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });

  const visibleCenterRows = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      ...(user.role === "PLATFORM_OWNER" ? {} : { id: { in: user.centerIds.length ? user.centerIds : ["__none__"] } }),
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
      name: true,
      crmLocationId: true,
      locationId: true,
      city: true,
      state: true,
    },
  });
  const visibleCenters: ImportCenter[] = visibleCenterRows.map(({ organization, ...item }) => ({
    ...item,
    tenantId: organization.tenantId,
  }));
  const center = autoMap
    ? visibleCenters[0] ?? null
    : visibleCenters.find((item) => item.id === centerId) ?? null;
  if (!center) return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  const centerByAlias = buildCenterAliasMap(visibleCenters);

  let importPayload: Awaited<ReturnType<typeof readImportText>>;
  try {
    importPayload = await readImportText(files, pastedCsv);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ProCare export could not be read." },
      { status: 400 },
    );
  }
  const text = importPayload.text;
  if (!text) return NextResponse.json({ ok: false, error: "Upload ProCare CSV files, a ZIP export, or paste CSV text." }, { status: 400 });

  const rows = importPayload.parsedRows ?? parseImportRows(text);
  const sourceHeaders = rows[0]?.map((header) => header.trim().replace(/^\ufeff/, "")) ?? [];
  const headerAnalysis = analyzeProcareHeaders(sourceHeaders);
  const headers = applyProcareFieldMapping(sourceHeaders, fieldMapping);
  const correlationReview = buildProcareCorrelationReview(sourceHeaders, fieldMapping, importPayload.sourceType);
  if (rows.length < 2 || !headers.length) {
    return NextResponse.json({ ok: false, error: "No import rows found." }, { status: 400 });
  }

  const duplicateTargets = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateTargets.length) {
    return NextResponse.json({ ok: false, error: `Each ProCare column must map to a different BEE Suite field. Duplicate mapping: ${[...new Set(duplicateTargets)].join(", ")}.` }, { status: 400 });
  }
  const mappingSignature = JSON.stringify(Object.entries(fieldMapping).sort(([a], [b]) => a.localeCompare(b)));
  const sourceSha256 = procareSourceSha256(text);
  const buildReviewFingerprint = (warningRowNumbers: number[], duplicateReviewRowNumbers: number[]) => (
    procareImportReviewFingerprint({
      text: importReviewEvidence({ sourceSha256, mappingSignature, warningRowNumbers, duplicateReviewRowNumbers }),
      requestedCenterId,
      duplicateMode,
      secret: process.env.AUTH_SECRET || "development-procare-import-review",
    })
  );

  if (dryRun) {
    const preview = await previewImportRows({
      rows,
      headers,
      autoMap,
      defaultCenter: center,
      centerByAlias,
      sourceType: importPayload.sourceType,
      filename: importPayload.filename,
      duplicateMode,
    });
    const reviewFingerprint = buildReviewFingerprint(preview.warningRowNumbers, preview.duplicateReviewRowNumbers);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      summary: { ...preview, sourceSha256, reviewFingerprint, headerAnalysis, fieldOptions: PROCARE_FIELD_OPTIONS, correlationReview, datasetCoverage: importPayload.datasetCoverage ?? null },
    });
  }

  if (importPayload.datasetCoverage && !sourceInventoryConfirmed) {
    return NextResponse.json({
      ok: false,
      error: "Confirm the detected ProCare source inventory before importing.",
    }, { status: 409 });
  }

  const missingCorrelationConfirmations = correlationReview
    .filter((section) => section.required && !submittedCorrelationConfirmations.has(section.id))
    .map((section) => section.title);
  if (missingCorrelationConfirmations.length) {
    return NextResponse.json({
      ok: false,
      error: `Confirm the reviewed ProCare correlations in order before importing: ${missingCorrelationConfirmations.join(", ")}.`,
    }, { status: 409 });
  }

  const reviewFingerprint = buildReviewFingerprint(submittedWarningRowNumbers, submittedDuplicateReviewRowNumbers);
  if (submittedSourceSha256 !== sourceSha256 || submittedReviewFingerprint !== reviewFingerprint) {
    return NextResponse.json(
      { ok: false, error: "Submit this unchanged ProCare export for review before importing it." },
      { status: 409 },
    );
  }

  const requestedBatch = requestedBatchId
    ? await prisma.procareImportBatch.findFirst({ where: { id: requestedBatchId, centerId: center.id, uploadedById: user.id, status: "processing" }, include: { _count: { select: { rows: true } } } })
    : null;
  if (requestedBatchId && !requestedBatch) return NextResponse.json({ ok: false, error: "The resumable ProCare import batch could not be found." }, { status: 409 });
  const resumableCandidates = requestedBatch ? [] : await prisma.procareImportBatch.findMany({
    where: { centerId: center.id, uploadedById: user.id, status: "processing" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { _count: { select: { rows: true } } },
  });
  const existingBatch = requestedBatch ?? resumableCandidates
    .filter((candidate) => {
      const summary = candidate.summary && typeof candidate.summary === "object" && !Array.isArray(candidate.summary)
        ? candidate.summary as Record<string, unknown>
        : {};
      return summary.sourceSha256 === sourceSha256 && summary.reviewFingerprint === reviewFingerprint;
    })
    .sort((left, right) => right._count.rows - left._count.rows)[0] ?? null;
  const existingSummary = existingBatch?.summary && typeof existingBatch.summary === "object" && !Array.isArray(existingBatch.summary)
    ? existingBatch.summary as Record<string, unknown>
    : {};
  if (existingBatch && (
    existingSummary.sourceSha256 !== sourceSha256
    || existingSummary.reviewFingerprint !== reviewFingerprint
  )) {
    return NextResponse.json({ ok: false, error: "The reviewed files, field mapping, or duplicate mode changed while the import was running. Start a new import with one unchanged review." }, { status: 409 });
  }

  let stagedRowNumbers = new Set<number>();
  let duplicateReviewRows = Number(existingSummary.duplicateReviewRows ?? 0);
  const validationWarningMessages = new Map<number, string>();
  if (existingBatch && Array.isArray(existingSummary.stagedRowNumbers)) {
    stagedRowNumbers = new Set(existingSummary.stagedRowNumbers.filter((value): value is number => Number.isInteger(value)));
    const savedWarnings = existingSummary.validationWarnings && typeof existingSummary.validationWarnings === "object" && !Array.isArray(existingSummary.validationWarnings)
      ? existingSummary.validationWarnings as Record<string, unknown>
      : {};
    for (const [rowNumber, message] of Object.entries(savedWarnings)) {
      if (typeof message === "string") validationWarningMessages.set(Number(rowNumber), message);
    }
  } else {
    const duplicateWarningRows = new Set(submittedDuplicateReviewRowNumbers);
    stagedRowNumbers = new Set(submittedWarningRowNumbers.filter((rowNumber) => (
      !duplicateReviewConfirmed || !duplicateWarningRows.has(rowNumber)
    )));
    duplicateReviewRows = submittedDuplicateReviewRowNumbers.length;
    for (const rowNumber of stagedRowNumbers) {
      validationWarningMessages.set(rowNumber, "This reviewed row needs a field match or disposition before it can be imported.");
    }
  }
  const disposedRowNumbers = new Set(
    clean(formData.get("disposedRowNumbers")).split(",").map(Number).filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1),
  );

  let createdFamilies = 0;
  let updatedFamilies = 0;
  let createdChildren = 0;
  let ledgerRows = 0;
  let createdClassrooms = 0;
  let createdStaff = 0;
  let updatedStaff = 0;
  let createdStaffLogins = 0;
  let emergencyContacts = 0;
  let authorizedPickups = 0;
  let medicalRows = 0;
  let attendanceRows = 0;
  let checkLogRows = 0;
  let invoiceRows = 0;
  const centersTouched = new Set(
    Array.isArray(existingSummary.centerIdsTouched)
      ? existingSummary.centerIdsTouched.filter((centerId): centerId is string => typeof centerId === "string")
      : [],
  );
  const rowResults: Array<{ rowNumber: number; status: string; message?: string; rawData: Record<string, string>; createdFamilyId?: string; createdChildId?: string }> = [];

  const batch = existingBatch ?? await prisma.procareImportBatch.create({
    data: {
      centerId: center.id,
      uploadedById: user.id,
      filename: importPayload.filename,
      status: "processing",
      summary: {
        sourceType: importPayload.sourceType,
        sourceSha256,
        reviewFingerprint,
        mappingSignature,
        stagedRowNumbers: [...stagedRowNumbers],
        duplicateReviewRows,
        validationWarnings: Object.fromEntries(validationWarningMessages),
      },
    },
  });
  const savedRowNumbers = existingBatch
    ? await prisma.procareImportRow.findMany({
        where: { batchId: existingBatch.id },
        orderBy: { rowNumber: "asc" },
        select: { rowNumber: true },
      })
    : [];
  let chunkStart = 1;
  for (const savedRow of savedRowNumbers) {
    if (savedRow.rowNumber === chunkStart + 1) chunkStart += 1;
    else if (savedRow.rowNumber > chunkStart + 1) break;
  }
  chunkStart = Math.min(chunkStart, rows.length);
  const chunkEnd = Math.min(chunkStart + requestedChunkSize, rows.length);
  const completeRelationshipIdsByAccount = new Map<string, { guardians: Set<string>; emergency: Set<string>; pickup: Set<string> }>();
  for (let sourceIndex = 1; sourceIndex < rows.length; sourceIndex += 1) {
    const sourceRawData = Object.fromEntries(headers.map((header, column) => [header, rows[sourceIndex]?.[column] ?? ""]));
    if (!hasImportField(sourceRawData, ["procare relationship records"])) continue;
    const sourceAccountExternalId = externalValue(sourceRawData, ["account key", "account id", "account number", "account no", "family id", "family key", "key", "procare account id"]);
    if (!sourceAccountExternalId) continue;
    const sourceChildPersonExternalId = externalValue(sourceRawData, ["child person id"]) ?? "";
    const sourceCenterValue = value(sourceRawData, [
      "location id", "crm location id", "school id", "school", "school name", "center", "center name", "location", "site",
    ]);
    const sourceCenter = autoMap ? resolveImportCenter(centerByAlias, sourceCenterValue) : center;
    if (!sourceCenter) continue;
    try {
      const parsed = JSON.parse(value(sourceRawData, ["procare relationship records"]) || "[]") as unknown;
      if (!Array.isArray(parsed)) continue;
      const key = `${sourceCenter.id}\0${sourceAccountExternalId}`;
      const desired = completeRelationshipIdsByAccount.get(key) ?? { guardians: new Set<string>(), emergency: new Set<string>(), pickup: new Set<string>() };
      for (const guardianId of [
        externalValue(sourceRawData, ["payer id", "primary payer id", "guardian id", "parent id", "payer 1 id", "primary parent id"]),
        externalValue(sourceRawData, ["secondary guardian id", "secondary payer id", "parent 2 id", "payer 2 id"]),
      ]) {
        if (guardianId && guardianId !== sourceChildPersonExternalId) desired.guardians.add(guardianId);
      }
      try {
        const accountPeople = JSON.parse(value(sourceRawData, ["procare account person records"]) || "[]") as unknown;
        if (Array.isArray(accountPeople)) {
          for (const person of accountPeople) {
            const fields = embeddedImportRecord(person);
            if (value(fields, ["person type", "type"]).toLowerCase() !== "payer") continue;
            const guardianId = externalValue(fields, ["person id", "payer id", "parent id"]);
            if (guardianId && guardianId !== sourceChildPersonExternalId) desired.guardians.add(guardianId);
          }
        }
      } catch {
        continue;
      }
      for (const relationship of procareRelationshipRecords(sourceRawData)) {
        const relationshipExternalId = clean(relationship.externalId);
        if (!relationshipExternalId) continue;
        if (relationshipExternalId === sourceChildPersonExternalId) continue;
        if (relationship.guardian) desired.guardians.add(relationshipExternalId);
        if (relationship.emergency) desired.emergency.add(relationshipExternalId);
        if (relationship.authorizedPickup) desired.pickup.add(relationshipExternalId);
      }
      completeRelationshipIdsByAccount.set(key, desired);
    } catch {
      // Malformed relationship JSON is retained for review and never drives destructive reconciliation.
    }
  }

  for (let index = chunkStart; index < chunkEnd; index += 1) {
    const rawData = Object.fromEntries(headers.map((header, column) => [header, rows[index]?.[column] ?? ""]));
    const rowNumber = index + 1;
    const checkpointCenterValue = value(rawData, [
      "location id", "crm location id", "school id", "school", "school name", "center", "center name", "location", "site",
    ]);
    const checkpointCenter = autoMap ? resolveImportCenter(centerByAlias, checkpointCenterValue) : center;
    if (checkpointCenter) {
      centersTouched.add(checkpointCenter.id);
      rawData.mappedCenterId = checkpointCenter.id;
      rawData.mappedCenter = checkpointCenter.crmLocationId ?? checkpointCenter.name;
    }
    if (disposedRowNumbers.has(rowNumber)) {
      rowResults.push({ rowNumber, status: "disposed", message: "Disposed by the user during import reconciliation.", rawData });
      continue;
    }
    if (stagedRowNumbers.has(rowNumber)) {
      const warning = validationWarningMessages.get(rowNumber) ?? "This row needs a field match or disposition.";
      rowResults.push({ rowNumber, status: "needs_resolution", message: warning, rawData });
      continue;
    }
    const rowCounterSnapshot = {
      createdFamilies,
      updatedFamilies,
      createdChildren,
      ledgerRows,
      createdClassrooms,
      createdStaff,
      updatedStaff,
      createdStaffLogins,
      emergencyContacts,
      authorizedPickups,
      medicalRows,
      attendanceRows,
      checkLogRows,
      invoiceRows,
    };
    try {
      const rowCenterValue = value(rawData, [
        "location id",
        "crm location id",
        "school id",
        "school",
        "school name",
        "center",
        "center name",
        "location",
        "site",
      ]);
      const targetCenter = autoMap
        ? resolveImportCenter(centerByAlias, rowCenterValue)
        : center;
      if (!targetCenter) {
        throw new Error(`Could not map row to a center from "${rowCenterValue || "blank location"}".`);
      }
      centersTouched.add(targetCenter.id);
      const employeeName = procareStaffName(rawData);
      const employeeEmail = value(rawData, ["employee email", "staff email", "teacher email", "work email", "email"]);
      const employeeExternalId = externalValue(rawData, ["employee id", "staff id", "teacher id", "employee key", "person id"]);
      if (employeeName && !procareChildFullName(rawData) && !procareFamilyName(rawData)) {
        const staffContactEmail = normalizedStaffContactEmail(employeeEmail);
        const existingStaff = await findExistingImportedStaffProfile({
          centerId: targetCenter.id,
          externalId: employeeExternalId,
          contactEmail: staffContactEmail,
          rejectAmbiguous: true,
        });
        if (existingStaff && existingStaff.user.tenantId !== targetCenter.tenantId) {
          throw new Error("The matched staff login belongs to a different tenant than the mapped school.");
        }
        const generatedLogin = existingStaff
          ? undefined
          : await generateTeacherLoginCredentials({
              fullName: employeeName,
              emailExists: (candidate) => prisma.user.findUnique({ where: { email: candidate }, select: { id: true } }).then(Boolean),
            });
        const canCreateSupabaseStaffAuth = hasSupabaseAdminAuthConfig();
        if (generatedLogin && canCreateSupabaseStaffAuth) {
          await upsertSupabaseAuthUserWithPassword({
            email: generatedLogin.email,
            name: employeeName,
            password: generatedLogin.temporary_password,
            role: UserRole.TEACHER,
            source: "bee_suite_procare_staff_import",
          });
          createdStaffLogins += 1;
        }
        const staffClassroomName = procareClassroomName(rawData);
        const employeeStatus = value(rawData, ["employee status", "staff status", "teacher status"]);
        const employeeStatusProvided = Boolean(employeeStatus);
        const employeeIsActive = isActiveProcareStaffStatus(employeeStatus);
        const staffTitle = value(rawData, ["title", "position", "job title", "role"]);
        const staffPhone = value(rawData, ["employee phone", "staff phone", "teacher phone", "phone"]);
        const backgroundCheckStatus = value(rawData, ["background check", "background check status"]);
        const staffWrite = await prisma.$transaction(async (tx) => {
          let staffClassroomId: string | null = null;
          let createdStaffClassroom = false;
          if (staffClassroomName) {
            const classroom = await findOrCreateClassroom({
              centerId: targetCenter.id,
              name: staffClassroomName,
              ageGroup: procareAgeGroup(rawData, "Staff assignment"),
              rawData,
            }, tx);
            staffClassroomId = classroom.id;
            createdStaffClassroom = classroom.created;
          }
          const staffUser = existingStaff
            ? await tx.user.update({
                where: { id: existingStaff.userId },
                data: {
                  name: employeeName,
                  ...(employeeStatusProvided ? { isActive: employeeIsActive } : {}),
                  organizationId: targetCenter.organizationId,
                },
                select: { id: true },
              })
            : await tx.user.create({
                data: {
                  tenantId: targetCenter.tenantId,
                  organizationId: targetCenter.organizationId,
                  email: generatedLogin!.email,
                  name: employeeName,
                  role: UserRole.TEACHER,
                  isActive: employeeIsActive,
                  mustResetPassword: true,
                },
                select: { id: true },
              });
          if (!existingStaff || existingStaff.user.role === UserRole.TEACHER) {
            await ensureTeacherCenterGrant({
              userId: staffUser.id,
              tenantId: targetCenter.tenantId,
              organizationId: targetCenter.organizationId,
              centerId: targetCenter.id,
            }, tx);
          }
          const importedCustomFields = metadataFromRow(rawData, {
            mappedCenterId: targetCenter.id,
            ...(staffContactEmail ? { staffContactEmail } : {}),
            employeeStatus,
            employeeStatusDate: value(rawData, ["status date", "employee status date"]),
            primaryWorkArea: value(rawData, ["primary work area", "work area"]),
            ...(generatedLogin ? { generatedTeacherLoginEmail: generatedLogin.email, supabaseAuthUserCreated: canCreateSupabaseStaffAuth } : {}),
          });
          if (existingStaff) {
            await tx.staffProfile.update({
              where: { id: existingStaff.id },
              data: {
                centerId: targetCenter.id,
                ...(staffClassroomName ? { classroomId: staffClassroomId } : {}),
                ...(staffTitle ? { title: staffTitle } : {}),
                ...(staffPhone ? { phone: staffPhone } : {}),
                ...(backgroundCheckStatus ? { backgroundCheckStatus } : {}),
                sourceSystem: "procare",
                ...(employeeExternalId ? { externalId: employeeExternalId } : {}),
                customFields: mergeCustomFields(existingStaff.customFields, importedCustomFields),
              },
            });
          } else {
            await tx.staffProfile.create({
              data: {
                userId: staffUser.id,
                centerId: targetCenter.id,
                classroomId: staffClassroomId,
                title: staffTitle || "Teacher",
                phone: staffPhone || null,
                backgroundCheckStatus: backgroundCheckStatus || null,
                sourceSystem: "procare",
                externalId: employeeExternalId,
                customFields: importedCustomFields,
              },
            });
          }
          if (generatedLogin) {
            await tx.auditLog.create({
              data: {
                tenantId: user.tenantId,
                centerId: targetCenter.id,
                userId: user.id,
                action: "teacher_user_created",
                resource: "User",
                resourceId: staffUser.id,
                metadata: {
                  email: generatedLogin.email,
                  source: "procare_import",
                  batchId: batch.id,
                },
              },
            });
          }
          return { staffUserId: staffUser.id, createdStaffClassroom };
        }, { maxWait: 10_000, timeout: 60_000 });
        if (staffWrite.createdStaffClassroom) createdClassrooms += 1;
        if (existingStaff) updatedStaff += 1; else createdStaff += 1;
        rowResults.push({
          rowNumber: index + 1,
          status: "imported",
          rawData: {
            ...rawData,
            mappedCenterId: targetCenter.id,
            mappedEntity: "staff",
            ...(generatedLogin ? { teacherLoginEmail: generatedLogin.email } : {}),
          },
        });
        continue;
      }

      const accountExternalId = externalValue(rawData, ["account key", "account id", "account number", "account no", "family id", "family key", "key", "procare account id"]);
      const familyName = procareFamilyName(rawData);
      const childName = procareChildFullName(rawData);
      const childExternalId = externalValue(rawData, ["child id", "child key", "student id", "student key", "person id", "procare child id"]);
      const email = value(rawData, ["email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email"]).toLowerCase();
      const address = value(rawData, ["address", "street address", "home address", "mailing address", "primary address", "payer address"]);
      const childPersonExternalId = externalValue(rawData, ["child person id"]) ?? "";
      const guardianImports = procareGuardianImports(rawData, childPersonExternalId);
      const balanceValue = value(rawData, ["balance", "account balance", "ledger balance", "amount due"]);
      const parsedBalance = parseCurrencyCents(balanceValue);
      if (parsedBalance.present && !parsedBalance.valid) {
        throw new Error("The ProCare balance is not a valid currency amount. Correct the source value before importing this row.");
      }
      const balanceCents = parsedBalance.cents;
      const classroomAliases = ["classroom", "classroom name", "room", "room name", "class", "assigned classroom", "assigned room"];
      const enrollmentStatusAliases = ["child status", "status", "enrollment status", "student status"];
      const ageGroupAliases = ["age group", "program", "class", "room", ...classroomAliases];
      const preferredNameAliases = ["preferred name", "nickname", "goes by", "first name", "child first name", "student first name"];
      const classroomName = procareClassroomName(rawData);
      const ageGroup = procareAgeGroup(rawData, "Unassigned");
      const enrollmentStatusValue = value(rawData, enrollmentStatusAliases);
      const enrollmentStatusProvided = Boolean(enrollmentStatusValue);
      const enrollmentStatus = normalizeProcareEnrollmentStatus(enrollmentStatusValue, "review_needed");
      const familyDisplayName = familyName || (accountExternalId ? `${accountExternalId} Household` : childName || email);
      if (!familyName && !childName && !email) throw new Error("Missing family, child, or email fields.");

      const familyWrite = await prisma.$transaction(async (prisma) => {
      const fallbackFamilyMatchers = [
        familyName ? { name: familyName } : undefined,
        email ? { billingEmail: email } : undefined,
      ].filter(Boolean) as Array<{ name?: string; billingEmail?: string }>;
      const fallbackFamilies = accountExternalId || !fallbackFamilyMatchers.length
        ? []
        : await prisma.family.findMany({
            where: { centerId: targetCenter.id, OR: fallbackFamilyMatchers },
            take: 2,
            select: { id: true, customFields: true },
          });
      const externalFamilies = accountExternalId
        ? await prisma.family.findMany({
            where: { centerId: targetCenter.id, sourceSystem: "procare", externalId: accountExternalId },
            take: 2,
            select: { id: true, customFields: true },
          })
        : [];
      if (externalFamilies.length > 1) {
        throw new Error("Multiple existing families use this ProCare Account ID. Resolve the duplicate records before importing.");
      }
      if (fallbackFamilies.length > 1) {
        throw new Error("Multiple existing families match this row without a ProCare Account ID. Add the account relationship before importing.");
      }
      const familyMetadata = metadataFromRow(rawData, {
        mappedCenterId: targetCenter.id,
        procareAccountKey: accountExternalId,
        accountTracking: value(rawData, ["tracking", "account tracking", "family tracking"]),
      });
      const existing = accountExternalId
        ? externalFamilies[0] ?? null
        : fallbackFamilies[0] ?? null;
      const custodyNotes = value(rawData, ["custody notes", "custody", "legal custody", "court order", "court orders"]);

      const family = existing
        ? await prisma.family.update({
            where: { id: existing.id },
            data: {
              ...(familyName ? { name: familyName } : {}),
              billingEmail: email || undefined,
              address: address || undefined,
              custodyNotes: custodyNotes || undefined,
              sourceSystem: "procare",
              externalId: accountExternalId || undefined,
              customFields: mergeCustomFields(existing.customFields, familyMetadata),
            },
          })
        : await prisma.family.create({
            data: {
              centerId: targetCenter.id,
              name: familyDisplayName,
              billingEmail: email || null,
              address: address || null,
              notes: "Imported from ProCare export.",
              custodyNotes: custodyNotes || null,
              sourceSystem: "procare",
              externalId: accountExternalId,
              customFields: familyMetadata,
            },
          });
      if (existing) {
        updatedFamilies += 1;
      } else {
        createdFamilies += 1;
      }

      const syncGuardian = async ({
        name,
        guardianEmail,
        guardianPhone,
        externalId,
        relation,
        billingContact,
        employer,
      }: {
        name: string;
        guardianEmail: string;
        guardianPhone: string;
        externalId: string | null;
        relation: string;
        billingContact: boolean;
        employer: string;
      }) => {
        if (!name && !guardianEmail && !guardianPhone) return null;
        const fallbackGuardianMatchers = [
          guardianEmail ? { email: guardianEmail } : undefined,
          guardianPhone ? { phone: guardianPhone } : undefined,
          name ? { fullName: name } : undefined,
        ].filter(Boolean) as Array<{ email?: string; phone?: string; fullName?: string }>;
        const fallbackGuardians = externalId || !fallbackGuardianMatchers.length
          ? []
          : await prisma.guardian.findMany({
              where: { familyId: family.id, OR: fallbackGuardianMatchers },
              take: 2,
            });
        const externalGuardians = externalId
          ? await prisma.guardian.findMany({
              where: { family: { centerId: targetCenter.id }, sourceSystem: "procare", externalId },
              take: 2,
            })
          : [];
        if (externalGuardians.length > 1) {
          throw new Error("Multiple existing guardians use this ProCare Person ID. Resolve the duplicate records before importing.");
        }
        if (fallbackGuardians.length > 1) {
          throw new Error("Multiple guardians match this row without a ProCare Person ID. Add the relationship ID before importing.");
        }
        const existingGuardian = externalId
          ? externalGuardians[0] ?? null
          : fallbackGuardians[0] ?? null;
        const guardianMetadata = metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId });
        if (!existingGuardian) {
          const createdGuardian = await prisma.guardian.create({
            data: {
              familyId: family.id,
              fullName: name || familyName || guardianEmail || guardianPhone,
              email: guardianEmail || null,
              phone: guardianPhone || null,
              employer: employer || null,
              relation,
              preferredCommunication: guardianEmail ? "email" : guardianPhone ? "phone" : null,
              isBillingContact: billingContact,
              sourceSystem: "procare",
              externalId,
              customFields: guardianMetadata,
            },
            select: { id: true },
          });
          return createdGuardian.id;
        } else {
          const updatedGuardian = await prisma.guardian.update({
            where: { id: existingGuardian.id },
            data: {
              familyId: family.id,
              fullName: name || undefined,
              email: guardianEmail || undefined,
              phone: guardianPhone || undefined,
              employer: employer || undefined,
              relation,
              preferredCommunication: guardianEmail ? "email" : guardianPhone ? "phone" : undefined,
              isBillingContact: billingContact || existingGuardian.isBillingContact,
              sourceSystem: "procare",
              externalId: externalId || undefined,
              customFields: mergeCustomFields(existingGuardian.customFields, guardianMetadata),
            },
            select: { id: true },
          });
          return updatedGuardian.id;
        }
      };

      const linkedGuardianRecordIds = new Set<string>();
      for (const guardian of guardianImports) {
        const guardianRecordId = await syncGuardian(guardian);
        if (guardianRecordId) linkedGuardianRecordIds.add(guardianRecordId);
      }

      let childId: string | undefined;
      if (childName) {
        let classroomId: string | null = null;
        if (classroomName) {
          const classroom = await findOrCreateClassroom({
            centerId: targetCenter.id,
            name: classroomName,
            ageGroup,
            rawData,
          }, prisma);
          classroomId = !enrollmentStatusProvided || isActiveProcareEnrollmentStatus(enrollmentStatus) ? classroom.id : null;
          if (classroom.created) createdClassrooms += 1;
        }
        const childDob = parseDate(value(rawData, ["dob", "birth date", "date of birth", "birthday", "birthdate"]));
        const preferredName = procareChildPreferredName(rawData);
        const photoPermissionAliases = ["photo permission", "photo/video permission", "media permission", "photo release"];
        const fieldTripPermissionAliases = ["field trip permission", "trip permission", "transportation permission"];
        const photoPermissionValue = value(rawData, photoPermissionAliases);
        const fieldTripPermissionValue = value(rawData, fieldTripPermissionAliases);
        const childMetadata = metadataFromRow(rawData, {
          mappedCenterId: targetCenter.id,
          accountExternalId,
          procareChildId: childExternalId,
          dateOfBirthMissing: !childDob,
          childTracking: value(rawData, ["child tracking", "tracking", "additional tracking"]),
          childFirstName: value(rawData, ["first name", "child first name", "student first name"]),
          childMiddleInitial: value(rawData, ["middle initial", "middle name", "child middle name", "student middle name"]),
          childLastName: value(rawData, ["last name", "child last name", "student last name"]),
          gender: value(rawData, ["gender", "sex"]),
          enrollmentStatus,
          enrollmentEndDate: value(rawData, ["end date", "withdrawal date", "termination date"]),
        });
        const fallbackChildren = childExternalId
          ? []
          : await prisma.child.findMany({
            where: { familyId: family.id, fullName: childName },
            take: 2,
            select: { id: true, dateOfBirth: true, customFields: true },
          });
        const externalChildren = childExternalId
          ? await prisma.child.findMany({
            where: { family: { centerId: targetCenter.id }, sourceSystem: "procare", externalId: childExternalId },
            take: 2,
            select: { id: true, dateOfBirth: true, customFields: true },
          })
          : [];
        if (fallbackChildren.length > 1) {
          throw new Error("Multiple children match this name without a ProCare Child ID. Add the child ID before importing.");
        }
        if (externalChildren.length > 1) {
          throw new Error("Multiple existing children use this ProCare Child ID. Resolve the duplicate records before importing.");
        }
        const existingChild = childExternalId
          ? externalChildren[0] ?? null
          : fallbackChildren[0] ?? null;
        if (!existingChild) {
          const child = await prisma.child.create({
            data: {
              familyId: family.id,
              classroomId,
              fullName: childName,
              preferredName: preferredName || null,
              dateOfBirth: childDob ?? new Date("1900-01-01T12:00:00.000Z"),
              ageGroup,
              enrollmentStatus,
              startDate: parseDate(value(rawData, ["start date", "enrollment date", "begin date", "first day"])),
              schedule: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) ? { notes: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) } : undefined,
              photoVideoPermission: boolValue(photoPermissionValue),
              fieldTripPermission: boolValue(fieldTripPermissionValue),
              napNotes: value(rawData, ["nap notes", "sleep notes"]) || null,
              feedingNotes: value(rawData, ["feeding notes", "dietary notes", "food notes"]) || null,
              pottyNotes: value(rawData, ["potty notes", "toilet notes", "diaper notes"]) || null,
              developmentalNotes: value(rawData, ["developmental notes", "behavior notes", "observation notes"]) || null,
              sourceSystem: "procare",
              externalId: childExternalId,
              customFields: childMetadata,
            },
          });
          childId = child.id;
          createdChildren += 1;
        } else {
          childId = existingChild.id;
          await prisma.child.update({
            where: { id: existingChild.id },
            data: {
              familyId: family.id,
              ...(classroomName
                ? { classroomId }
                : enrollmentStatusProvided && !isActiveProcareEnrollmentStatus(enrollmentStatus)
                  ? { classroomId: null }
                  : {}),
              fullName: childName,
              ...(hasImportField(rawData, preferredNameAliases) ? { preferredName: preferredName || null } : {}),
              dateOfBirth: childDob ?? existingChild.dateOfBirth,
              ...(hasImportField(rawData, ageGroupAliases) && (classroomName || ageGroup !== "Unassigned") ? { ageGroup } : {}),
              ...(enrollmentStatusProvided ? { enrollmentStatus } : {}),
              startDate: parseDate(value(rawData, ["start date", "enrollment date", "begin date", "first day"])) || undefined,
              schedule: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) ? { notes: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) } : undefined,
              napNotes: value(rawData, ["nap notes", "sleep notes"]) || undefined,
              feedingNotes: value(rawData, ["feeding notes", "dietary notes", "food notes"]) || undefined,
              pottyNotes: value(rawData, ["potty notes", "toilet notes", "diaper notes"]) || undefined,
              developmentalNotes: value(rawData, ["developmental notes", "behavior notes", "observation notes"]) || undefined,
              ...(hasImportField(rawData, photoPermissionAliases) ? { photoVideoPermission: boolValue(photoPermissionValue) } : {}),
              ...(hasImportField(rawData, fieldTripPermissionAliases) ? { fieldTripPermission: boolValue(fieldTripPermissionValue) } : {}),
              sourceSystem: "procare",
              externalId: childExternalId || undefined,
              customFields: mergeCustomFields(existingChild.customFields, childMetadata),
            },
          });
        }

        const allergyText = value(rawData, ["allergies", "allergy", "allergy notes", "medical allergy"]);
        const allergyRecords = (() => {
          try {
            const parsed = JSON.parse(value(rawData, ["procare allergy records"]) || "[]") as unknown;
            if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean);
          } catch { /* Fall back to the standard single allergy field. */ }
          return allergyText ? [allergyText] : [];
        })();
        for (const allergyRecord of [...new Set(allergyRecords)]) {
          if (!childId) break;
          const allergen = allergyRecord.slice(0, 120);
          const existingAllergy = await prisma.allergy.findFirst({ where: { childId, allergen }, select: { id: true } });
          if (!existingAllergy) {
            await prisma.allergy.create({
              data: {
                childId,
                allergen,
                severity: value(rawData, ["allergy severity", "severity"]) || "Imported",
                actionPlan: value(rawData, ["allergy action plan", "action plan"]) || null,
              },
            });
            medicalRows += 1;
          }
        }

        const medicalText = value(rawData, ["medical notes", "medications", "medication", "medicine", "doctor notes", "health notes", "physician", "insurance"]);
        if (medicalText && childId) {
          const medicalCategory = value(rawData, ["medical category", "health category"]) || "ProCare import";
          const existingMedical = await prisma.childMedicalNote.findFirst({
            where: { childId, category: medicalCategory, note: medicalText },
            select: { id: true },
          });
          if (!existingMedical) {
            await prisma.childMedicalNote.create({
              data: {
                childId,
                category: medicalCategory,
                note: medicalText,
                restricted: true,
              },
            });
            medicalRows += 1;
          }
        }

        const attendanceDate = parseDate(value(rawData, ["attendance date", "attendance day", "date", "class date"]));
        const attendanceStatus = value(rawData, ["attendance status", "attendance", "absence status"]) || (boolValue(value(rawData, ["absent", "is absent"])) ? "absent" : "");
        const absenceReason = value(rawData, ["absence reason", "absent reason", "sick/vacation notes", "vacation/sick notes"]);
        if (childId && attendanceDate && (attendanceStatus || absenceReason)) {
          const existingAttendance = await prisma.attendanceRecord.findFirst({
            where: {
              childId,
              date: { gte: startOfDay(attendanceDate), lte: endOfDay(attendanceDate) },
            },
            select: { id: true },
          });
          const attendanceData = {
            childId,
            classroomId,
            date: startOfDay(attendanceDate),
            status: attendanceStatus || (absenceReason ? "absent" : "present"),
            absenceReason: absenceReason || null,
            sourceSystem: "procare",
            externalId: externalValue(rawData, ["attendance id", "attendance key"]) || `${childExternalId || childId}:${startOfDay(attendanceDate).toISOString()}`,
            metadata: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
          };
          if (existingAttendance) {
            await prisma.attendanceRecord.update({ where: { id: existingAttendance.id }, data: attendanceData });
          } else {
            await prisma.attendanceRecord.create({ data: attendanceData });
            attendanceRows += 1;
          }
        }

        const checkDate = value(rawData, ["check date", "sign date", "attendance date", "date"]);
        const checkInAt = parseDateAndTime(checkDate, value(rawData, ["check in", "check-in", "sign in", "sign-in", "time in", "in time"]));
        const checkOutAt = parseDateAndTime(checkDate, value(rawData, ["check out", "check-out", "sign out", "sign-out", "time out", "out time"]));
        const pickupNameFromLog = value(rawData, ["pickup person", "pickup name", "signed by", "guardian", "authorized pickup"]);
        const checkEntries = [
          checkInAt ? { type: "check_in", occurredAt: checkInAt } : null,
          checkOutAt ? { type: "check_out", occurredAt: checkOutAt } : null,
        ].filter(Boolean) as Array<{ type: string; occurredAt: Date }>;
        for (const checkEntry of childId ? checkEntries : []) {
          const existingCheck = await prisma.checkInOutLog.findFirst({
            where: {
              childId,
              type: checkEntry.type,
              occurredAt: checkEntry.occurredAt,
            },
            select: { id: true },
          });
          if (!existingCheck) {
            await prisma.checkInOutLog.create({
              data: {
                childId,
                centerId: targetCenter.id,
                classroomId,
                type: checkEntry.type,
                occurredAt: checkEntry.occurredAt,
                pickupName: pickupNameFromLog || null,
                signaturePlaceholder: Boolean(value(rawData, ["signature", "signed by"])),
                verificationStatus: "imported_from_procare",
                pinVerified: false,
                notes: value(rawData, ["attendance notes", "sign in notes", "check in notes"]) || null,
                sourceSystem: "procare",
                externalId: externalValue(rawData, ["check log id", "sign in out id", "attendance id"]) || `${childExternalId || childId}:${checkEntry.type}:${checkEntry.occurredAt.toISOString()}`,
                metadata: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
              },
            });
            checkLogRows += 1;
          }
        }
      }

      const relationshipRecords = procareRelationshipRecords(rawData);
      for (const relationship of relationshipRecords) {
        const name = clean(relationship.name);
        if (!name) continue;
        if (relationship.emergency) {
          const contactPhone = clean(relationship.phone) || "Not imported";
          const contactExternalId = clean(relationship.externalId) || null;
          const existingContacts = await prisma.emergencyContact.findMany({
            where: contactExternalId
              ? { family: { centerId: targetCenter.id }, sourceSystem: "procare", externalId: contactExternalId }
              : { familyId: family.id, fullName: name, phone: contactPhone },
            take: 2,
            select: { id: true, customFields: true },
          });
          if (existingContacts.length > 1) {
            throw new Error("Multiple emergency contacts use this ProCare Person ID. Resolve the duplicate records before importing.");
          }
          const existingContact = existingContacts[0] ?? null;
          const contactMetadata = metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId, livesWith: Boolean(relationship.livesWith) });
          if (existingContact) {
            await prisma.emergencyContact.update({
              where: { id: existingContact.id },
              data: { familyId: family.id, fullName: name, phone: contactPhone, relation: clean(relationship.relation) || "Emergency Contact", sourceSystem: "procare", externalId: contactExternalId || undefined, customFields: mergeCustomFields(existingContact.customFields, contactMetadata) },
            });
          } else {
            await prisma.emergencyContact.create({ data: { familyId: family.id, fullName: name, phone: contactPhone, relation: clean(relationship.relation) || "Emergency Contact", sourceSystem: "procare", externalId: contactExternalId, customFields: contactMetadata } });
            emergencyContacts += 1;
          }
        }
        if (relationship.authorizedPickup) {
          const pickupPhone = clean(relationship.phone) || null;
          const pickupExternalId = clean(relationship.externalId) || null;
          const existingPickups = await prisma.authorizedPickup.findMany({
            where: pickupExternalId
              ? { family: { centerId: targetCenter.id }, sourceSystem: "procare", externalId: pickupExternalId }
              : { familyId: family.id, fullName: name, phone: pickupPhone },
            take: 2,
            select: { id: true, customFields: true },
          });
          if (existingPickups.length > 1) {
            throw new Error("Multiple authorized pickups use this ProCare Person ID. Resolve the duplicate records before importing.");
          }
          const existingPickup = existingPickups[0] ?? null;
          const pickupMetadata = metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId });
          if (existingPickup) {
            await prisma.authorizedPickup.update({
              where: { id: existingPickup.id },
              data: { familyId: family.id, fullName: name, phone: pickupPhone, relation: clean(relationship.relation) || null, verificationNotes: "Imported from ProCare; director should verify identity requirements.", sourceSystem: "procare", externalId: pickupExternalId || undefined, customFields: mergeCustomFields(existingPickup.customFields, pickupMetadata) },
            });
          } else {
            await prisma.authorizedPickup.create({ data: { familyId: family.id, fullName: name, phone: pickupPhone, relation: clean(relationship.relation) || null, verificationNotes: "Imported from ProCare; director should verify identity requirements.", sourceSystem: "procare", externalId: pickupExternalId, customFields: pickupMetadata } });
            authorizedPickups += 1;
          }
        }
      }

      const emergencyName = value(rawData, ["emergency contact", "emergency contact name", "emergency name"]);
      const emergencyPhone = value(rawData, ["emergency phone", "emergency contact phone"]);
      const emergencyExternalId = externalValue(rawData, ["emergency contact id", "emergency id"]);
      for (const contact of splitPeopleList(emergencyName || value(rawData, ["emergency contacts"]))) {
        const contactPhone = emergencyPhone || "Not imported";
        const contactRelation = value(rawData, ["emergency relation", "emergency contact relation"]) || "Emergency Contact";
        const existingEmergencyContacts = await prisma.emergencyContact.findMany({
          where: emergencyExternalId
            ? { family: { centerId: targetCenter.id }, sourceSystem: "procare", externalId: emergencyExternalId }
            : { familyId: family.id, fullName: contact, phone: contactPhone },
          take: 2,
          select: { id: true, customFields: true },
        });
        if (existingEmergencyContacts.length > 1) {
          throw new Error("Multiple emergency contacts use this ProCare ID. Resolve the duplicate records before importing.");
        }
        const existingEmergencyContact = existingEmergencyContacts[0] ?? null;
        const emergencyMetadata = metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId });
        if (existingEmergencyContact) {
          await prisma.emergencyContact.update({
            where: { id: existingEmergencyContact.id },
            data: {
              familyId: family.id,
              fullName: contact,
              phone: contactPhone,
              relation: contactRelation,
              sourceSystem: "procare",
              externalId: emergencyExternalId || undefined,
              customFields: mergeCustomFields(existingEmergencyContact.customFields, emergencyMetadata),
            },
          });
        } else {
          await prisma.emergencyContact.create({
            data: {
            familyId: family.id,
            fullName: contact,
            phone: contactPhone,
            relation: contactRelation,
            sourceSystem: "procare",
            externalId: emergencyExternalId,
            customFields: emergencyMetadata,
            },
          });
          emergencyContacts += 1;
        }
      }

      const pickupName = value(rawData, ["authorized pickup", "pickup name", "pickup"]);
      const pickupPhone = value(rawData, ["pickup phone", "authorized pickup phone"]);
      const pickupExternalId = externalValue(rawData, ["pickup id", "authorized pickup id"]);
      for (const pickup of splitPeopleList(pickupName || value(rawData, ["authorized pickups"]))) {
        const pickupRelation = value(rawData, ["pickup relation", "authorized pickup relation"]) || null;
        const existingPickups = await prisma.authorizedPickup.findMany({
          where: pickupExternalId
            ? { family: { centerId: targetCenter.id }, sourceSystem: "procare", externalId: pickupExternalId }
            : { familyId: family.id, fullName: pickup, phone: pickupPhone || null },
          take: 2,
          select: { id: true, customFields: true },
        });
        if (existingPickups.length > 1) {
          throw new Error("Multiple authorized pickups use this ProCare ID. Resolve the duplicate records before importing.");
        }
        const existingPickup = existingPickups[0] ?? null;
        const pickupMetadata = metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId });
        if (existingPickup) {
          await prisma.authorizedPickup.update({
            where: { id: existingPickup.id },
            data: {
              familyId: family.id,
              fullName: pickup,
              phone: pickupPhone || null,
              relation: pickupRelation,
              verificationNotes: "Imported from ProCare export; director should verify identity requirements.",
              sourceSystem: "procare",
              externalId: pickupExternalId || undefined,
              customFields: mergeCustomFields(existingPickup.customFields, pickupMetadata),
            },
          });
        } else {
          await prisma.authorizedPickup.create({
            data: {
            familyId: family.id,
            fullName: pickup,
            phone: pickupPhone || null,
            relation: pickupRelation,
            verificationNotes: "Imported from ProCare export; director should verify identity requirements.",
            sourceSystem: "procare",
            externalId: pickupExternalId,
            customFields: pickupMetadata,
            },
          });
          authorizedPickups += 1;
        }
      }

      if (accountExternalId) {
        const desiredRelationships = completeRelationshipIdsByAccount.get(`${targetCenter.id}\0${accountExternalId}`);
        if (desiredRelationships) {
          const staleGuardianExternalIds: Prisma.StringNullableFilter = desiredRelationships.guardians.size
            ? { notIn: [...desiredRelationships.guardians] }
            : { not: null };
          const linkedStaleGuardian = await prisma.guardian.findFirst({
            where: {
              familyId: family.id,
              sourceSystem: "procare",
              externalId: staleGuardianExternalIds,
              OR: [
                { checkLogs: { some: {} } },
                { dataDeletionRequests: { some: {} } },
              ],
            },
            select: { id: true },
          });
          if (linkedStaleGuardian) {
            throw new Error("A stale ProCare guardian has retained check-in or privacy-request history. Resolve that historical relationship before importing this family.");
          }
          await prisma.guardian.deleteMany({
            where: {
              familyId: family.id,
              sourceSystem: "procare",
              externalId: staleGuardianExternalIds,
            },
          });
          await prisma.emergencyContact.deleteMany({
            where: {
              familyId: family.id,
              sourceSystem: "procare",
              externalId: desiredRelationships.emergency.size
                ? { notIn: [...desiredRelationships.emergency] }
                : { not: null },
            },
          });
          await prisma.authorizedPickup.deleteMany({
            where: {
              familyId: family.id,
              sourceSystem: "procare",
              externalId: desiredRelationships.pickup.size
                ? { notIn: [...desiredRelationships.pickup] }
                : { not: null },
            },
          });
        }
      }

      if (parsedBalance.present) {
        const importedBillingFields = metadataFromRow(rawData, { mappedCenterId: targetCenter.id });
        const existingBillingAccount = await prisma.billingAccount.findUnique({
          where: { familyId: family.id },
          select: { customFields: true },
        });
        const account = await prisma.billingAccount.upsert({
          where: { familyId: family.id },
          update: {
            balanceCents,
            sourceSystem: "procare",
            externalId: accountExternalId || undefined,
            customFields: mergeCustomFields(existingBillingAccount?.customFields, importedBillingFields),
          },
          create: {
            familyId: family.id,
            balanceCents,
            sourceSystem: "procare",
            externalId: accountExternalId,
            customFields: importedBillingFields,
          },
        });
        let importedInvoiceId: string | null = null;
        const legacyInvoiceExternalId = `procare-opening-balance:${accountExternalId || family.id}`;
        const invoiceExternalId = `procare-opening-balance:${targetCenter.id}:${accountExternalId || family.id}`;
        const importedInvoiceFields = metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId });
        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            billingAccount: { family: { centerId: targetCenter.id } },
            sourceSystem: "procare",
            externalId: { in: [invoiceExternalId, legacyInvoiceExternalId] },
          },
          select: { id: true, customFields: true },
        });
        if (balanceCents > 0) {
          const invoiceNumberKey = (accountExternalId || family.id).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
          if (existingInvoice) {
            await prisma.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                billingAccountId: account.id,
                status: PaymentStatus.OPEN,
                totalCents: balanceCents,
                externalId: invoiceExternalId,
                customFields: mergeCustomFields(existingInvoice.customFields, importedInvoiceFields),
                items: {
                  deleteMany: {},
                  create: [{ description: "Imported ProCare opening balance", amountCents: balanceCents }],
                },
              },
            });
            importedInvoiceId = existingInvoice.id;
          } else {
            const invoice = await prisma.invoice.create({
              data: {
                billingAccountId: account.id,
                number: `PC-${targetCenter.id.slice(-6)}-${invoiceNumberKey || index}`,
                status: PaymentStatus.OPEN,
                dueDate: parseDate(value(rawData, ["due date", "payment due date"])) ?? new Date(),
                totalCents: balanceCents,
                sourceSystem: "procare",
                externalId: invoiceExternalId,
                customFields: importedInvoiceFields,
                items: {
                  create: [
                    {
                      description: "Imported ProCare opening balance",
                      amountCents: balanceCents,
                    },
                  ],
                },
              },
              select: { id: true },
            });
            importedInvoiceId = invoice.id;
            invoiceRows += 1;
          }
        } else if (existingInvoice) {
          await prisma.invoice.update({
            where: { id: existingInvoice.id },
            data: {
              billingAccountId: account.id,
              status: balanceCents === 0 ? PaymentStatus.PAID : PaymentStatus.VOID,
              totalCents: 0,
              externalId: invoiceExternalId,
              customFields: mergeCustomFields(existingInvoice.customFields, importedInvoiceFields),
              items: {
                deleteMany: {},
                create: [{ description: "Imported ProCare opening balance", amountCents: 0 }],
              },
            },
          });
          importedInvoiceId = existingInvoice.id;
        }
        const ledgerExternalId = `procare-opening-balance:${targetCenter.id}:${accountExternalId || family.id}`;
        await prisma.ledgerEntry.upsert({
          where: { sourceSystem_externalId: { sourceSystem: "procare", externalId: ledgerExternalId } },
          update: {
            billingAccountId: account.id,
            invoiceId: importedInvoiceId,
            amountCents: balanceCents,
            balanceAfterCents: balanceCents,
            metadata: { ...rawData, mappedCenterId: targetCenter.id },
          },
          create: {
            billingAccountId: account.id,
            invoiceId: importedInvoiceId,
            type: "procare_balance",
            description: "Imported ProCare balance",
            amountCents: balanceCents,
            balanceAfterCents: balanceCents,
            sourceSystem: "procare",
            externalId: ledgerExternalId,
            metadata: { ...rawData, mappedCenterId: targetCenter.id },
          },
        });
        ledgerRows += 1;
      }

      if (childId) {
        const linkedChildCount = await prisma.child.count({ where: { id: childId, familyId: family.id } });
        if (linkedChildCount !== 1) {
          throw new Error("The child profile was not linked to its ProCare family. This row was rolled back safely.");
        }
      }
      if (guardianImports.length) {
        const linkedGuardianCount = await prisma.guardian.count({
          where: { familyId: family.id, id: { in: [...linkedGuardianRecordIds] } },
        });
        if (linkedGuardianRecordIds.size !== guardianImports.length || linkedGuardianCount !== linkedGuardianRecordIds.size) {
          throw new Error("One or more parent profiles were not linked to the correct ProCare family. This row was rolled back safely.");
        }
      }

      return { familyId: family.id, childId };
      }, { maxWait: 10_000, timeout: 60_000 });

      rowResults.push({
        rowNumber: index + 1,
        status: "imported",
        rawData: { ...rawData, mappedCenterId: targetCenter.id, mappedCenter: targetCenter.crmLocationId ?? targetCenter.name },
        createdFamilyId: familyWrite.familyId,
        createdChildId: familyWrite.childId,
      });
    } catch (error) {
      ({
        createdFamilies,
        updatedFamilies,
        createdChildren,
        ledgerRows,
        createdClassrooms,
        createdStaff,
        updatedStaff,
        createdStaffLogins,
        emergencyContacts,
        authorizedPickups,
        medicalRows,
        attendanceRows,
        checkLogRows,
        invoiceRows,
      } = rowCounterSnapshot);
      rowResults.push({ rowNumber: index + 1, status: "needs_resolution", message: error instanceof Error ? error.message : "This row needs mapping or disposal.", rawData });
    }
  }

  await prisma.procareImportRow.createMany({
    data: rowResults.map((row) => ({
      batchId: batch.id,
      rowNumber: row.rowNumber,
      status: row.status,
      message: row.message || null,
      rawData: row.rawData,
      createdFamilyId: row.createdFamilyId || null,
      createdChildId: row.createdChildId || null,
    })),
    skipDuplicates: true,
  });

  const cumulativeNumber = (key: string, current: number) => Number(existingSummary[key] ?? 0) + current;
  const progress = await prisma.procareImportRow.groupBy({ by: ["status"], where: { batchId: batch.id }, _count: { _all: true } });
  const progressCounts = Object.fromEntries(progress.map((item) => [item.status, item._count._all]));
  const persistedRows = Object.values(progressCounts).reduce((total, count) => total + count, 0);
  const isPartial = persistedRows < rows.length - 1;
  const nextRow = Math.min(chunkStart + rowResults.length, rows.length);
  const unresolvedRows = isPartial ? [] : await prisma.procareImportRow.findMany({
    where: { batchId: batch.id, status: "needs_resolution" },
    orderBy: { rowNumber: "asc" },
    take: 500,
    select: { rowNumber: true, message: true },
  });
  const summary = {
    center: autoMap ? "Auto-mapped from ProCare export" : center.crmLocationId ?? center.name,
    sourceType: importPayload.sourceType,
    filename: importPayload.filename,
    sourceSha256,
    reviewFingerprint,
    mappingSignature,
    rows: persistedRows,
    totalRows: rows.length - 1,
    imported: progressCounts.imported ?? 0,
    errors: progressCounts.error ?? 0,
    unresolved: progressCounts.needs_resolution ?? 0,
    disposed: progressCounts.disposed ?? 0,
    createdFamilies: cumulativeNumber("createdFamilies", createdFamilies),
    updatedFamilies: cumulativeNumber("updatedFamilies", updatedFamilies),
    createdChildren: cumulativeNumber("createdChildren", createdChildren),
    createdClassrooms: cumulativeNumber("createdClassrooms", createdClassrooms),
    createdStaff: cumulativeNumber("createdStaff", createdStaff),
    updatedStaff: cumulativeNumber("updatedStaff", updatedStaff),
    createdStaffLogins: cumulativeNumber("createdStaffLogins", createdStaffLogins),
    emergencyContacts: cumulativeNumber("emergencyContacts", emergencyContacts),
    authorizedPickups: cumulativeNumber("authorizedPickups", authorizedPickups),
    medicalRows: cumulativeNumber("medicalRows", medicalRows),
    attendanceRows: cumulativeNumber("attendanceRows", attendanceRows),
    checkLogRows: cumulativeNumber("checkLogRows", checkLogRows),
    invoiceRows: cumulativeNumber("invoiceRows", invoiceRows),
    ledgerRows: cumulativeNumber("ledgerRows", ledgerRows),
    centersTouched: centersTouched.size,
    centerIdsTouched: [...centersTouched],
    stagedRowNumbers: [...stagedRowNumbers],
    validationWarnings: Object.fromEntries(validationWarningMessages),
    headerAnalysis,
    fieldOptions: PROCARE_FIELD_OPTIONS,
    correlationReview,
    datasetCoverage: importPayload.datasetCoverage ?? existingSummary.datasetCoverage ?? null,
    sourceInventoryConfirmed: sourceInventoryConfirmed || existingSummary.sourceInventoryConfirmed === true,
    warningRows: progressCounts.needs_resolution ?? 0,
    duplicateReviewRows,
    rowResults: unresolvedRows.map((row) => ({
      rowNumber: row.rowNumber,
      status: "warning",
      entity: "unknown",
      center: autoMap ? "Unresolved" : center.crmLocationId ?? center.name,
      action: "Map or dispose",
      message: row.message,
    })),
  };

  await prisma.procareImportBatch.update({
    where: { id: batch.id },
    data: { status: isPartial ? "processing" : summary.errors || summary.unresolved ? "completed_with_errors" : "completed", summary },
  });

  if (rowResults.some((row) => row.status === "imported")) {
    revalidatePath("/", "layout");
  }

  if (isPartial) {
    return NextResponse.json({ ok: true, partial: true, batchId: batch.id, nextRow, totalRows: rows.length - 1, summary });
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: "procare.import.completed",
    resource: "ProcareImportBatch",
    resourceId: batch.id,
    metadata: summary,
  });

  return NextResponse.json({ ok: true, batchId: batch.id, summary, rowResults });
}

async function PATCHHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user)) return NextResponse.json({ ok: false, error: "ProCare import reconciliation is not allowed for this role." }, { status: 403 });
  const body = await request.json().catch(() => null) as { batchId?: string; rowNumbers?: number[]; action?: string } | null;
  const batch = body?.batchId ? await prisma.procareImportBatch.findUnique({
    where: { id: body.batchId },
    select: { id: true, centerId: true, summary: true, rows: { select: { rawData: true } } },
  }) : null;
  if (!batch || importBatchCenterIds(batch).some((centerId) => !canAccessCenter(user, centerId))) return NextResponse.json({ ok: false, error: "Import batch not found." }, { status: 404 });
  const rowNumbers = [...new Set((body?.rowNumbers ?? []).filter((value) => Number.isInteger(value) && value > 1))];
  const disposeAll = body?.action === "dispose_all";
  if ((!disposeAll && body?.action !== "dispose") || (!disposeAll && !rowNumbers.length)) return NextResponse.json({ ok: false, error: "Choose unresolved rows to dispose." }, { status: 400 });
  const result = await prisma.procareImportRow.updateMany({
    where: { batchId: batch.id, ...(disposeAll ? {} : { rowNumber: { in: rowNumbers } }), status: "needs_resolution" },
    data: { status: "disposed", message: "Disposed by the user during import reconciliation." },
  });
  await writeAuditLog(user, { centerId: batch.centerId, action: "procare.import.rows_disposed", resource: "ProcareImportBatch", resourceId: batch.id, metadata: { rowNumbers: disposeAll ? "all_unresolved" : rowNumbers, count: result.count } });
  return NextResponse.json({ ok: true, disposed: result.count });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
export const PATCH = withApiLogging("PATCH", PATCHHandler);
