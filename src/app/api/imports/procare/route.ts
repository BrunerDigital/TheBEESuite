import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import {
  isActiveProcareStaffStatus,
  isActiveProcareEnrollmentStatus,
  analyzeProcareHeaders,
  applyProcareFieldMapping,
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
import { buildProcareMultiReportRows, buildProcareMultiReportRowsFromFiles } from "@/lib/procare-multi-report-import";

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
    const importWarning = value(rawData, ["import warning"]);
    if (importWarning) {
      warnings.push({ rowNumber, message: importWarning });
      rowResults.push({ rowNumber, status: "warning", entity: "unknown", center: targetCenter.crmLocationId ?? targetCenter.name, action: "Resolve account relationship", message: importWarning });
      continue;
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
    sourceFamilyGroups: importFamilyKeys.size,
    sourceChildGroups: importChildKeys.size,
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

async function readImportText(files: FormDataEntryValue[], pastedCsv: string) {
  const uploadedFiles = files.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!uploadedFiles.length) {
    return { text: pastedCsv, filename: "pasted-procare-import.csv", sourceType: "csv_text" };
  }

  const standardReportNames = new Set(["enrollment.csv", "parentinfo.csv", "relationships.csv", "childinfo.csv"]);
  const uploadedNames = uploadedFiles.map((file) => file.name.toLowerCase().split(/[\\/]/).pop() ?? file.name.toLowerCase());
  const isStandardReportSet = uploadedNames.some((name) => standardReportNames.has(name));
  if (uploadedFiles.length > 1 || isStandardReportSet) {
    const entries = new Map<string, Buffer>();
    for (const [index, file] of uploadedFiles.entries()) {
      const fileName = uploadedNames[index];
      if (!fileName.endsWith(".csv")) throw new Error("Select the four ProCare CSV reports together, or upload one ZIP file.");
      if (!standardReportNames.has(fileName)) throw new Error(`${file.name} is not one of the four standard ProCare reports. Choose only enrollment.csv, parentinfo.csv, relationships.csv, and childinfo.csv, or upload a consolidated CSV by itself.`);
      if (entries.has(fileName)) throw new Error(`More than one uploaded file is named ${fileName}.`);
      entries.set(fileName, Buffer.from(await file.arrayBuffer()));
    }
    const records = await buildProcareMultiReportRowsFromFiles(entries);
    const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
    return {
      text: JSON.stringify(records),
      filename: uploadedFiles.map((file) => file.name).join(", "),
      sourceType: "procare_multi_report_files",
      parsedRows: [headers, ...records.map((record) => headers.map((header) => record[header as keyof typeof record] ?? ""))],
    };
  }

  const file = uploadedFiles[0];
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".zip") && isZipBuffer(buffer)) {
    const records = await buildProcareMultiReportRows(buffer);
    const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
    return {
      text: JSON.stringify(records),
      filename: file.name,
      sourceType: "procare_multi_report_zip",
      parsedRows: [headers, ...records.map((record) => headers.map((header) => record[header as keyof typeof record] ?? ""))],
    };
  }
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
  if (!canAccessCenter(user, batch.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this import batch." }, { status: 403 });
  }

  if (reportType === "reconciliation") {
    const familyIds = [...new Set(batch.rows.map((row) => row.createdFamilyId).filter((id): id is string => Boolean(id)))];
    const childIds = [...new Set(batch.rows.map((row) => row.createdChildId).filter((id): id is string => Boolean(id)))];
    const sourceBalanceCents = batch.rows.reduce((sum, row) => {
      const raw = row.rawData && typeof row.rawData === "object" && !Array.isArray(row.rawData)
        ? Object.fromEntries(Object.entries(row.rawData).map(([key, field]) => [key, typeof field === "string" ? field : ""]))
        : {};
      return sum + cents(value(raw, ["balance", "account balance", "ledger balance", "amount due"]));
    }, 0);
    const [families, children, guardians, ledger] = await Promise.all([
      prisma.family.count({ where: { id: { in: familyIds }, centerId: batch.centerId } }),
      prisma.child.count({ where: { id: { in: childIds }, family: { centerId: batch.centerId } } }),
      prisma.guardian.count({ where: { familyId: { in: familyIds }, family: { centerId: batch.centerId } } }),
      prisma.ledgerEntry.aggregate({
        where: { sourceSystem: "procare", externalId: { startsWith: `${batch.id}:` }, billingAccount: { family: { centerId: batch.centerId } } },
        _sum: { amountCents: true },
      }),
    ]);
    const summary = batch.summary && typeof batch.summary === "object" && !Array.isArray(batch.summary)
      ? batch.summary as Record<string, unknown>
      : {};
    const report = buildProcareReconciliationReport({
      batchId: batch.id,
      sourceSha256: typeof summary.sourceSha256 === "string" ? summary.sourceSha256 : undefined,
      batchStatus: batch.status,
      importedRows: batch.rows.filter((row) => row.status === "imported").length,
      errorRows: batch.rows.filter((row) => row.status === "error").length,
      source: { families: familyIds.length, children: childIds.length, guardians: null, staff: null, classrooms: null, balanceCents: sourceBalanceCents, creditsCents: null, openInvoicesCents: null },
      target: { families, children, guardians, staff: null, classrooms: null, balanceCents: ledger._sum.amountCents ?? 0, creditsCents: null, openInvoicesCents: null },
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
  const requestedBatchId = clean(formData.get("batchId"));
  const requestedChunkStart = Math.max(Number.parseInt(clean(formData.get("chunkStart")), 10) || 1, 1);
  const parsedChunkSize = Number.parseInt(clean(formData.get("chunkSize")), 10);
  const requestedChunkSize = Number.isInteger(parsedChunkSize) && parsedChunkSize > 0
    ? Math.min(parsedChunkSize, 10)
    : Number.MAX_SAFE_INTEGER;
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
  if (rows.length < 2 || !headers.length) {
    return NextResponse.json({ ok: false, error: "No import rows found." }, { status: 400 });
  }

  const duplicateTargets = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateTargets.length) {
    return NextResponse.json({ ok: false, error: `Each ProCare column must map to a different BEE Suite field. Duplicate mapping: ${[...new Set(duplicateTargets)].join(", ")}.` }, { status: 400 });
  }
  const mappingSignature = JSON.stringify(Object.entries(fieldMapping).sort(([a], [b]) => a.localeCompare(b)));
  const sourceSha256 = procareSourceSha256(text);
  const reviewFingerprint = procareImportReviewFingerprint({
    text: `${text}\n#field-mapping:${mappingSignature}`,
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
      summary: { ...preview, sourceSha256, reviewFingerprint, headerAnalysis, fieldOptions: PROCARE_FIELD_OPTIONS },
    });
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
  const duplicateWarningRows = new Set(validationPreview.duplicateReviewRowNumbers);
  let stagedRowNumbers = new Set(validationPreview.warningRowNumbers.filter((rowNumber) => (
    !duplicateReviewConfirmed || !duplicateWarningRows.has(rowNumber)
  )));
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
  const centersTouched = new Set<string>();
  const rowResults: Array<{ rowNumber: number; status: string; message?: string; rawData: Record<string, string>; createdFamilyId?: string; createdChildId?: string }> = [];

  const existingBatch = requestedBatchId
    ? await prisma.procareImportBatch.findFirst({ where: { id: requestedBatchId, centerId: center.id, uploadedById: user.id, status: "processing" } })
    : null;
  if (requestedBatchId && !existingBatch) return NextResponse.json({ ok: false, error: "The resumable ProCare import batch could not be found." }, { status: 409 });
  const existingSummary = existingBatch?.summary && typeof existingBatch.summary === "object" && !Array.isArray(existingBatch.summary)
    ? existingBatch.summary as Record<string, unknown>
    : {};
  if (existingBatch && existingSummary.sourceSha256 !== sourceSha256) {
    return NextResponse.json({ ok: false, error: "The selected files changed while the import was running. Start a new import with one unchanged export." }, { status: 409 });
  }
  if (existingBatch && Array.isArray(existingSummary.stagedRowNumbers)) {
    stagedRowNumbers = new Set(existingSummary.stagedRowNumbers.filter((value): value is number => Number.isInteger(value)));
  }
  const batch = existingBatch ?? await prisma.procareImportBatch.create({
    data: {
      centerId: center.id,
      uploadedById: user.id,
      filename: importPayload.filename,
      status: "processing",
      summary: { sourceType: importPayload.sourceType, sourceSha256, reviewFingerprint, stagedRowNumbers: [...stagedRowNumbers] },
    },
  });
  const chunkStart = Math.min(requestedChunkStart, rows.length);
  const chunkEnd = Math.min(chunkStart + requestedChunkSize, rows.length);

  for (let index = chunkStart; index < chunkEnd; index += 1) {
    const rawData = Object.fromEntries(headers.map((header, column) => [header, rows[index]?.[column] ?? ""]));
    const rowNumber = index + 1;
    if (disposedRowNumbers.has(rowNumber)) {
      rowResults.push({ rowNumber, status: "disposed", message: "Disposed by the user during import reconciliation.", rawData });
      continue;
    }
    if (stagedRowNumbers.has(rowNumber)) {
      const warning = validationPreview.warnings.find((item) => item.rowNumber === rowNumber)?.message ?? "This row needs a field match or disposition.";
      rowResults.push({ rowNumber, status: "needs_resolution", message: warning, rawData });
      continue;
    }
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
      const familyDisplayName = familyName || (accountExternalId ? `${accountExternalId} Household` : childName || email);
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
              ...(familyName ? { name: familyName } : {}),
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
              name: familyDisplayName,
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
          classroomId = isActiveProcareEnrollmentStatus(enrollmentStatus) ? classroom.id : null;
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
              classroomId,
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

      const relationshipRecords = (() => {
        try {
          const parsed = JSON.parse(value(rawData, ["procare relationship records"]) || "[]") as unknown;
          return Array.isArray(parsed) ? parsed.filter((item): item is { externalId?: string; name?: string; relation?: string; email?: string; phone?: string; livesWith?: boolean; emergency?: boolean; authorizedPickup?: boolean; guardian?: boolean } => Boolean(item && typeof item === "object")) : [];
        } catch { return []; }
      })();
      for (const relationship of relationshipRecords) {
        const name = clean(relationship.name);
        if (!name) continue;
        if (relationship.guardian) {
          await syncGuardian({
            name,
            guardianEmail: clean(relationship.email).toLowerCase(),
            guardianPhone: clean(relationship.phone),
            externalId: clean(relationship.externalId) || null,
            relation: clean(relationship.relation) || "Guardian",
            billingContact: false,
            employer: "",
          });
        }
        if (relationship.emergency) {
          const contactPhone = clean(relationship.phone) || "Not imported";
          const existingContact = await prisma.emergencyContact.findFirst({ where: { familyId: family.id, fullName: name, phone: contactPhone }, select: { id: true } });
          if (!existingContact) {
            await prisma.emergencyContact.create({ data: { familyId: family.id, fullName: name, phone: contactPhone, relation: clean(relationship.relation) || "Emergency Contact", sourceSystem: "procare", externalId: clean(relationship.externalId) || null, customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId, livesWith: Boolean(relationship.livesWith) }) } });
            emergencyContacts += 1;
          }
        }
        if (relationship.authorizedPickup) {
          const pickupPhone = clean(relationship.phone) || null;
          const existingPickup = await prisma.authorizedPickup.findFirst({ where: { familyId: family.id, fullName: name, phone: pickupPhone }, select: { id: true } });
          if (!existingPickup) {
            await prisma.authorizedPickup.create({ data: { familyId: family.id, fullName: name, phone: pickupPhone, relation: clean(relationship.relation) || null, verificationNotes: "Imported from ProCare; director should verify identity requirements.", sourceSystem: "procare", externalId: clean(relationship.externalId) || null, customFields: metadataFromRow(rawData, { mappedCenterId: targetCenter.id, accountExternalId }) } });
            authorizedPickups += 1;
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
  });

  const cumulativeNumber = (key: string, current: number) => Number(existingSummary[key] ?? 0) + current;
  const progress = await prisma.procareImportRow.groupBy({ by: ["status"], where: { batchId: batch.id }, _count: { _all: true } });
  const progressCounts = Object.fromEntries(progress.map((item) => [item.status, item._count._all]));
  const isPartial = chunkEnd < rows.length;
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
    rows: Object.values(progressCounts).reduce((total, count) => total + count, 0),
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
    centersTouched: Math.max(Number(existingSummary.centersTouched ?? 0), centersTouched.size),
    stagedRowNumbers: [...stagedRowNumbers],
    headerAnalysis,
    fieldOptions: PROCARE_FIELD_OPTIONS,
    warningRows: progressCounts.needs_resolution ?? 0,
    duplicateReviewRows: validationPreview.duplicateReviewRows,
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

  if (isPartial) {
    return NextResponse.json({ ok: true, partial: true, batchId: batch.id, nextRow: chunkEnd, totalRows: rows.length - 1, summary });
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
  const batch = body?.batchId ? await prisma.procareImportBatch.findUnique({ where: { id: body.batchId }, select: { id: true, centerId: true } }) : null;
  if (!batch || !canAccessCenter(user, batch.centerId)) return NextResponse.json({ ok: false, error: "Import batch not found." }, { status: 404 });
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
