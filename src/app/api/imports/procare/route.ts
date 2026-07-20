import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import {
  isActiveProcareStaffStatus,
  normalizeProcareEnrollmentStatus,
  procareAgeGroup,
  procareChildFullName,
  procareChildPreferredName,
  procareClassroomName,
  procareFamilyName,
  procareSourceFields,
  procareStaffName,
  procareValue as value,
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

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDelimited(text: string, delimiter: "," | "\t" | "|") {
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
  const candidates = [",", "\t", "|"] as const;
  const parsed = candidates.map((delimiter) => {
    const rows = parseDelimited(text, delimiter);
    const score = rows.slice(0, 20).reduce((sum, row) => sum + row.length, 0);
    return { delimiter, rows, score };
  });
  parsed.sort((a, b) => b.score - a.score);
  return parsed[0]?.rows ?? [];
}

function cents(input: string) {
  const normalized = input.replace(/[$,]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function boolValue(input: string) {
  return /^(yes|y|true|1|allowed|permission|granted)$/i.test(input.trim());
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
}) {
  const classroomExternalId = externalValue(rawData, ["classroom id", "room id", "class id", "classroom key", "room key"]) || name;
  const existing = await prisma.classroom.findFirst({
    where: {
      centerId,
      OR: [{ name }, { sourceSystem: "procare", externalId: classroomExternalId }],
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.classroom.update({
      where: { id: existing.id },
      data: {
        ageGroup,
        sourceSystem: "procare",
        externalId: classroomExternalId,
        customFields: metadataFromRow(rawData, { mappedCenterId: centerId, importedFromColumn: "classroom" }),
      },
    });
    return { id: existing.id, created: false };
  }

  const classroom = await prisma.classroom.create({
    data: {
      centerId,
      name,
      ageGroup,
      capacity: intValue(value(rawData, ["capacity", "licensed capacity", "room capacity"]), 12),
      ratioRule: value(rawData, ["ratio", "ratio rule", "staff ratio"]) || "Imported from ProCare; verify capacity and ratio.",
      sourceSystem: "procare",
      externalId: classroomExternalId,
      customFields: metadataFromRow(rawData, { mappedCenterId: centerId, importedFromColumn: "classroom" }),
    },
    select: { id: true },
  });
  return { id: classroom.id, created: true };
}

type ImportCenter = {
  id: string;
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
}) {
  const matchers: Prisma.StaffProfileWhereInput[] = [];
  if (input.externalId) matchers.push({ sourceSystem: "procare", externalId: input.externalId });
  if (input.contactEmail) matchers.push({ customFields: { path: ["staffContactEmail"], equals: input.contactEmail } });
  if (!matchers.length) return null;

  return prisma.staffProfile.findFirst({
    where: {
      centerId: input.centerId,
      OR: matchers,
    },
    select: {
      id: true,
      userId: true,
      customFields: true,
      user: { select: { id: true, email: true } },
    },
  });
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
  const guardianExternalId = externalValue(rawData, ["payer id", "primary payer id", "guardian id", "parent id", "payer 1 id", "primary parent id"]);
  const guardianName = value(rawData, ["guardian name", "parent/guardian", "parent name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent", "mother", "father"]);
  const email = value(rawData, ["email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email"]).toLowerCase();
  const phone = value(rawData, ["phone", "guardian phone", "parent phone", "primary phone", "payer phone", "payer 1 phone", "primary payer phone"]);
  const address = value(rawData, ["address", "street address", "home address", "mailing address", "primary address", "payer address"]);
  const relation = value(rawData, ["guardian relation", "parent relation", "payer relation"]) || "Guardian";
  const matches: ProcareDuplicateMatch[] = [];

  const familyWhere: Prisma.FamilyWhereInput[] = [
    accountExternalId ? { sourceSystem: "procare", externalId: accountExternalId } : undefined,
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

  const childWhere: Prisma.ChildWhereInput[] = [
    childExternalId ? { sourceSystem: "procare", externalId: childExternalId } : undefined,
    childName ? { fullName: childName } : undefined,
  ].filter(Boolean) as Prisma.ChildWhereInput[];
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

  const guardianImports = [
    {
      externalId: guardianExternalId,
      name: guardianName,
      email,
      phone,
      relation,
    },
    {
      externalId: externalValue(rawData, ["secondary guardian id", "secondary payer id", "parent 2 id", "payer 2 id"]),
      name: value(rawData, ["secondary guardian", "secondary payer", "secondary parent", "parent 2", "payer 2", "spouse"]),
      email: value(rawData, ["secondary email", "secondary guardian email", "secondary payer email", "parent 2 email", "payer 2 email"]).toLowerCase(),
      phone: value(rawData, ["secondary phone", "secondary guardian phone", "secondary payer phone", "parent 2 phone", "payer 2 phone"]),
      relation: value(rawData, ["secondary relation", "secondary guardian relation", "parent 2 relation"]) || "Secondary Guardian",
    },
  ].filter((guardian) => guardian.externalId || guardian.name || guardian.email || guardian.phone);

  for (const guardianImport of guardianImports) {
    const guardianWhere: Prisma.GuardianWhereInput[] = [
      guardianImport.externalId ? { sourceSystem: "procare", externalId: guardianImport.externalId } : undefined,
      guardianImport.email ? { email: guardianImport.email } : undefined,
      guardianImport.phone ? { phone: guardianImport.phone } : undefined,
      guardianImport.name ? { fullName: guardianImport.name } : undefined,
    ].filter(Boolean) as Prisma.GuardianWhereInput[];
    const guardianCandidates = guardianWhere.length
      ? await prisma.guardian.findMany({
          where: { family: { centerId: targetCenterId }, OR: guardianWhere },
          take: 8,
          include: { family: { select: { name: true } } },
        })
      : [];
    const scoredGuardians = guardianCandidates
      .map((candidate) => scoreProcareDuplicateCandidate(
        {
          entity: "guardian",
          externalId: guardianImport.externalId,
          name: guardianImport.name,
          email: guardianImport.email,
          phone: guardianImport.phone,
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
        importLabel: guardianImport.name || guardianImport.email || guardianImport.phone,
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
    message?: string;
  }> = [];

  for (let index = 1; index < rows.length; index += 1) {
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
      continue;
    }

    centersTouched.add(targetCenter.id);
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
      continue;
    }

    if (!familyName && !childName && !email) {
      const message = "Missing family, child, or email fields.";
      warnings.push({ rowNumber, message });
      rowResults.push({ rowNumber, status: "warning", entity: "unknown", center: targetCenter.crmLocationId ?? targetCenter.name, action: "Needs cleanup", message });
      continue;
    }

    familyRows += 1;
    const familyIdentity = accountExternalId || familyName || email || childName;
    const familyKey = previewImportIdentityKey(targetCenter.id, accountExternalId, familyName, email, childName);
    if (familyKey) importFamilyKeys.add(familyKey);
    const childKey = childName ? previewImportKey(targetCenter.id, familyIdentity, childExternalId || childName) : "";
    if (childKey) importChildKeys.add(childKey);
    if (cents(value(rawData, ["balance", "account balance", "ledger balance", "amount due"]))) balanceRows += 1;
    if (value(rawData, ["attendance date", "date", "absence date", "attendance status", "attendance"])) attendanceRows += 1;
    if (value(rawData, ["check in", "check-in", "time in", "check out", "check-out", "time out"])) checkLogRows += 1;

    const familyMatchers = [
      accountExternalId ? { sourceSystem: "procare", externalId: accountExternalId } : undefined,
      familyName ? { name: familyName } : undefined,
      email ? { billingEmail: email } : undefined,
    ].filter(Boolean) as Array<{ sourceSystem?: string; externalId?: string; name?: string; billingEmail?: string }>;
    const existingFamily = runDatabasePreviewLookups && familyMatchers.length
      ? await prisma.family.findFirst({ where: { centerId: targetCenter.id, OR: familyMatchers }, select: { id: true } })
      : null;
    if (runDatabasePreviewLookups) {
      if (existingFamily) matchedFamilies += 1; else newFamilies += 1;
    }

    let existingChild: { id: string } | null = null;
    if (runDatabasePreviewLookups && existingFamily && childName) {
      existingChild = await prisma.child.findFirst({
        where: {
          familyId: existingFamily.id,
          OR: [
            childExternalId ? { sourceSystem: "procare", externalId: childExternalId } : undefined,
            { fullName: childName },
          ].filter(Boolean) as Array<{ sourceSystem?: string; externalId?: string; fullName?: string }>,
        },
        select: { id: true },
      });
    }
    if (runDatabasePreviewLookups && childName) {
      if (existingChild) matchedChildren += 1; else newChildren += 1;
    }
    const rowDuplicateMatches = runDatabasePreviewLookups
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
          ? existingFamily ? "Update family" : "Create family"
          : "Ready to import family",
      familyName: familyName || email || childName,
      childName: childName || undefined,
      message: rowDuplicateWarnings.length ? rowDuplicateWarnings.map((match) => `${match.entity}: ${match.importLabel}`).join("; ") : undefined,
    });
  }

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
    duplicateScanSkipped: false,
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

async function readImportText(file: FormDataEntryValue | null, pastedCsv: string) {
  if (!(file instanceof File) || file.size <= 0) {
    return { text: pastedCsv, filename: "pasted-procare-import.csv", sourceType: "csv_text" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  const supportedExtension = fileName.endsWith(".csv") || fileName.endsWith(".txt");
  if (!supportedExtension || isZipBuffer(buffer)) {
    throw new Error("Only unencrypted ProCare CSV or text exports are supported.");
  }

  return { text: buffer.toString("utf8"), filename: file.name, sourceType: "csv_file" };
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
      createdAt: true,
    },
  },
} as const;

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
  if (!canAccessCenter(user, batch.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this import batch." }, { status: 403 });
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
  const reviewedFingerprint = clean(formData.get("reviewedFingerprint"));
  const autoMap = ["auto", "all", "bulk", ""].includes(requestedCenterId.toLowerCase()) && canAccessAllCenters(user);
  const centerId = autoMap ? "" : requestedCenterId || user.primaryCenterId;
  const file = formData.get("file");
  const pastedCsv = clean(formData.get("csv"));
  if (!centerId && !autoMap) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
  if (centerId && !canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });

  const visibleCenters = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      ...(user.role === "PLATFORM_OWNER" ? {} : { id: { in: user.centerIds.length ? user.centerIds : ["__none__"] } }),
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true, locationId: true, city: true, state: true },
  });
  const center = autoMap
    ? visibleCenters[0] ?? null
    : visibleCenters.find((item) => item.id === centerId) ?? null;
  if (!center) return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  const centerByAlias = buildCenterAliasMap(visibleCenters);

  let importPayload: Awaited<ReturnType<typeof readImportText>>;
  try {
    importPayload = await readImportText(file, pastedCsv);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ProCare export could not be read." },
      { status: 400 },
    );
  }
  const text = importPayload.text;
  if (!text) return NextResponse.json({ ok: false, error: "Upload a CSV export or paste CSV text." }, { status: 400 });

  const rows = parseImportRows(text);
  const headers = rows[0]?.map((header) => header.trim().toLowerCase()) ?? [];
  if (rows.length < 2 || !headers.length) {
    return NextResponse.json({ ok: false, error: "No import rows found." }, { status: 400 });
  }

  const sourceSha256 = procareSourceSha256(text);
  const reviewFingerprint = procareImportReviewFingerprint({
    text,
    requestedCenterId,
    duplicateMode,
    secret: process.env.AUTH_SECRET || "development-procare-import-review",
  });

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
    return NextResponse.json({
      ok: true,
      dryRun: true,
      summary: { ...preview, sourceSha256, reviewFingerprint },
    });
  }

  if (!reviewedFingerprint || reviewedFingerprint !== reviewFingerprint) {
    return NextResponse.json(
      { ok: false, error: "Preview and approve this exact ProCare export before committing it." },
      { status: 409 },
    );
  }

  const validationPreview = await previewImportRows({
    rows,
    headers,
    autoMap,
    defaultCenter: center,
    centerByAlias,
    sourceType: importPayload.sourceType,
    filename: importPayload.filename,
    duplicateMode,
  });
  const blockingWarningRows = Math.max(validationPreview.warningRows - validationPreview.duplicateReviewRows, 0);
  if (validationPreview.duplicateScanSkipped) {
    return NextResponse.json(
      {
        ok: false,
        error: `This ${validationPreview.rows}-row export exceeds the ${validationPreview.duplicateScanRowLimit}-row duplicate-review safety limit. Split it into approved batches or complete a reviewed importer enhancement before cutover.`,
        summary: { ...validationPreview, sourceSha256 },
      },
      { status: 400 },
    );
  }
  if (blockingWarningRows > 0) {
    return NextResponse.json(
      { ok: false, error: `${blockingWarningRows} ProCare row(s) still need cleanup before import. Run Preview Import and fix the warning rows first.`, summary: validationPreview },
      { status: 400 },
    );
  }
  if (validationPreview.duplicateReviewRows > 0 && !duplicateReviewConfirmed) {
    return NextResponse.json(
      { ok: false, error: `${validationPreview.duplicateReviewRows} row(s) have possible duplicate family, child, or guardian matches. Review and confirm the duplicate matching controls before committing.`, summary: validationPreview },
      { status: 400 },
    );
  }

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
  const centersTouched = new Set<string>();
  const rowResults: Array<{ rowNumber: number; status: string; message?: string; rawData: Record<string, string>; createdFamilyId?: string; createdChildId?: string }> = [];

  const batch = await prisma.procareImportBatch.create({
    data: {
      centerId: center.id,
      uploadedById: user.id,
      filename: importPayload.filename,
      status: "processing",
      summary: { sourceType: importPayload.sourceType, sourceSha256, reviewFingerprint },
    },
  });

  for (let index = 1; index < rows.length; index += 1) {
    const rawData = Object.fromEntries(headers.map((header, column) => [header, rows[index]?.[column] ?? ""]));
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
        });
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
        let staffClassroomId: string | null = null;
        if (staffClassroomName) {
          const classroom = await findOrCreateClassroom({
            centerId: targetCenter.id,
            name: staffClassroomName,
            ageGroup: procareAgeGroup(rawData, "Staff assignment"),
            rawData,
          });
          staffClassroomId = classroom.id;
          if (classroom.created) createdClassrooms += 1;
        }
        const employeeStatus = value(rawData, ["employee status", "staff status", "teacher status"]);
        const employeeIsActive = isActiveProcareStaffStatus(employeeStatus);
        const staffWrite = await prisma.$transaction(async (tx) => {
          const staffUser = existingStaff
            ? await tx.user.update({
                where: { id: existingStaff.userId },
                data: {
                  name: employeeName,
                  role: UserRole.TEACHER,
                  isActive: employeeIsActive,
                  organizationId: user.organizationId,
                },
                select: { id: true },
              })
            : await tx.user.create({
                data: {
                  tenantId: user.tenantId,
                  organizationId: user.organizationId,
                  email: generatedLogin!.email,
                  name: employeeName,
                  role: UserRole.TEACHER,
                  isActive: employeeIsActive,
                  mustResetPassword: false,
                },
                select: { id: true },
              });
          await ensureTeacherCenterGrant({
            userId: staffUser.id,
            tenantId: user.tenantId,
            organizationId: user.organizationId,
            centerId: targetCenter.id,
          }, tx);
          const customFields = metadataFromRow(rawData, {
            mappedCenterId: targetCenter.id,
            ...(staffContactEmail ? { staffContactEmail } : {}),
            employeeStatus,
            employeeStatusDate: value(rawData, ["status date", "employee status date"]),
            primaryWorkArea: value(rawData, ["primary work area", "work area"]),
            ...(generatedLogin ? { generatedTeacherLoginEmail: generatedLogin.email, supabaseAuthUserCreated: canCreateSupabaseStaffAuth } : {}),
          });
          const data = {
            centerId: targetCenter.id,
            classroomId: staffClassroomId || undefined,
            title: value(rawData, ["title", "position", "job title", "role"]) || "Teacher",
            phone: value(rawData, ["employee phone", "staff phone", "teacher phone", "phone"]) || null,
            backgroundCheckStatus: value(rawData, ["background check", "background check status"]) || null,
            sourceSystem: "procare",
            externalId: employeeExternalId,
            customFields,
          };
          if (existingStaff) {
            await tx.staffProfile.update({ where: { id: existingStaff.id }, data });
          } else {
            await tx.staffProfile.create({
              data: {
                userId: staffUser.id,
                ...data,
                classroomId: staffClassroomId,
              },
            });
          }
          return { staffUserId: staffUser.id };
        });
        if (generatedLogin) {
          await writeAuditLog(user, {
            centerId: targetCenter.id,
            action: "teacher_user_created",
            resource: "User",
            resourceId: staffWrite.staffUserId,
            metadata: {
              email: generatedLogin.email,
              source: "procare_import",
              batchId: batch.id,
            },
          });
        }
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
      const guardianExternalId = externalValue(rawData, ["payer id", "primary payer id", "guardian id", "parent id", "payer 1 id", "primary parent id"]);
      const guardianName = value(rawData, ["guardian name", "parent/guardian", "parent name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent", "mother", "father"]);
      const email = value(rawData, ["email", "guardian email", "parent email", "primary email", "payer email", "payer 1 email", "primary payer email"]).toLowerCase();
      const phone = value(rawData, ["phone", "guardian phone", "parent phone", "primary phone", "payer phone", "payer 1 phone", "primary payer phone"]);
      const address = value(rawData, ["address", "street address", "home address", "mailing address", "primary address", "payer address"]);
      const balanceCents = cents(value(rawData, ["balance", "account balance", "ledger balance", "amount due"]));
      const classroomName = procareClassroomName(rawData);
      const ageGroup = procareAgeGroup(rawData, "Unassigned");
      const enrollmentStatus = normalizeProcareEnrollmentStatus(value(rawData, ["child status", "status", "enrollment status", "student status"]));
      if (!familyName && !childName && !email) throw new Error("Missing family, child, or email fields.");

      const familyMatchers = [
        accountExternalId ? { sourceSystem: "procare", externalId: accountExternalId } : undefined,
        familyName ? { name: familyName } : undefined,
        email ? { billingEmail: email } : undefined,
      ].filter(Boolean) as Array<{ sourceSystem?: string; externalId?: string; name?: string; billingEmail?: string }>;
      const familyMetadata = metadataFromRow(rawData, {
        mappedCenterId: targetCenter.id,
        procareAccountKey: accountExternalId,
        accountTracking: value(rawData, ["tracking", "account tracking", "family tracking"]),
      });
      const existing = familyMatchers.length
        ? await prisma.family.findFirst({
            where: {
              centerId: targetCenter.id,
              OR: familyMatchers,
            },
            select: { id: true },
          })
        : null;

      const family = existing
        ? await prisma.family.update({
            where: { id: existing.id },
            data: {
              name: familyName || childName || email,
              billingEmail: email || undefined,
              address: address || undefined,
              sourceSystem: "procare",
              externalId: accountExternalId || undefined,
              customFields: familyMetadata,
            },
          })
        : await prisma.family.create({
            data: {
              centerId: targetCenter.id,
              name: familyName || childName || email,
              billingEmail: email || null,
              address: address || null,
              notes: "Imported from ProCare export.",
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
        if (!name && !guardianEmail && !guardianPhone) return;
        const guardianMatchers = [
          externalId ? { sourceSystem: "procare", externalId } : undefined,
          guardianEmail ? { email: guardianEmail } : undefined,
          name ? { fullName: name } : undefined,
        ].filter(Boolean) as Array<{ sourceSystem?: string; externalId?: string; email?: string; fullName?: string }>;
        const existingGuardian = guardianMatchers.length
          ? await prisma.guardian.findFirst({
              where: {
                familyId: family.id,
                OR: guardianMatchers,
              },
            })
          : null;
        const guardian = !existingGuardian
          ? await prisma.guardian.create({
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
              customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
            },
          })
          : await prisma.guardian.update({
            where: { id: existingGuardian.id },
            data: {
              email: guardianEmail || undefined,
              phone: guardianPhone || undefined,
              employer: employer || undefined,
              relation,
              isBillingContact: billingContact || existingGuardian.isBillingContact,
              sourceSystem: "procare",
              externalId: externalId || undefined,
              customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
            },
          });
        if (!guardian.checkInPinHash) {
          const defaultPinData = defaultGuardianPinUpdate({ guardianId: guardian.id, phone: guardian.phone, setById: user.id });
          if (defaultPinData) {
            await prisma.guardian.update({ where: { id: guardian.id }, data: defaultPinData });
          }
        }
      };

      await syncGuardian({
        name: guardianName,
        guardianEmail: email,
        guardianPhone: phone,
        externalId: guardianExternalId,
        relation: value(rawData, ["guardian relation", "parent relation", "payer relation"]) || "Guardian",
        billingContact: true,
        employer: value(rawData, ["employer", "guardian employer", "parent employer", "payer employer"]) || "",
      });

      await syncGuardian({
        name: value(rawData, ["secondary guardian", "secondary payer", "secondary parent", "parent 2", "payer 2", "spouse"]),
        guardianEmail: value(rawData, ["secondary email", "secondary guardian email", "secondary payer email", "parent 2 email", "payer 2 email"]).toLowerCase(),
        guardianPhone: value(rawData, ["secondary phone", "secondary guardian phone", "secondary payer phone", "parent 2 phone", "payer 2 phone"]),
        externalId: externalValue(rawData, ["secondary guardian id", "secondary payer id", "parent 2 id", "payer 2 id"]),
        relation: value(rawData, ["secondary relation", "secondary guardian relation", "parent 2 relation"]) || "Secondary Guardian",
        billingContact: false,
        employer: value(rawData, ["secondary employer", "secondary guardian employer", "secondary payer employer", "parent 2 employer"]) || "",
      });

      let childId: string | undefined;
      if (childName) {
        let classroomId: string | null = null;
        if (classroomName) {
          const classroom = await findOrCreateClassroom({
            centerId: targetCenter.id,
            name: classroomName,
            ageGroup,
            rawData,
          });
          classroomId = classroom.id;
          if (classroom.created) createdClassrooms += 1;
        }
        const childDob = parseDate(value(rawData, ["dob", "birth date", "date of birth", "birthday", "birthdate"]));
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
        const existingChild = await prisma.child.findFirst({
          where: {
            familyId: family.id,
            OR: [
              childExternalId ? { sourceSystem: "procare", externalId: childExternalId } : undefined,
              { fullName: childName },
            ].filter(Boolean) as Array<{ sourceSystem?: string; externalId?: string; fullName?: string }>,
          },
          select: { id: true },
        });
        if (!existingChild) {
          const child = await prisma.child.create({
            data: {
              familyId: family.id,
              classroomId,
              fullName: childName,
              preferredName: procareChildPreferredName(rawData) || null,
              dateOfBirth: childDob ?? new Date("1900-01-01T12:00:00.000Z"),
              ageGroup,
              enrollmentStatus,
              startDate: parseDate(value(rawData, ["start date", "enrollment date", "begin date", "first day"])),
              schedule: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) ? { notes: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) } : undefined,
              photoVideoPermission: boolValue(value(rawData, ["photo permission", "photo/video permission", "media permission", "photo release"])),
              fieldTripPermission: boolValue(value(rawData, ["field trip permission", "trip permission", "transportation permission"])),
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
              classroomId: classroomId || undefined,
              ageGroup,
              enrollmentStatus,
              startDate: parseDate(value(rawData, ["start date", "enrollment date", "begin date", "first day"])) || undefined,
              schedule: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) ? { notes: value(rawData, ["schedule", "schedule template", "contract schedule", "contract", "days"]) } : undefined,
              napNotes: value(rawData, ["nap notes", "sleep notes"]) || undefined,
              feedingNotes: value(rawData, ["feeding notes", "dietary notes", "food notes"]) || undefined,
              pottyNotes: value(rawData, ["potty notes", "toilet notes", "diaper notes"]) || undefined,
              developmentalNotes: value(rawData, ["developmental notes", "behavior notes", "observation notes"]) || undefined,
              sourceSystem: "procare",
              externalId: childExternalId || undefined,
              customFields: childMetadata,
            },
          });
        }

        const allergyText = value(rawData, ["allergies", "allergy", "allergy notes", "medical allergy"]);
        if (allergyText && childId) {
          const allergen = allergyText.slice(0, 120);
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

      const emergencyName = value(rawData, ["emergency contact", "emergency contact name", "emergency name"]);
      const emergencyPhone = value(rawData, ["emergency phone", "emergency contact phone"]);
      for (const contact of splitPeopleList(emergencyName || value(rawData, ["emergency contacts"]))) {
        const contactPhone = emergencyPhone || "Not imported";
        const contactRelation = value(rawData, ["emergency relation", "emergency contact relation"]) || "Emergency Contact";
        const existingEmergencyContact = await prisma.emergencyContact.findFirst({
          where: { familyId: family.id, fullName: contact, phone: contactPhone },
          select: { id: true },
        });
        if (existingEmergencyContact) {
          await prisma.emergencyContact.update({
            where: { id: existingEmergencyContact.id },
            data: {
              relation: contactRelation,
              sourceSystem: "procare",
              externalId: externalValue(rawData, ["emergency contact id", "emergency id"]) || undefined,
              customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
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
            externalId: externalValue(rawData, ["emergency contact id", "emergency id"]),
            customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
            },
          });
          emergencyContacts += 1;
        }
      }

      const pickupName = value(rawData, ["authorized pickup", "pickup name", "pickup"]);
      const pickupPhone = value(rawData, ["pickup phone", "authorized pickup phone"]);
      for (const pickup of splitPeopleList(pickupName || value(rawData, ["authorized pickups"]))) {
        const pickupRelation = value(rawData, ["pickup relation", "authorized pickup relation"]) || null;
        const existingPickup = await prisma.authorizedPickup.findFirst({
          where: { familyId: family.id, fullName: pickup, phone: pickupPhone || null },
          select: { id: true },
        });
        if (existingPickup) {
          await prisma.authorizedPickup.update({
            where: { id: existingPickup.id },
            data: {
              relation: pickupRelation,
              verificationNotes: "Imported from ProCare export; director should verify identity requirements.",
              sourceSystem: "procare",
              externalId: externalValue(rawData, ["pickup id", "authorized pickup id"]) || undefined,
              customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
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
            externalId: externalValue(rawData, ["pickup id", "authorized pickup id"]),
            customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
            },
          });
          authorizedPickups += 1;
        }
      }

      if (balanceCents) {
        const account = await prisma.billingAccount.upsert({
          where: { familyId: family.id },
          update: {
            balanceCents,
            sourceSystem: "procare",
            externalId: accountExternalId || undefined,
            customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id }),
          },
          create: {
            familyId: family.id,
            balanceCents,
            sourceSystem: "procare",
            externalId: accountExternalId,
            customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id }),
          },
        });
        let importedInvoiceId: string | null = null;
        if (balanceCents > 0) {
          const invoiceExternalId = `procare-opening-balance:${accountExternalId || family.id}`;
          const invoiceNumberKey = (accountExternalId || family.id).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
          const existingInvoice = await prisma.invoice.findFirst({
            where: { sourceSystem: "procare", externalId: invoiceExternalId },
            select: { id: true },
          });
          if (existingInvoice) {
            await prisma.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                status: PaymentStatus.OPEN,
                totalCents: balanceCents,
                customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
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
                customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }),
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
        }
        await prisma.ledgerEntry.create({
          data: {
            billingAccountId: account.id,
            invoiceId: importedInvoiceId,
            type: "procare_balance",
            description: "Imported ProCare balance",
            amountCents: balanceCents,
            balanceAfterCents: balanceCents,
            sourceSystem: "procare",
            externalId: `${batch.id}:${index}`,
            metadata: { ...rawData, mappedCenterId: targetCenter.id },
          },
        });
        ledgerRows += 1;
      }

      rowResults.push({
        rowNumber: index + 1,
        status: "imported",
        rawData: { ...rawData, mappedCenterId: targetCenter.id, mappedCenter: targetCenter.crmLocationId ?? targetCenter.name },
        createdFamilyId: family.id,
        createdChildId: childId,
      });
    } catch (error) {
      rowResults.push({ rowNumber: index + 1, status: "error", message: error instanceof Error ? error.message : "Import failed", rawData });
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
  });

  const summary = {
    center: autoMap ? "Auto-mapped from ProCare export" : center.crmLocationId ?? center.name,
    sourceType: importPayload.sourceType,
    filename: importPayload.filename,
    sourceSha256,
    reviewFingerprint,
    rows: rowResults.length,
    imported: rowResults.filter((row) => row.status === "imported").length,
    errors: rowResults.filter((row) => row.status === "error").length,
    createdFamilies,
    updatedFamilies,
    createdChildren,
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
    ledgerRows,
    centersTouched: centersTouched.size,
  };

  await prisma.procareImportBatch.update({
    where: { id: batch.id },
    data: { status: summary.errors ? "completed_with_errors" : "completed", summary },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "procare.import.completed",
    resource: "ProcareImportBatch",
    resourceId: batch.id,
    metadata: summary,
  });

  return NextResponse.json({ ok: true, batchId: batch.id, summary, rowResults });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
