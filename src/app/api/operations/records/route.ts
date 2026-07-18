import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageBilling, canManageOperations, canManageStaffCompensation, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { readCenterTimeZone } from "@/lib/attendance-state";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import { hashStaffPin, normalizePin } from "@/lib/kiosk";
import { notifyOperationsRecordChange } from "@/lib/operations-notifications";
import { centerScopedAccessGuard, classroomFamilyGuard, scopedUpdateGuard } from "@/lib/operations-guardrails";
import { normalizeCampaignDraft } from "@/lib/marketing-workflows";
import { prisma } from "@/lib/prisma";
import { buildWeeklyStaffScheduleRequests, normalizeWeekdayIndexes } from "@/lib/staff-scheduling";
import { hasStaffCompensationPayload, normalizeStaffCompensationPayload, staffCompensationCustomFields } from "@/lib/staff-compensation";
import {
  normalizeStaffClockAction,
  normalizeStaffClockEventEdits,
  readStaffClockState,
  staffClockEditFields,
  staffClockFields,
  staffKioskPinFields,
  validateNextStaffClockAction,
} from "@/lib/staff-kiosk";
import { generateTeacherLoginCredentials, isGeneratedTeacherLoginEmail, type TeacherLoginCredentials } from "@/lib/teacher-login";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";
import {
  dailyReportEmailRecipientCustomFields,
  dailyReportEmailRecipientGuardianIdsFromPayload,
  DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY,
} from "@/lib/daily-report-email-settings";
import {
  disableParentPortalLoginForGuardian,
  ensureParentPortalLoginForGuardian,
  parentPortalAccessFields,
} from "@/lib/parent-portal-logins";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function fillBlank(primary: string | null | undefined, duplicate: string | null | undefined) {
  return primary && primary.trim() ? primary : duplicate || null;
}

function mergeText(primary: string | null | undefined, duplicate: string | null | undefined) {
  const primaryText = primary?.trim() || "";
  const duplicateText = duplicate?.trim() || "";
  if (!primaryText) return duplicateText || null;
  if (!duplicateText || primaryText.toLowerCase() === duplicateText.toLowerCase()) return primaryText;
  return `${primaryText}\n${duplicateText}`;
}

function mergeCustomFields(
  existing: unknown,
  input: {
    mergedIdsKey: string;
    mergedId: string;
    lastMergeKey: string;
    lastMerge: Prisma.InputJsonObject;
  },
) {
  const fields = jsonObject(existing);
  return {
    ...fields,
    [input.mergedIdsKey]: Array.from(new Set([...stringList(fields[input.mergedIdsKey]), input.mergedId])),
    [input.lastMergeKey]: input.lastMerge,
  } as Prisma.InputJsonObject;
}

function intValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dollarsToCents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function requestedStatus(value: unknown) {
  const status = clean(value).toUpperCase();
  return Object.values(DocumentStatus).includes(status as DocumentStatus) ? status as DocumentStatus : DocumentStatus.REQUESTED;
}

const notificationEntities = new Set([
  "classroom",
  "family",
  "guardian",
  "child",
  "allergy",
  "medicalNote",
  "authorizedPickup",
  "emergencyContact",
  "document",
  "staff",
  "staffAssignment",
  "staffSchedule",
  "staffTimeClock",
]);

function resultRecordId(result: unknown) {
  return typeof result === "object" && result && "id" in result ? String(result.id) : null;
}

function normalizeFormSchema(value: unknown): Prisma.InputJsonObject {
  const text = clean(value);
  if (!text) return { fields: [] };

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return {
        fields: parsed
          .filter((field) => field && typeof field === "object")
          .map((field) => {
            const row = field as Record<string, unknown>;
            return {
              key: clean(row.key),
              label: clean(row.label),
              type: clean(row.type) || "text",
              required: Boolean(row.required),
              parentVisible: Boolean(row.parentVisible),
              staffOnly: Boolean(row.staffOnly),
              helpText: clean(row.helpText) || null,
              options: Array.isArray(row.options)
                ? row.options.map((option) => clean(option)).filter(Boolean)
                : clean(row.options)
                  ? clean(row.options).split(",").map((option) => option.trim()).filter(Boolean)
                  : [],
            };
          })
          .filter((field) => field.key && field.label),
      };
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Prisma.InputJsonObject;
    }
  } catch {
    return {
      fields: text
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean)
        .map((field) => ({
          key: field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
          label: field,
          type: "text",
          required: false,
          parentVisible: true,
          staffOnly: false,
          helpText: null,
          options: [],
        })),
    };
  }

  return { fields: [] };
}

async function provisionTeacherLogin(input: {
  login: TeacherLoginCredentials;
  name: string;
}) {
  return upsertSupabaseAuthUserWithPassword({
    email: input.login.email,
    name: input.name,
    password: input.login.temporary_password,
    role: UserRole.TEACHER,
    source: "bee_suite_school_staff_management",
  });
}

function staffProfileCustomFields(existingCustomFields: unknown, submittedEmail: string) {
  const fields = jsonObject(existingCustomFields);
  const contactEmail = submittedEmail.toLowerCase();
  if (contactEmail && !isGeneratedTeacherLoginEmail(contactEmail)) {
    return {
      ...fields,
      staffContactEmail: contactEmail,
    } as Prisma.InputJsonObject;
  }
  return Object.keys(fields).length ? fields as Prisma.InputJsonObject : undefined;
}

type TeacherCenterGrantDb = Pick<Prisma.TransactionClient, "userAccessGrant">;

async function ensureTeacherCenterGrant(input: {
  userId: string;
  tenantId: string;
  organizationId: string;
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
        organizationId: input.organizationId,
      },
    });
  }

  return db.userAccessGrant.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      centerId: input.centerId,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      permissions: { createdFromSchoolStaffManagement: true },
    },
  });
}

async function assertCenterAccess(user: Awaited<ReturnType<typeof getCurrentUser>>, centerId: string) {
  if (!user) throw new Error("Authentication required.");
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, organizationId: true },
  });
  if (!center) return { ok: false as const, status: 404, error: "Center not found." };
  if (!canAccessCenter(user, center.id)) {
    return { ok: false as const, status: 403, error: "You do not have access to this center." };
  }
  return { ok: true as const, center };
}

async function assertFamilyAccess(user: Awaited<ReturnType<typeof getCurrentUser>>, familyId: string) {
  if (!user) throw new Error("Authentication required.");
  const family = await prisma.family.findUnique({ where: { id: familyId }, select: { centerId: true } });
  if (!family) return { ok: false as const, status: 404, error: "Family not found." };
  const guard = centerScopedAccessGuard({
    centerId: family.centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(family.centerId && canAccessCenter(user, family.centerId)),
    resourceLabel: "Family",
  });
  if (!guard.ok) {
    return { ok: false as const, status: guard.status, error: guard.error };
  }
  return { ok: true as const, centerId: family.centerId };
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const entity = clean(body.entity);
  const id = clean(body.id);
  const mode = id ? "updated" : "created";
  const auditMetadata: Record<string, Prisma.InputJsonValue> = { mode };

  if (!entity) {
    return NextResponse.json({ ok: false, error: "Entity is required." }, { status: 400 });
  }

  if (["product", "tuitionPlan", "invoice", "ledgerEntry"].includes(entity) && !canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing settings are not allowed for this role." }, { status: 403 });
  }
  if (!["product", "tuitionPlan", "invoice", "ledgerEntry"].includes(entity) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Record management is not allowed for this role." }, { status: 403 });
  }

  let result: unknown;
  let login: TeacherLoginCredentials | undefined;
  let centerId: string | null = user.primaryCenterId;

  if (entity === "classroom") {
    const requestedCenterId = clean(body.centerId) || clean(body.relatedId) || user.primaryCenterId;
    if (!requestedCenterId) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
    const access = await assertCenterAccess(user, requestedCenterId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.center.id;
    const data = {
      centerId,
      name: clean(body.name),
      ageGroup: clean(body.ageGroup) || clean(body.type) || "Preschool",
      capacity: intValue(body.capacity || body.amountDollars || body.amountCents, 12),
      ratioRule: clean(body.ratioRule) || clean(body.status) || null,
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Classroom name is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.classroom.findUnique({ where: { id }, select: { centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Classroom", expectedScopeId: centerId, actualScopeId: existing?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.classroom.update({ where: { id }, data }) : await prisma.classroom.create({ data });
  } else if (entity === "family") {
    const requestedCenterId = clean(body.centerId) || clean(body.relatedId) || user.primaryCenterId;
    if (!requestedCenterId) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
    const access = await assertCenterAccess(user, requestedCenterId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.center.id;
    const dailyReportRecipientSelectionProvided = Object.prototype.hasOwnProperty.call(
      body,
      DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY,
    );
    const dailyReportEmailRecipientGuardianIds = dailyReportRecipientSelectionProvided
      ? dailyReportEmailRecipientGuardianIdsFromPayload(body[DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY])
      : [];
    const existing = id
      ? await prisma.family.findUnique({ where: { id }, select: { centerId: true, customFields: true } })
      : null;
    let familyCustomFields: Prisma.InputJsonObject | undefined;
    if (dailyReportRecipientSelectionProvided) {
      if (!id && dailyReportEmailRecipientGuardianIds.length) {
        return NextResponse.json({ ok: false, error: "Save the family before selecting daily report recipients." }, { status: 400 });
      }
      if (id) {
        const guardians = await prisma.guardian.findMany({
          where: { familyId: id },
          select: { id: true },
        });
        const familyGuardianIds = new Set(guardians.map((guardian) => guardian.id));
        const invalidGuardianIds = dailyReportEmailRecipientGuardianIds.filter((guardianId) => !familyGuardianIds.has(guardianId));
        if (invalidGuardianIds.length) {
          return NextResponse.json({ ok: false, error: "Daily report recipients must belong to this family." }, { status: 400 });
        }
      }
      familyCustomFields = dailyReportEmailRecipientCustomFields(
        existing?.customFields,
        dailyReportEmailRecipientGuardianIds,
      ) as Prisma.InputJsonObject;
    }
    const data = {
      centerId,
      name: clean(body.name),
      address: clean(body.address) || null,
      billingEmail: clean(body.billingEmail) || clean(body.type) || null,
      notes: clean(body.notes) || clean(body.body) || null,
      custodyNotes: clean(body.custodyNotes) || null,
      ...(familyCustomFields ? { customFields: familyCustomFields } : {}),
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Family name is required." }, { status: 400 });
    if (id) {
      const guard = scopedUpdateGuard({ entity: "Family", expectedScopeId: centerId, actualScopeId: existing?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.family.update({ where: { id }, data }) : await prisma.family.create({ data });
  } else if (entity === "familyMerge") {
    const primaryFamilyId = clean(body.primaryFamilyId) || clean(body.familyId);
    const duplicateFamilyId = clean(body.duplicateFamilyId) || clean(body.relatedId);
    if (!primaryFamilyId || !duplicateFamilyId) {
      return NextResponse.json({ ok: false, error: "Primary and duplicate family IDs are required." }, { status: 400 });
    }
    if (primaryFamilyId === duplicateFamilyId) {
      return NextResponse.json({ ok: false, error: "Choose two different family accounts to merge." }, { status: 400 });
    }
    const [primaryAccess, duplicateAccess] = await Promise.all([
      assertFamilyAccess(user, primaryFamilyId),
      assertFamilyAccess(user, duplicateFamilyId),
    ]);
    if (!primaryAccess.ok) return NextResponse.json({ ok: false, error: primaryAccess.error }, { status: primaryAccess.status });
    if (!duplicateAccess.ok) return NextResponse.json({ ok: false, error: duplicateAccess.error }, { status: duplicateAccess.status });
    if (primaryAccess.centerId !== duplicateAccess.centerId) {
      return NextResponse.json({ ok: false, error: "Family accounts must belong to the same school before merging." }, { status: 400 });
    }
    centerId = primaryAccess.centerId;
    const mergedAt = new Date();
    result = await prisma.$transaction(async (tx) => {
      const [primary, duplicate] = await Promise.all([
        tx.family.findUnique({ where: { id: primaryFamilyId }, include: { billingAccount: true } }),
        tx.family.findUnique({ where: { id: duplicateFamilyId }, include: { billingAccount: true } }),
      ]);
      if (!primary || !duplicate) throw new Error("Family account not found.");

      await Promise.all([
        tx.guardian.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.child.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.authorizedPickup.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.emergencyContact.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.message.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.document.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.note.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
        tx.formSubmission.updateMany({ where: { familyId: duplicateFamilyId }, data: { familyId: primaryFamilyId } }),
      ]);

      if (duplicate.billingAccount && primary.billingAccount) {
        await Promise.all([
          tx.invoice.updateMany({
            where: { billingAccountId: duplicate.billingAccount.id },
            data: { billingAccountId: primary.billingAccount.id },
          }),
          tx.payment.updateMany({
            where: { billingAccountId: duplicate.billingAccount.id },
            data: { billingAccountId: primary.billingAccount.id },
          }),
          tx.ledgerEntry.updateMany({
            where: { billingAccountId: duplicate.billingAccount.id },
            data: { billingAccountId: primary.billingAccount.id },
          }),
        ]);
        const updatedAccount = await tx.billingAccount.update({
          where: { id: primary.billingAccount.id },
          data: { balanceCents: { increment: duplicate.billingAccount.balanceCents } },
        });
        if (duplicate.billingAccount.balanceCents) {
          await tx.ledgerEntry.create({
            data: {
              billingAccountId: primary.billingAccount.id,
              type: "family_merge",
              description: `Merged balance from ${duplicate.name}`,
              amountCents: duplicate.billingAccount.balanceCents,
              balanceAfterCents: updatedAccount.balanceCents,
              sourceSystem: "bee_suite",
              externalId: `family-merge:${duplicateFamilyId}:${mergedAt.getTime()}`,
              metadata: { duplicateFamilyId, primaryFamilyId, mergedBy: user.email },
            },
          });
        }
        await tx.billingAccount.delete({ where: { id: duplicate.billingAccount.id } });
      } else if (duplicate.billingAccount && !primary.billingAccount) {
        await tx.billingAccount.update({
          where: { id: duplicate.billingAccount.id },
          data: { familyId: primaryFamilyId },
        });
      }

      await tx.family.update({
        where: { id: primaryFamilyId },
        data: {
          notes: [primary.notes, `Merged duplicate family "${duplicate.name}" on ${mergedAt.toISOString()} by ${user.email}.`]
            .filter(Boolean)
            .join("\n"),
          customFields: {
            ...jsonObject(primary.customFields),
            lastFamilyMerge: { duplicateFamilyId, duplicateName: duplicate.name, mergedAt: mergedAt.toISOString(), mergedBy: user.email },
          },
        },
      });

      const archivedDuplicate = await tx.family.update({
        where: { id: duplicateFamilyId },
        data: {
          centerId: null,
          name: `[Merged] ${duplicate.name}`,
          notes: [duplicate.notes, `Merged into ${primary.name} (${primaryFamilyId}) on ${mergedAt.toISOString()} by ${user.email}.`]
            .filter(Boolean)
            .join("\n"),
          customFields: {
            ...jsonObject(duplicate.customFields),
            mergedIntoFamilyId: primaryFamilyId,
            mergedIntoFamilyName: primary.name,
            mergedAt: mergedAt.toISOString(),
            mergedBy: user.email,
          },
        },
      });

      return { primaryFamilyId, duplicateFamilyId, archivedDuplicateId: archivedDuplicate.id };
    });
    auditMetadata.primaryFamilyId = primaryFamilyId;
    auditMetadata.duplicateFamilyId = duplicateFamilyId;
  } else if (entity === "guardian") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const existing = id
      ? await prisma.guardian.findUnique({ where: { id }, select: { familyId: true, checkInPinHash: true, customFields: true, userId: true } })
      : null;
    if (id) {
      const guard = scopedUpdateGuard({ entity: "Guardian", expectedScopeId: familyId, actualScopeId: existing?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const parentPortalLoginEnabledProvided = Object.prototype.hasOwnProperty.call(body, "parentPortalLoginEnabled");
    const parentPortalLoginEnabled = parentPortalLoginEnabledProvided
      ? optionalBoolean(body.parentPortalLoginEnabled) !== false
      : true;
    const data = {
      familyId,
      fullName: clean(body.name),
      email: clean(body.email) || clean(body.type) || null,
      phone: clean(body.phone) || null,
      employer: clean(body.employer) || null,
      relation: clean(body.relation) || clean(body.status) || "Guardian",
      preferredCommunication: clean(body.preferredCommunication) || null,
      isBillingContact: Boolean(body.isBillingContact),
      ...((parentPortalLoginEnabledProvided || !id)
        ? {
            customFields: parentPortalAccessFields({
              customFields: existing?.customFields,
              enabled: parentPortalLoginEnabled,
              actorEmail: user.email,
            }),
          }
        : {}),
    };
    if (!data.fullName) return NextResponse.json({ ok: false, error: "Guardian name is required." }, { status: 400 });
    const guardian = id ? await prisma.guardian.update({ where: { id }, data }) : await prisma.guardian.create({ data });
    const defaultPinData = !guardian.checkInPinHash
      ? defaultGuardianPinUpdate({ guardianId: guardian.id, phone: guardian.phone, setById: user.id })
      : null;
    result = defaultPinData
      ? await prisma.guardian.update({ where: { id: guardian.id }, data: defaultPinData })
      : guardian;
    auditMetadata.defaultGuardianPinSet = Boolean(defaultPinData);
    auditMetadata.parentPortalLoginEnabled = parentPortalLoginEnabled;
    if (parentPortalLoginEnabled) {
      try {
        const parentPortal = await ensureParentPortalLoginForGuardian({
          guardianId: guardian.id,
          linkedBy: user.email,
        });
        auditMetadata.parentPortalLogin = parentPortal.ok
          ? {
              status: "linked",
              parentUserId: parentPortal.userId,
              linkedGuardianIds: parentPortal.linkedGuardianIds,
              created: parentPortal.created,
              reactivated: parentPortal.reactivated,
              defaultPasswordSet: parentPortal.defaultPasswordSet,
            }
          : {
              status: "skipped",
              reason: parentPortal.reason,
            };
      } catch (error) {
        auditMetadata.parentPortalLogin = {
          status: "failed",
          error: error instanceof Error ? error.message : "Parent portal login could not be created.",
        };
      }
    } else {
      const disabledPortal = await disableParentPortalLoginForGuardian({
        guardianId: guardian.id,
        actorEmail: user.email,
        previousUserId: existing?.userId,
      });
      auditMetadata.parentPortalLogin = disabledPortal.ok
        ? {
            status: "disabled",
            unlinkedUserId: disabledPortal.unlinkedUserId,
            deactivatedUser: disabledPortal.deactivatedUser,
          }
        : {
            status: "failed",
            reason: disabledPortal.reason,
          };
    }
  } else if (entity === "guardianMerge") {
    const primaryGuardianId = clean(body.primaryGuardianId) || clean(body.guardianId);
    const duplicateGuardianId = clean(body.duplicateGuardianId) || clean(body.relatedId);
    if (!primaryGuardianId || !duplicateGuardianId) {
      return NextResponse.json({ ok: false, error: "Primary and duplicate guardian IDs are required." }, { status: 400 });
    }
    if (primaryGuardianId === duplicateGuardianId) {
      return NextResponse.json({ ok: false, error: "Choose two different guardian records to merge." }, { status: 400 });
    }

    const [primary, duplicate] = await Promise.all([
      prisma.guardian.findUnique({
        where: { id: primaryGuardianId },
        select: {
          id: true,
          familyId: true,
          userId: true,
          fullName: true,
          email: true,
          phone: true,
          employer: true,
          relation: true,
          preferredCommunication: true,
          isBillingContact: true,
          checkInPinHash: true,
          checkInPinSetAt: true,
          checkInPinSetById: true,
          customFields: true,
          family: { select: { centerId: true } },
        },
      }),
      prisma.guardian.findUnique({
        where: { id: duplicateGuardianId },
        select: {
          id: true,
          familyId: true,
          userId: true,
          fullName: true,
          email: true,
          phone: true,
          employer: true,
          relation: true,
          preferredCommunication: true,
          isBillingContact: true,
          checkInPinHash: true,
          checkInPinSetAt: true,
          checkInPinSetById: true,
          customFields: true,
          family: { select: { centerId: true } },
        },
      }),
    ]);
    if (!primary || !duplicate) {
      return NextResponse.json({ ok: false, error: "Guardian record not found." }, { status: 404 });
    }
    if (primary.userId && duplicate.userId && primary.userId !== duplicate.userId) {
      return NextResponse.json(
        { ok: false, error: "Both guardian records are linked to different parent portal users. Resolve one parent account before merging." },
        { status: 400 },
      );
    }

    const [primaryAccess, duplicateAccess] = await Promise.all([
      assertFamilyAccess(user, primary.familyId),
      assertFamilyAccess(user, duplicate.familyId),
    ]);
    if (!primaryAccess.ok) return NextResponse.json({ ok: false, error: primaryAccess.error }, { status: primaryAccess.status });
    if (!duplicateAccess.ok) return NextResponse.json({ ok: false, error: duplicateAccess.error }, { status: duplicateAccess.status });
    if (primaryAccess.centerId !== duplicateAccess.centerId) {
      return NextResponse.json({ ok: false, error: "Guardian records must belong to the same school before merging." }, { status: 400 });
    }

    centerId = primaryAccess.centerId;
    const mergedAt = new Date();
    result = await prisma.$transaction(async (tx) => {
      await tx.checkInOutLog.updateMany({
        where: { guardianId: duplicateGuardianId },
        data: { guardianId: primaryGuardianId },
      });
      const mergedGuardian = await tx.guardian.update({
        where: { id: primaryGuardianId },
        data: {
          userId: primary.userId ?? duplicate.userId ?? null,
          email: fillBlank(primary.email, duplicate.email),
          phone: fillBlank(primary.phone, duplicate.phone),
          employer: fillBlank(primary.employer, duplicate.employer),
          preferredCommunication: fillBlank(primary.preferredCommunication, duplicate.preferredCommunication),
          isBillingContact: primary.isBillingContact || duplicate.isBillingContact,
          checkInPinHash: primary.checkInPinHash ?? duplicate.checkInPinHash ?? null,
          checkInPinSetAt: primary.checkInPinSetAt ?? duplicate.checkInPinSetAt ?? null,
          checkInPinSetById: primary.checkInPinSetById ?? duplicate.checkInPinSetById ?? null,
          customFields: mergeCustomFields(primary.customFields, {
            mergedIdsKey: "mergedGuardianIds",
            mergedId: duplicateGuardianId,
            lastMergeKey: "lastGuardianMerge",
            lastMerge: {
              duplicateGuardianId,
              duplicateName: duplicate.fullName,
              duplicateFamilyId: duplicate.familyId,
              mergedAt: mergedAt.toISOString(),
              mergedBy: user.email,
            },
          }),
        },
      });
      await tx.guardian.delete({ where: { id: duplicateGuardianId } });
      return { primaryGuardianId, duplicateGuardianId, guardian: mergedGuardian };
    });
    auditMetadata.primaryGuardianId = primaryGuardianId;
    auditMetadata.duplicateGuardianId = duplicateGuardianId;
    auditMetadata.mode = "merged";
  } else if (entity === "child") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const classroomId = clean(body.classroomId) || null;
    if (classroomId) {
      const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { centerId: true } });
      if (!classroom || (classroom.centerId && !canAccessCenter(user, classroom.centerId))) {
        return NextResponse.json({ ok: false, error: "You do not have access to this classroom." }, { status: 403 });
      }
      const guard = classroomFamilyGuard(centerId, classroom.centerId);
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const existingChild = id ? await prisma.child.findUnique({ where: { id }, select: { familyId: true, customFields: true } }) : null;
    const careScheduleType = clean(body.careScheduleType || body.fteScheduleType || body.fullTimePartTime).toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const existingCustomFields = jsonObject(existingChild?.customFields);
    const customFields = ["full_time", "part_time"].includes(careScheduleType)
      ? { ...existingCustomFields, careScheduleType, fteScheduleType: careScheduleType } as Prisma.InputJsonObject
      : Object.keys(existingCustomFields).length
        ? existingCustomFields as Prisma.InputJsonObject
        : undefined;
    const data = {
      familyId,
      classroomId,
      fullName: clean(body.name),
      preferredName: clean(body.preferredName) || null,
      dateOfBirth: parseDate(body.dateOfBirth || body.expiresAt) ?? new Date("2021-01-01T12:00:00.000Z"),
      ageGroup: clean(body.ageGroup) || clean(body.type) || "Preschool",
      enrollmentStatus: clean(body.enrollmentStatus) || clean(body.status) || "enrolled",
      startDate: parseDate(body.startDate),
      schedule: clean(body.schedule) ? { notes: clean(body.schedule) } : undefined,
      photoVideoPermission: Boolean(body.photoVideoPermission),
      fieldTripPermission: Boolean(body.fieldTripPermission),
      napNotes: clean(body.napNotes) || null,
      feedingNotes: clean(body.feedingNotes) || null,
      pottyNotes: clean(body.pottyNotes) || null,
      developmentalNotes: clean(body.body) || null,
      customFields,
    };
    if (!data.fullName) return NextResponse.json({ ok: false, error: "Child name is required." }, { status: 400 });
    if (id) {
      const guard = scopedUpdateGuard({ entity: "Child", expectedScopeId: familyId, actualScopeId: existingChild?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.child.update({ where: { id }, data }) : await prisma.child.create({ data });
  } else if (entity === "childMerge") {
    const primaryChildId = clean(body.primaryChildId) || clean(body.childId);
    const duplicateChildId = clean(body.duplicateChildId) || clean(body.relatedId);
    if (!primaryChildId || !duplicateChildId) {
      return NextResponse.json({ ok: false, error: "Primary and duplicate child IDs are required." }, { status: 400 });
    }
    if (primaryChildId === duplicateChildId) {
      return NextResponse.json({ ok: false, error: "Choose two different child records to merge." }, { status: 400 });
    }

    const [primary, duplicate] = await Promise.all([
      prisma.child.findUnique({
        where: { id: primaryChildId },
        select: {
          id: true,
          familyId: true,
          classroomId: true,
          fullName: true,
          preferredName: true,
          dateOfBirth: true,
          ageGroup: true,
          enrollmentStatus: true,
          startDate: true,
          schedule: true,
          photoVideoPermission: true,
          fieldTripPermission: true,
          napNotes: true,
          feedingNotes: true,
          pottyNotes: true,
          developmentalNotes: true,
          customFields: true,
          family: { select: { centerId: true } },
        },
      }),
      prisma.child.findUnique({
        where: { id: duplicateChildId },
        select: {
          id: true,
          familyId: true,
          classroomId: true,
          fullName: true,
          preferredName: true,
          dateOfBirth: true,
          ageGroup: true,
          enrollmentStatus: true,
          startDate: true,
          schedule: true,
          photoVideoPermission: true,
          fieldTripPermission: true,
          napNotes: true,
          feedingNotes: true,
          pottyNotes: true,
          developmentalNotes: true,
          customFields: true,
          family: { select: { centerId: true } },
        },
      }),
    ]);
    if (!primary || !duplicate) {
      return NextResponse.json({ ok: false, error: "Child record not found." }, { status: 404 });
    }

    const [primaryAccess, duplicateAccess] = await Promise.all([
      assertFamilyAccess(user, primary.familyId),
      assertFamilyAccess(user, duplicate.familyId),
    ]);
    if (!primaryAccess.ok) return NextResponse.json({ ok: false, error: primaryAccess.error }, { status: primaryAccess.status });
    if (!duplicateAccess.ok) return NextResponse.json({ ok: false, error: duplicateAccess.error }, { status: duplicateAccess.status });
    if (primaryAccess.centerId !== duplicateAccess.centerId) {
      return NextResponse.json({ ok: false, error: "Child records must belong to the same school before merging." }, { status: 400 });
    }

    centerId = primaryAccess.centerId;
    const mergedAt = new Date();
    result = await prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.childMedicalNote.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.allergy.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.enrollment.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.document.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId, familyId: primary.familyId } }),
        tx.attendanceRecord.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.checkInOutLog.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.dailyReport.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.childMedia.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.incidentReport.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
        tx.medicationLog.updateMany({ where: { childId: duplicateChildId }, data: { childId: primaryChildId } }),
      ]);
      const mergedChild = await tx.child.update({
        where: { id: primaryChildId },
        data: {
          preferredName: fillBlank(primary.preferredName, duplicate.preferredName),
          classroomId: primary.classroomId ?? duplicate.classroomId ?? null,
          ageGroup: primary.ageGroup || duplicate.ageGroup,
          enrollmentStatus: primary.enrollmentStatus === "inactive" ? duplicate.enrollmentStatus : primary.enrollmentStatus,
          startDate: primary.startDate ?? duplicate.startDate ?? null,
          ...(primary.schedule ? {} : duplicate.schedule ? { schedule: duplicate.schedule as Prisma.InputJsonValue } : {}),
          photoVideoPermission: primary.photoVideoPermission || duplicate.photoVideoPermission,
          fieldTripPermission: primary.fieldTripPermission || duplicate.fieldTripPermission,
          napNotes: mergeText(primary.napNotes, duplicate.napNotes),
          feedingNotes: mergeText(primary.feedingNotes, duplicate.feedingNotes),
          pottyNotes: mergeText(primary.pottyNotes, duplicate.pottyNotes),
          developmentalNotes: mergeText(primary.developmentalNotes, duplicate.developmentalNotes),
          customFields: mergeCustomFields(primary.customFields, {
            mergedIdsKey: "mergedChildIds",
            mergedId: duplicateChildId,
            lastMergeKey: "lastChildMerge",
            lastMerge: {
              duplicateChildId,
              duplicateName: duplicate.fullName,
              duplicateFamilyId: duplicate.familyId,
              mergedAt: mergedAt.toISOString(),
              mergedBy: user.email,
            },
          }),
        },
      });
      await tx.child.delete({ where: { id: duplicateChildId } });
      return { primaryChildId, duplicateChildId, child: mergedChild };
    });
    auditMetadata.primaryChildId = primaryChildId;
    auditMetadata.duplicateChildId = duplicateChildId;
    auditMetadata.mode = "merged";
  } else if (entity === "authorizedPickup") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const data = {
      familyId,
      fullName: clean(body.name),
      phone: clean(body.phone) || clean(body.type) || null,
      relation: clean(body.relation) || clean(body.type) || null,
      verificationNotes: clean(body.verificationNotes) || clean(body.body) || null,
    };
    if (!data.fullName) return NextResponse.json({ ok: false, error: "Authorized pickup name is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.authorizedPickup.findUnique({ where: { id }, select: { familyId: true } });
      const guard = scopedUpdateGuard({ entity: "AuthorizedPickup", expectedScopeId: familyId, actualScopeId: existing?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.authorizedPickup.update({ where: { id }, data }) : await prisma.authorizedPickup.create({ data });
  } else if (entity === "emergencyContact") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const data = {
      familyId,
      fullName: clean(body.name),
      phone: clean(body.phone) || clean(body.type),
      relation: clean(body.relation) || clean(body.status) || "Emergency contact",
    };
    if (!data.fullName || !data.phone) return NextResponse.json({ ok: false, error: "Emergency contact name and phone are required." }, { status: 400 });
    if (id) {
      const existing = await prisma.emergencyContact.findUnique({ where: { id }, select: { familyId: true } });
      const guard = scopedUpdateGuard({ entity: "EmergencyContact", expectedScopeId: familyId, actualScopeId: existing?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.emergencyContact.update({ where: { id }, data }) : await prisma.emergencyContact.create({ data });
  } else if (entity === "allergy") {
    const childId = clean(body.childId) || clean(body.relatedId);
    if (!childId) return NextResponse.json({ ok: false, error: "Child ID is required." }, { status: 400 });
    const child = await prisma.child.findUnique({ where: { id: childId }, select: { familyId: true, family: { select: { centerId: true } } } });
    if (!child) return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, child.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = child.family.centerId;
    const data = {
      childId,
      allergen: clean(body.allergen) || clean(body.name),
      severity: clean(body.severity) || clean(body.status) || "Needs review",
      actionPlan: clean(body.actionPlan) || clean(body.body) || null,
    };
    if (!data.allergen) return NextResponse.json({ ok: false, error: "Allergen is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.allergy.findUnique({ where: { id }, select: { childId: true } });
      const guard = scopedUpdateGuard({ entity: "Allergy", expectedScopeId: childId, actualScopeId: existing?.childId, scopeLabel: "child" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.allergy.update({ where: { id }, data }) : await prisma.allergy.create({ data });
  } else if (entity === "medicalNote") {
    const childId = clean(body.childId) || clean(body.relatedId);
    if (!childId) return NextResponse.json({ ok: false, error: "Child ID is required." }, { status: 400 });
    const child = await prisma.child.findUnique({ where: { id: childId }, select: { familyId: true, family: { select: { centerId: true } } } });
    if (!child) return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, child.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = child.family.centerId;
    const data = {
      childId,
      category: clean(body.category) || clean(body.type) || "Medical note",
      note: clean(body.note) || clean(body.body),
      restricted: body.restricted === undefined ? true : Boolean(body.restricted),
    };
    if (!data.note) return NextResponse.json({ ok: false, error: "Medical note is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.childMedicalNote.findUnique({ where: { id }, select: { childId: true } });
      const guard = scopedUpdateGuard({ entity: "ChildMedicalNote", expectedScopeId: childId, actualScopeId: existing?.childId, scopeLabel: "child" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.childMedicalNote.update({ where: { id }, data }) : await prisma.childMedicalNote.create({ data });
  } else if (entity === "staff") {
    const requestedCenterId = clean(body.centerId) || clean(body.relatedId) || user.primaryCenterId;
    if (!requestedCenterId) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
    const access = await assertCenterAccess(user, requestedCenterId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.center.id;
    const scopedCenterId = access.center.id;
    const submittedEmail = (clean(body.email) || clean(body.type)).toLowerCase();
    const staffName = clean(body.name);
    const rawStaffKioskPin = clean(body.staffKioskPin);
    const staffKioskPin = normalizePin(rawStaffKioskPin);
    const hasCompensationPayload = hasStaffCompensationPayload(body);
    if (!staffName) return NextResponse.json({ ok: false, error: "Teacher name is required." }, { status: 400 });
    if (rawStaffKioskPin && !staffKioskPin) {
      return NextResponse.json({ ok: false, error: "Staff kiosk code must be exactly 4 digits." }, { status: 400 });
    }
    if (hasCompensationPayload && !canManageStaffCompensation(user)) {
      return NextResponse.json({ ok: false, error: "Staff compensation is not allowed for this role." }, { status: 403 });
    }
    const compensationResult = hasCompensationPayload ? normalizeStaffCompensationPayload(body) : null;
    if (compensationResult && !compensationResult.ok) {
      return NextResponse.json({ ok: false, error: compensationResult.error }, { status: 400 });
    }
    const staffRole = UserRole.TEACHER;
    const existingProfileForEdit = id
      ? await prisma.staffProfile.findUnique({
          where: { id },
          select: {
            id: true,
            centerId: true,
            userId: true,
            customFields: true,
            user: { select: { id: true, email: true, tenantId: true } },
          },
        })
      : null;
    if (id) {
      const guard = scopedUpdateGuard({ entity: "Teacher profile", expectedScopeId: centerId, actualScopeId: existingProfileForEdit?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
      if (existingProfileForEdit?.user.tenantId !== user.tenantId) {
        return NextResponse.json({ ok: false, error: "Teacher profile belongs to a different tenant." }, { status: 403 });
      }
    }
    if (clean(body.classroomId)) {
      const classroom = await prisma.classroom.findUnique({ where: { id: clean(body.classroomId) }, select: { centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Classroom", expectedScopeId: centerId, actualScopeId: classroom?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    let auth: Prisma.InputJsonValue = { skipped: true };
    const generatedLogin = id
      ? undefined
      : await generateTeacherLoginCredentials({
          fullName: staffName,
          emailExists: (candidate) => prisma.user.findUnique({ where: { email: candidate }, select: { id: true } }).then(Boolean),
        });
    try {
      if (generatedLogin) {
        auth = await provisionTeacherLogin({ login: generatedLogin, name: staffName });
        login = generatedLogin;
      }
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Teacher login setup failed." },
        { status: 502 },
      );
    }
    const staffKioskPinSetAt = staffKioskPin ? new Date() : null;
    const staffWrite = await prisma.$transaction(async (tx) => {
      const staffUser = existingProfileForEdit
        ? await tx.user.update({
            where: { id: existingProfileForEdit.userId },
            data: {
              name: staffName,
              role: staffRole,
              isActive: true,
              organizationId: access.center.organizationId,
            },
          })
        : await tx.user.create({
            data: {
              tenantId: user.tenantId,
              organizationId: access.center.organizationId,
              email: generatedLogin!.email,
              name: staffName,
              role: staffRole,
              isActive: true,
              mustResetPassword: false,
            },
          });

      await ensureTeacherCenterGrant({
        userId: staffUser.id,
        tenantId: user.tenantId,
        organizationId: access.center.organizationId,
        centerId: scopedCenterId,
      }, tx);

      const existingProfile = await tx.staffProfile.findUnique({
        where: { userId: staffUser.id },
        select: { id: true, customFields: true },
      });
      const existingCustomFields = existingProfile?.customFields ?? existingProfileForEdit?.customFields;
      let baseCustomFields = staffProfileCustomFields(existingCustomFields, submittedEmail);
      if (compensationResult?.ok) {
        baseCustomFields = staffCompensationCustomFields({
          customFields: baseCustomFields ?? existingCustomFields,
          compensation: compensationResult.compensation,
          updatedAt: new Date(),
          updatedById: user.id,
        });
      }
      const data = {
        userId: staffUser.id,
        centerId: scopedCenterId,
        classroomId: clean(body.classroomId) || null,
        title: clean(body.title) || clean(body.body) || staffRole.replaceAll("_", " "),
        phone: clean(body.phone) || null,
        backgroundCheckStatus: clean(body.backgroundCheckStatus) || "pending",
        ...(baseCustomFields ? { customFields: baseCustomFields } : {}),
        ...(staffKioskPin && existingProfile && staffKioskPinSetAt
          ? {
              customFields: staffKioskPinFields({
                customFields: baseCustomFields ?? existingProfile.customFields,
                pinHash: hashStaffPin(existingProfile.id, staffKioskPin),
                pinSetAt: staffKioskPinSetAt,
                pinSetById: user.id,
              }),
            }
          : {}),
      };
      let savedStaffProfile = existingProfileForEdit
        ? await tx.staffProfile.update({ where: { id: existingProfileForEdit.id }, data })
        : await tx.staffProfile.create({ data });
      if (staffKioskPin && !existingProfile && staffKioskPinSetAt) {
        savedStaffProfile = await tx.staffProfile.update({
          where: { id: savedStaffProfile.id },
          data: {
            customFields: staffKioskPinFields({
              customFields: savedStaffProfile.customFields,
              pinHash: hashStaffPin(savedStaffProfile.id, staffKioskPin),
              pinSetAt: staffKioskPinSetAt,
              pinSetById: user.id,
            }),
          },
        });
      }
      return { staffUser, savedStaffProfile };
    });
    result = staffWrite.savedStaffProfile;
    if (login) {
      auditMetadata.generatedTeacherLoginEmail = login.email;
      await writeAuditLog(user, {
        centerId,
        action: "teacher_user_created",
        resource: "User",
        resourceId: staffWrite.staffUser.id,
        metadata: {
          email: login.email,
          staffProfileId: staffWrite.savedStaffProfile.id,
        },
      });
    }
    auditMetadata.auth = auth;
    auditMetadata.staffKioskCodeSet = Boolean(staffKioskPin);
    if (compensationResult?.ok) {
      auditMetadata.staffCompensationUpdated = true;
      auditMetadata.staffCompensationPayType = compensationResult.compensation.payType;
    }
  } else if (entity === "staffAssignment") {
    const staffId = clean(body.staffId) || id;
    if (!staffId) return NextResponse.json({ ok: false, error: "Teacher profile ID is required." }, { status: 400 });
    const staff = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      select: { id: true, centerId: true, user: { select: { id: true, isActive: true, role: true } } },
    });
    if (!staff) return NextResponse.json({ ok: false, error: "Teacher profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this teacher profile." }, { status: 403 });
    }
    if (!staff.user.isActive || staff.user.role !== UserRole.TEACHER) {
      return NextResponse.json({ ok: false, error: "Only active teacher profiles can be assigned to classrooms." }, { status: 400 });
    }
    centerId = staff.centerId;
    const classroomId = clean(body.classroomId) || null;
    if (classroomId) {
      const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Classroom", expectedScopeId: staff.centerId, actualScopeId: classroom?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = await prisma.staffProfile.update({
      where: { id: staff.id },
      data: { classroomId },
      include: {
        user: { select: { name: true, email: true, isActive: true } },
        classroom: { select: { id: true, name: true } },
      },
    });
  } else if (entity === "staffTimeClock") {
    const staffId = clean(body.staffId) || id;
    if (!staffId) return NextResponse.json({ ok: false, error: "Teacher profile ID is required." }, { status: 400 });
    const hasEventEditPayload = Array.isArray(body.events);
    const action = hasEventEditPayload ? null : normalizeStaffClockAction(clean(body.action) || clean(body.status));
    if (!hasEventEditPayload && !action) return NextResponse.json({ ok: false, error: "Clock action must be clock_in or clock_out." }, { status: 400 });
    const staff = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        centerId: true,
        customFields: true,
        center: { select: { city: true, state: true, postalCode: true, timezone: true, customFields: true } },
        user: { select: { name: true, isActive: true, role: true } },
      },
    });
    if (!staff) return NextResponse.json({ ok: false, error: "Teacher profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this teacher profile." }, { status: 403 });
    }
    if (staff.user.role !== UserRole.TEACHER) {
      return NextResponse.json({ ok: false, error: "Only teacher profiles can use staff time clock actions." }, { status: 400 });
    }
    const timeZone = readCenterTimeZone(staff.center);
    centerId = staff.centerId;

    if (hasEventEditPayload) {
      const normalized = normalizeStaffClockEventEdits(body.events, { timeZone });
      if (!normalized.ok) return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
      const editedAt = new Date();
      result = await prisma.staffProfile.update({
        where: { id: staff.id },
        data: {
          customFields: staffClockEditFields({
            customFields: staff.customFields,
            events: normalized.events,
            editedAt,
            timeZone,
          }),
        },
        select: { id: true, customFields: true, user: { select: { name: true, email: true } } },
      });
      auditMetadata.action = "manual_edit";
      auditMetadata.eventCount = normalized.events.length;
      auditMetadata.editedAt = editedAt.toISOString();
      auditMetadata.timeZone = timeZone;
      const editReason = clean(body.editReason);
      if (editReason) auditMetadata.editReason = editReason;
    } else if (!staff.user.isActive) {
      return NextResponse.json({ ok: false, error: "Only active teacher profiles can use staff time clock actions." }, { status: 400 });
    } else {
      const clockAction = action;
      if (!clockAction) return NextResponse.json({ ok: false, error: "Clock action must be clock_in or clock_out." }, { status: 400 });
      const state = readStaffClockState(staff.customFields);
      const validation = validateNextStaffClockAction(clockAction, state);
      if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
      const occurredAt = parseDate(body.occurredAt) ?? new Date();
      result = await prisma.staffProfile.update({
        where: { id: staff.id },
        data: {
          customFields: staffClockFields({
            customFields: staff.customFields,
            action: clockAction,
            occurredAt,
            timeZone,
            notes: clean(body.notes) || `Director action by ${user.email}`,
          }),
        },
        select: { id: true, customFields: true, user: { select: { name: true, email: true } } },
      });
      auditMetadata.action = clockAction;
      auditMetadata.occurredAt = occurredAt.toISOString();
      auditMetadata.timeZone = timeZone;
    }
  } else if (entity === "staffScheduleBatch") {
    const classroomId = clean(body.classroomId);
    if (!classroomId) return NextResponse.json({ ok: false, error: "Classroom ID is required." }, { status: 400 });
    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { id: true, centerId: true } });
    if (!classroom) return NextResponse.json({ ok: false, error: "Classroom not found." }, { status: 404 });
    if (!canAccessCenter(user, classroom.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this classroom." }, { status: 403 });
    }
    centerId = classroom.centerId;
    const requestedStaffIds = Array.isArray(body.staffIds) ? (body.staffIds as unknown[]).map(clean).filter(Boolean) : [];
    const eligibleStaff = await prisma.staffProfile.findMany({
      where: {
        centerId,
        user: { role: UserRole.TEACHER, isActive: true },
        ...(requestedStaffIds.length ? { id: { in: requestedStaffIds } } : { classroomId }),
      },
      select: { id: true, centerId: true },
    });
    if (!eligibleStaff.length) {
      return NextResponse.json({ ok: false, error: "No active teachers are assigned or selected for this classroom." }, { status: 400 });
    }
    const missingStaffIds = requestedStaffIds.filter((staffId: string) => !eligibleStaff.some((staff) => staff.id === staffId));
    if (missingStaffIds.length) {
      return NextResponse.json({ ok: false, error: "One or more selected teachers are outside this school or inactive." }, { status: 403 });
    }
    const weekStartsAt = parseDate(body.weekStartsAt);
    const daysOfWeek = normalizeWeekdayIndexes(body.daysOfWeek);
    if (!weekStartsAt || !daysOfWeek.length) {
      return NextResponse.json({ ok: false, error: "Week start and at least one schedule day are required." }, { status: 400 });
    }
    const scheduleRequests = buildWeeklyStaffScheduleRequests({
      staffIds: eligibleStaff.map((staff) => staff.id),
      weekStartsAt,
      daysOfWeek,
      startTime: clean(body.startTime),
      endTime: clean(body.endTime),
    });
    if (!scheduleRequests.length) {
      return NextResponse.json({ ok: false, error: "Valid schedule start and end times are required." }, { status: 400 });
    }
    const status = clean(body.status) || "scheduled";
    result = await prisma.staffSchedule.createMany({
      data: scheduleRequests.map((schedule) => ({
        staffId: schedule.staffId,
        centerId: classroom.centerId,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        status,
      })),
    });
    auditMetadata.createdSchedules = scheduleRequests.length;
    auditMetadata.classroomId = classroom.id;
  } else if (entity === "invoice") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const amountCents = intValue(body.amountCents || dollarsToCents(body.amountDollars));
    if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Invoice amount is required." }, { status: 400 });
    const billingAccount = await prisma.billingAccount.upsert({
      where: { familyId },
      update: {},
      create: { familyId, balanceCents: 0 },
    });
    const existingInvoice = id
      ? await prisma.invoice.findUnique({
          where: { id },
          select: { id: true, billingAccountId: true, totalCents: true },
        })
      : null;
    if (id && (!existingInvoice || existingInvoice.billingAccountId !== billingAccount.id)) {
      return NextResponse.json({ ok: false, error: "Invoice not found for this family." }, { status: 404 });
    }
    const dueDate = parseDate(body.dueDate || body.expiresAt) ?? new Date();
    const description = clean(body.description) || clean(body.body) || clean(body.name) || "Tuition charge";
    result = await prisma.$transaction(async (tx) => {
      const invoice = id
        ? await tx.invoice.update({
            where: { id },
            data: { status: PaymentStatus.OPEN, dueDate, totalCents: amountCents },
          })
        : await tx.invoice.create({
            data: {
              billingAccountId: billingAccount.id,
              number: `INV-${Date.now()}`,
              status: PaymentStatus.OPEN,
              dueDate,
              totalCents: amountCents,
              items: { create: [{ description, amountCents }] },
            },
          });
      const ledgerAmountCents = id ? amountCents - (existingInvoice?.totalCents ?? 0) : amountCents;
      if (ledgerAmountCents) {
        const updatedAccount = await tx.billingAccount.update({
          where: { id: billingAccount.id },
          data: { balanceCents: { increment: ledgerAmountCents } },
        });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: billingAccount.id,
            invoiceId: invoice.id,
            type: id ? "invoice_adjustment" : "invoice",
            description,
            amountCents: ledgerAmountCents,
            balanceAfterCents: updatedAccount.balanceCents,
            sourceSystem: "bee_suite",
            externalId: `${id ? "invoice-adjustment" : "invoice"}:${invoice.id}:${Date.now()}`,
          },
        });
      }
      return invoice;
    });
  } else if (entity === "ledgerEntry") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    const billingAccountId = clean(body.billingAccountId);
    let account = billingAccountId
      ? await prisma.billingAccount.findUnique({ where: { id: billingAccountId }, include: { family: true } })
      : null;
    if (!account && familyId) {
      const access = await assertFamilyAccess(user, familyId);
      if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
      centerId = access.centerId;
      account = await prisma.billingAccount.upsert({
        where: { familyId },
        update: {},
        create: { familyId, balanceCents: 0 },
        include: { family: true },
      });
    }
    if (!account) return NextResponse.json({ ok: false, error: "Family ID or billing account ID is required." }, { status: 400 });
    const accountAccess = centerScopedAccessGuard({
      centerId: account.family.centerId,
      hasTenantWideAccess: canAccessAllCenters(user),
      hasCenterAccess: Boolean(account.family.centerId && canAccessCenter(user, account.family.centerId)),
      resourceLabel: "Billing account",
    });
    if (!accountAccess.ok) {
      return NextResponse.json({ ok: false, error: accountAccess.error }, { status: accountAccess.status });
    }
    centerId = account.family.centerId;
    const amountCents = intValue(body.amountCents || dollarsToCents(body.amountDollars));
    if (!amountCents) return NextResponse.json({ ok: false, error: "Ledger amount is required." }, { status: 400 });
    result = await prisma.$transaction(async (tx) => {
      const updated = await tx.billingAccount.update({
        where: { id: account!.id },
        data: { balanceCents: { increment: amountCents } },
      });
      return tx.ledgerEntry.create({
        data: {
          billingAccountId: account!.id,
          type: clean(body.type) || "adjustment",
          description: clean(body.description) || clean(body.body) || clean(body.name) || "Ledger adjustment",
          amountCents,
          balanceAfterCents: updated.balanceCents,
          sourceSystem: clean(body.sourceSystem) || "bee_suite_manual",
          externalId: clean(body.externalId) || `manual:${Date.now()}`,
          metadata: { enteredBy: user.email },
        },
      });
    });
  } else if (entity === "announcement") {
    const requestedCenterId = clean(body.centerId) || null;
    if (requestedCenterId && !canAccessCenter(user, requestedCenterId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
    }
    centerId = requestedCenterId;
    if (id) {
      const existing = await prisma.announcement.findUnique({ where: { id }, select: { centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Announcement", expectedScopeId: requestedCenterId, actualScopeId: existing?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const data = {
      centerId: requestedCenterId,
      title: clean(body.title),
      body: clean(body.body),
      audience: clean(body.audience) ? { label: clean(body.audience) } : undefined,
      status: clean(body.status) || "draft",
      sendAt: parseDate(body.sendAt),
    };
    if (!data.title || !data.body) return NextResponse.json({ ok: false, error: "Title and body are required." }, { status: 400 });
    result = id ? await prisma.announcement.update({ where: { id }, data }) : await prisma.announcement.create({ data });
  } else if (entity === "campaign") {
    const brand = await prisma.brand.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (id) {
      const existing = await prisma.campaign.findUnique({
        where: { id },
        select: { tenantId: true, brand: { select: { tenantId: true } } },
      });
      if (!existing || (existing.tenantId !== user.tenantId && existing.brand?.tenantId !== user.tenantId)) {
        return NextResponse.json({ ok: false, error: "Campaign not found for this tenant." }, { status: 404 });
      }
    }
    const draft = normalizeCampaignDraft({
      name: body.name,
      type: body.type,
      templateKey: body.templateKey,
      subject: body.subject,
      body: body.body,
      audience: body.audience,
      status: body.status,
      scheduledAt: body.scheduledAt || body.sendAt || body.expiresAt,
    });
    const data = {
      tenantId: user.tenantId,
      brandId: brand?.id ?? null,
      name: draft.name,
      type: draft.type,
      subject: draft.subject,
      body: draft.body,
      templateKey: draft.templateKey,
      audience: draft.audience ? draft.audience as Prisma.InputJsonObject : undefined,
      status: draft.status,
      scheduledAt: draft.scheduledAt,
      metrics: id ? undefined : { createdFrom: "operations_record_api", templateKey: draft.templateKey },
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Campaign name is required." }, { status: 400 });
    result = id ? await prisma.campaign.update({ where: { id }, data }) : await prisma.campaign.create({ data });
  } else if (entity === "automation") {
    const brand = await prisma.brand.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (id) {
      const existing = await prisma.automation.findUnique({
        where: { id },
        select: { tenantId: true, brand: { select: { tenantId: true } } },
      });
      if (!existing || (existing.tenantId !== user.tenantId && existing.brand?.tenantId !== user.tenantId)) {
        return NextResponse.json({ ok: false, error: "Automation not found for this tenant." }, { status: 404 });
      }
    }
    const data = {
      tenantId: user.tenantId,
      brandId: brand?.id ?? null,
      name: clean(body.name),
      trigger: clean(body.trigger) || "manual",
      condition: clean(body.condition) || clean(body.audience)
        ? {
            rule: clean(body.condition),
            audience: clean(body.audience),
            requiresReview: body.requiresReview === true || body.requiresReview === "true",
          }
        : undefined,
      action: {
        type: clean(body.actionType) || clean(body.action) || "create_task",
        channel: clean(body.channel) || "task",
        templateKey: clean(body.templateKey) || null,
        subject: clean(body.subject) || null,
        body: clean(body.body) || null,
      },
      delay: clean(body.delay) || null,
      status: clean(body.status) || "active",
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Automation name is required." }, { status: 400 });
    result = id ? await prisma.automation.update({ where: { id }, data }) : await prisma.automation.create({ data });
  } else if (entity === "document") {
    const familyId = clean(body.familyId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const childId = clean(body.childId) || null;
    if (childId) {
      const child = await prisma.child.findUnique({ where: { id: childId }, select: { familyId: true } });
      const guard = scopedUpdateGuard({ entity: "Child", expectedScopeId: familyId, actualScopeId: child?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    if (id) {
      const existing = await prisma.document.findUnique({ where: { id }, select: { familyId: true } });
      const guard = scopedUpdateGuard({ entity: "Document", expectedScopeId: familyId, actualScopeId: existing?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const data = {
      familyId,
      childId,
      name: clean(body.name),
      type: clean(body.type) || "general",
      status: requestedStatus(body.status),
      expiresAt: parseDate(body.expiresAt),
      restricted: Boolean(body.restricted),
      ...(id
        ? clean(body.storageKey)
          ? { storageKey: clean(body.storageKey) }
          : {}
        : { storageKey: clean(body.storageKey) || "upload_pending" }),
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Document name is required." }, { status: 400 });
    result = id ? await prisma.document.update({ where: { id }, data }) : await prisma.document.create({ data });
  } else if (entity === "form") {
    const data = {
      name: clean(body.name),
      type: clean(body.type) || "custom",
      schema: normalizeFormSchema(body.fields),
      status: clean(body.status) || "active",
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Form name is required." }, { status: 400 });
    result = id ? await prisma.form.update({ where: { id }, data }) : await prisma.form.create({ data });
  } else if (entity === "formSubmission") {
    const formId = clean(body.formId);
    if (!formId) return NextResponse.json({ ok: false, error: "Form ID is required." }, { status: 400 });
    const familyId = clean(body.familyId) || null;
    if (familyId) {
      const access = await assertFamilyAccess(user, familyId);
      if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
      centerId = access.centerId;
    }
    if (id) {
      const existing = await prisma.formSubmission.findUnique({ where: { id }, select: { familyId: true } });
      if (!existing) return NextResponse.json({ ok: false, error: "FormSubmission not found." }, { status: 404 });
      if (existing.familyId) {
        const existingAccess = await assertFamilyAccess(user, existing.familyId);
        if (!existingAccess.ok) return NextResponse.json({ ok: false, error: existingAccess.error }, { status: existingAccess.status });
        centerId = existingAccess.centerId;
      }
      if (familyId && existing.familyId !== familyId) {
        return NextResponse.json({ ok: false, error: "FormSubmission is not linked to the requested family." }, { status: 403 });
      }
    }
    const data = {
      formId,
      familyId,
      status: requestedStatus(body.status),
      data: { notes: clean(body.notes), submittedBy: user.email },
      signaturePlaceholder: Boolean(body.signaturePlaceholder),
      submittedAt: parseDate(body.submittedAt) ?? new Date(),
    };
    result = id ? await prisma.formSubmission.update({ where: { id }, data }) : await prisma.formSubmission.create({ data });
  } else if (entity === "certification") {
    const staffId = clean(body.staffId);
    if (!staffId) return NextResponse.json({ ok: false, error: "Teacher profile ID is required." }, { status: 400 });
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffId }, select: { centerId: true } });
    if (!staff) return NextResponse.json({ ok: false, error: "Teacher profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this teacher profile." }, { status: 403 });
    centerId = staff.centerId;
    if (id) {
      const existing = await prisma.certification.findUnique({ where: { id }, select: { staffId: true } });
      const guard = scopedUpdateGuard({ entity: "Certification", expectedScopeId: staffId, actualScopeId: existing?.staffId, scopeLabel: "teacher profile" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const data = {
      staffId,
      name: clean(body.name),
      status: clean(body.status) || "active",
      expiresAt: parseDate(body.expiresAt),
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Certification name is required." }, { status: 400 });
    result = id ? await prisma.certification.update({ where: { id }, data }) : await prisma.certification.create({ data });
  } else if (entity === "staffSchedule") {
    const staffId = clean(body.staffId);
    if (!staffId) return NextResponse.json({ ok: false, error: "Teacher profile ID is required." }, { status: 400 });
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffId }, select: { centerId: true } });
    if (!staff) return NextResponse.json({ ok: false, error: "Teacher profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this teacher profile." }, { status: 403 });
    centerId = staff.centerId;
    if (id) {
      const existing = await prisma.staffSchedule.findUnique({ where: { id }, select: { staffId: true, centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Staff schedule", expectedScopeId: centerId, actualScopeId: existing?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
      if (existing?.staffId !== staffId) {
        return NextResponse.json({ ok: false, error: "Schedule is not linked to this teacher profile." }, { status: 403 });
      }
    }
    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      return NextResponse.json({ ok: false, error: "Valid schedule start and end times are required." }, { status: 400 });
    }
    const data = {
      staffId,
      centerId,
      startsAt,
      endsAt,
      status: clean(body.status) || "scheduled",
    };
    result = id ? await prisma.staffSchedule.update({ where: { id }, data }) : await prisma.staffSchedule.create({ data });
  } else if (entity === "product") {
    const data = {
      name: clean(body.name),
      type: clean(body.type) || "fee",
      amountCents: intValue(body.amountCents || Number(body.amountDollars) * 100),
    };
    if (!data.name || data.amountCents <= 0) return NextResponse.json({ ok: false, error: "Product name and amount are required." }, { status: 400 });
    result = id ? await prisma.product.update({ where: { id }, data }) : await prisma.product.create({ data });
  } else if (entity === "tuitionPlan") {
    const data = {
      name: clean(body.name),
      ageGroup: clean(body.ageGroup) || "Preschool",
      cadence: "weekly",
      amountCents: intValue(body.amountCents || Number(body.amountDollars) * 100),
    };
    if (!data.name || data.amountCents <= 0) return NextResponse.json({ ok: false, error: "Plan name and amount are required." }, { status: 400 });
    result = id ? await prisma.tuitionPlan.update({ where: { id }, data }) : await prisma.tuitionPlan.create({ data });
  } else if (entity === "review") {
    const requestedCenterId = clean(body.centerId) || null;
    if (requestedCenterId && !canAccessCenter(user, requestedCenterId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
    }
    if (id) {
      const existing = await prisma.review.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true, centerId: true } });
      if (!existing) return NextResponse.json({ ok: false, error: "Review not found for this tenant." }, { status: 404 });
      if (existing.centerId && !canAccessCenter(user, existing.centerId)) {
        return NextResponse.json({ ok: false, error: "You do not have access to this review." }, { status: 403 });
      }
    }
    centerId = requestedCenterId;
    const data = {
      tenantId: user.tenantId,
      centerId: requestedCenterId,
      source: clean(body.source) || "manual",
      rating: Math.min(Math.max(intValue(body.rating, 5), 1), 5),
      body: clean(body.body) || null,
      responseDraft: clean(body.responseDraft) || null,
      approvedForPublicTestimonial: Boolean(body.approvedForPublicTestimonial),
      status: clean(body.status) || "new",
    };
    result = id ? await prisma.review.update({ where: { id }, data }) : await prisma.review.create({ data });
  } else {
    return NextResponse.json({ ok: false, error: `Unsupported entity: ${entity}` }, { status: 400 });
  }

  const resourceId = id || resultRecordId(result);
  if (notificationEntities.has(entity)) {
    try {
      const notificationMode = entity === "staffAssignment" || entity === "staffTimeClock" ? "updated" : mode;
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: notificationMode,
        resourceId,
        centerId,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }
  }

  await writeAuditLog(user, {
    centerId,
    action: `operations.${entity}.${mode}`,
    resource: entity,
    resourceId,
    metadata: auditMetadata as Prisma.InputJsonObject,
  });

  return NextResponse.json({ ok: true, entity, mode, record: result, ...auditMetadata, ...(login ? { login } : {}) }, { status: id ? 200 : 201 });
}

async function DELETEHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Record management is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const entity = clean(body.entity);
  const id = clean(body.id);
  if (!entity || !id) {
    return NextResponse.json({ ok: false, error: "Entity and ID are required." }, { status: 400 });
  }

  if (entity === "guardian") {
    const guardian = await prisma.guardian.findUnique({
      where: { id },
      select: {
        id: true,
        familyId: true,
        userId: true,
        fullName: true,
        email: true,
        family: {
          select: {
            guardians: { select: { userId: true } },
          },
        },
      },
    });
    if (!guardian) return NextResponse.json({ ok: false, error: "Parent/guardian not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, guardian.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    const relatedUserIds = Array.from(
      new Set([
        guardian.userId,
        ...guardian.family.guardians.map((item) => item.userId),
      ].filter((userId): userId is string => Boolean(userId))),
    );

    const result = await prisma.$transaction(async (tx) => {
      const checkInLogs = await tx.checkInOutLog.updateMany({
        where: { guardianId: guardian.id },
        data: { guardianId: null },
      });
      const deleted = await tx.guardian.delete({ where: { id: guardian.id } });
      return {
        id: deleted.id,
        familyId: deleted.familyId,
        userId: deleted.userId,
        fullName: deleted.fullName,
        email: deleted.email,
        detachedCheckInLogs: checkInLogs.count,
      };
    });

    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deleted",
      familyId: guardian.familyId,
      guardianName: guardian.fullName,
      detachedCheckInLogs: result.detachedCheckInLogs,
    };
    if (guardian.userId) auditMetadata.userId = guardian.userId;
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deleted",
        resourceId: guardian.id,
        centerId: access.centerId,
        relatedUserIds,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }

    await writeAuditLog(user, {
      centerId: access.centerId,
      action: "operations.guardian.deleted",
      resource: "guardian",
      resourceId: guardian.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result, ...auditMetadata });
  }

  if (entity === "authorizedPickup") {
    const pickup = await prisma.authorizedPickup.findUnique({
      where: { id },
      select: {
        id: true,
        familyId: true,
        fullName: true,
        phone: true,
        family: {
          select: {
            guardians: { select: { userId: true } },
          },
        },
      },
    });
    if (!pickup) return NextResponse.json({ ok: false, error: "Authorized pickup not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, pickup.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    const relatedUserIds = Array.from(
      new Set(pickup.family.guardians.map((item) => item.userId).filter((userId): userId is string => Boolean(userId))),
    );
    const result = await prisma.authorizedPickup.delete({ where: { id: pickup.id } });
    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deleted",
      familyId: pickup.familyId,
      pickupName: pickup.fullName,
    };
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deleted",
        resourceId: pickup.id,
        centerId: access.centerId,
        relatedUserIds,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }

    await writeAuditLog(user, {
      centerId: access.centerId,
      action: "operations.authorizedPickup.deleted",
      resource: "authorizedPickup",
      resourceId: pickup.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result, ...auditMetadata });
  }

  if (entity === "emergencyContact") {
    const contact = await prisma.emergencyContact.findUnique({
      where: { id },
      select: {
        id: true,
        familyId: true,
        fullName: true,
        phone: true,
        family: {
          select: {
            guardians: { select: { userId: true } },
          },
        },
      },
    });
    if (!contact) return NextResponse.json({ ok: false, error: "Emergency contact not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, contact.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    const relatedUserIds = Array.from(
      new Set(contact.family.guardians.map((item) => item.userId).filter((userId): userId is string => Boolean(userId))),
    );
    const result = await prisma.emergencyContact.delete({ where: { id: contact.id } });
    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deleted",
      familyId: contact.familyId,
      contactName: contact.fullName,
    };
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deleted",
        resourceId: contact.id,
        centerId: access.centerId,
        relatedUserIds,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }

    await writeAuditLog(user, {
      centerId: access.centerId,
      action: "operations.emergencyContact.deleted",
      resource: "emergencyContact",
      resourceId: contact.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result, ...auditMetadata });
  }

  if (entity === "allergy") {
    const allergy = await prisma.allergy.findUnique({
      where: { id },
      select: {
        id: true,
        childId: true,
        allergen: true,
        child: {
          select: {
            familyId: true,
            family: { select: { centerId: true, guardians: { select: { userId: true } } } },
            classroom: { select: { staff: { where: { user: { isActive: true } }, select: { userId: true } } } },
          },
        },
      },
    });
    if (!allergy) return NextResponse.json({ ok: false, error: "Allergy record not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, allergy.child.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    const relatedUserIds = Array.from(new Set([
      ...allergy.child.family.guardians.map((item) => item.userId),
      ...(allergy.child.classroom?.staff.map((item) => item.userId) ?? []),
    ].filter((userId): userId is string => Boolean(userId))));
    const result = await prisma.allergy.delete({ where: { id: allergy.id } });
    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deleted",
      childId: allergy.childId,
      allergen: allergy.allergen,
    };
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deleted",
        resourceId: allergy.id,
        centerId: allergy.child.family.centerId,
        relatedUserIds,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }

    await writeAuditLog(user, {
      centerId: allergy.child.family.centerId,
      action: "operations.allergy.deleted",
      resource: "allergy",
      resourceId: allergy.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result, ...auditMetadata });
  }

  if (entity === "medicalNote") {
    const note = await prisma.childMedicalNote.findUnique({
      where: { id },
      select: {
        id: true,
        childId: true,
        category: true,
        child: {
          select: {
            familyId: true,
            family: { select: { centerId: true, guardians: { select: { userId: true } } } },
            classroom: { select: { staff: { where: { user: { isActive: true } }, select: { userId: true } } } },
          },
        },
      },
    });
    if (!note) return NextResponse.json({ ok: false, error: "Medical note not found." }, { status: 404 });
    const access = await assertFamilyAccess(user, note.child.familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    const relatedUserIds = Array.from(new Set([
      ...note.child.family.guardians.map((item) => item.userId),
      ...(note.child.classroom?.staff.map((item) => item.userId) ?? []),
    ].filter((userId): userId is string => Boolean(userId))));
    const result = await prisma.childMedicalNote.delete({ where: { id: note.id } });
    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deleted",
      childId: note.childId,
      category: note.category,
    };
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deleted",
        resourceId: note.id,
        centerId: note.child.family.centerId,
        relatedUserIds,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }

    await writeAuditLog(user, {
      centerId: note.child.family.centerId,
      action: "operations.medicalNote.deleted",
      resource: "medicalNote",
      resourceId: note.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result, ...auditMetadata });
  }

  if (entity === "document") {
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        familyId: true,
        childId: true,
        name: true,
        family: { select: { centerId: true, guardians: { select: { userId: true } } } },
        child: { select: { familyId: true, family: { select: { centerId: true, guardians: { select: { userId: true } } } } } },
      },
    });
    if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    const familyId = document.familyId ?? document.child?.familyId ?? null;
    if (!familyId) return NextResponse.json({ ok: false, error: "Document is not linked to a family." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    const guardianRows = document.family?.guardians ?? document.child?.family.guardians ?? [];
    const relatedUserIds = Array.from(
      new Set(guardianRows.map((item) => item.userId).filter((userId): userId is string => Boolean(userId))),
    );
    const result = await prisma.document.delete({ where: { id: document.id } });
    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deleted",
      familyId,
      documentName: document.name,
    };
    if (document.childId) auditMetadata.childId = document.childId;
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deleted",
        resourceId: document.id,
        centerId: document.family?.centerId ?? document.child?.family.centerId ?? access.centerId,
        relatedUserIds,
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }

    await writeAuditLog(user, {
      centerId: document.family?.centerId ?? document.child?.family.centerId ?? access.centerId,
      action: "operations.document.deleted",
      resource: "document",
      resourceId: document.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result, ...auditMetadata });
  }

  if (entity === "staff") {
    const staff = await prisma.staffProfile.findUnique({
      where: { id },
      select: { id: true, centerId: true, userId: true, classroomId: true },
    });
    if (!staff) return NextResponse.json({ ok: false, error: "Teacher profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this teacher profile." }, { status: 403 });
    }

    const deactivatedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: staff.id },
        data: { classroomId: null },
      });
      await tx.staffSchedule.updateMany({
        where: {
          staffId: staff.id,
          endsAt: { gte: deactivatedAt },
          status: { notIn: ["cancelled", "completed"] },
        },
        data: { status: "cancelled" },
      });
      await tx.deviceSession.updateMany({
        where: { userId: staff.userId, revokedAt: null },
        data: { revokedAt: deactivatedAt, revokedById: user.id },
      });
      return tx.user.update({
        where: { id: staff.userId },
        data: { isActive: false },
        select: { id: true, email: true, name: true, isActive: true },
      });
    });
    const auditMetadata: Record<string, Prisma.InputJsonValue> = {
      mode: "deactivated",
      userId: staff.userId,
      loginSessionsRevoked: true,
      futureSchedulesCancelled: true,
    };
    if (staff.classroomId) auditMetadata.previousClassroomId = staff.classroomId;
    try {
      auditMetadata.notificationsCreated = await notifyOperationsRecordChange({
        actor: user,
        entity,
        mode: "deactivated",
        resourceId: staff.id,
        centerId: staff.centerId,
        relatedUserIds: [staff.userId],
      });
    } catch (error) {
      auditMetadata.notificationError = error instanceof Error ? error.message : "Notification could not be created.";
    }
    await writeAuditLog(user, {
      centerId: staff.centerId,
      action: "operations.staff.deactivated",
      resource: "staff",
      resourceId: staff.id,
      metadata: auditMetadata as Prisma.InputJsonObject,
    });
    return NextResponse.json({ ok: true, entity, mode: "deactivated", record: result, ...auditMetadata });
  }

  if (entity === "certification") {
    const certification = await prisma.certification.findUnique({
      where: { id },
      select: { id: true, staffId: true, staff: { select: { centerId: true } } },
    });
    if (!certification) return NextResponse.json({ ok: false, error: "Certification not found." }, { status: 404 });
    if (!canAccessCenter(user, certification.staff.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this certification." }, { status: 403 });
    }

    const result = await prisma.certification.delete({ where: { id } });
    await writeAuditLog(user, {
      centerId: certification.staff.centerId,
      action: "operations.certification.deleted",
      resource: "certification",
      resourceId: certification.id,
      metadata: { mode: "deleted", staffId: certification.staffId },
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result });
  }

  if (entity === "staffSchedule") {
    const schedule = await prisma.staffSchedule.findUnique({
      where: { id },
      select: { id: true, staffId: true, centerId: true },
    });
    if (!schedule) return NextResponse.json({ ok: false, error: "Staff schedule not found." }, { status: 404 });
    if (!canAccessCenter(user, schedule.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this schedule." }, { status: 403 });
    }

    const result = await prisma.staffSchedule.delete({ where: { id } });
    await writeAuditLog(user, {
      centerId: schedule.centerId,
      action: "operations.staffSchedule.deleted",
      resource: "staffSchedule",
      resourceId: schedule.id,
      metadata: { mode: "deleted", staffId: schedule.staffId },
    });
    return NextResponse.json({ ok: true, entity, mode: "deleted", record: result });
  }

  return NextResponse.json({ ok: false, error: `Delete is not supported for entity: ${entity}` }, { status: 400 });
}

export const POST = withApiLogging("POST", POSTHandler);
export const DELETE = withApiLogging("DELETE", DELETEHandler);
