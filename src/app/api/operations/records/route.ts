import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashStaffPin, normalizePin } from "@/lib/kiosk";
import { centerScopedAccessGuard, classroomFamilyGuard, scopedUpdateGuard, staffTenantGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";
import { buildWeeklyStaffScheduleRequests, normalizeWeekdayIndexes } from "@/lib/staff-scheduling";
import { staffKioskPinFields } from "@/lib/staff-kiosk";
import { getPasswordResetRedirectUrl, requestSupabasePasswordReset, upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

async function provisionTeacherLogin(input: {
  email: string;
  name: string;
  temporaryPassword: string;
  sendPasswordReset: boolean;
  requestUrl: string;
}) {
  if (!input.temporaryPassword && !input.sendPasswordReset) {
    return { skipped: true };
  }

  const auth = await upsertSupabaseAuthUserWithPassword({
    email: input.email,
    name: input.name,
    password: input.temporaryPassword || `${randomUUID()}${randomUUID()}`,
    role: UserRole.TEACHER,
    source: "bee_suite_school_staff_management",
  });

  if (!input.temporaryPassword && input.sendPasswordReset) {
    const reset = await requestSupabasePasswordReset(input.email, getPasswordResetRedirectUrl(input.requestUrl));
    return {
      ...auth,
      passwordResetSent: reset.ok,
      passwordResetStatus: reset.status,
    };
  }

  return auth;
}

async function ensureTeacherCenterGrant(input: {
  userId: string;
  tenantId: string;
  organizationId: string;
  centerId: string;
}) {
  await prisma.userAccessGrant.updateMany({
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

  const existing = await prisma.userAccessGrant.findFirst({
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
    return prisma.userAccessGrant.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        organizationId: input.organizationId,
      },
    });
  }

  return prisma.userAccessGrant.create({
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

export async function POST(request: NextRequest) {
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
    const data = {
      centerId,
      name: clean(body.name),
      address: clean(body.address) || null,
      billingEmail: clean(body.billingEmail) || clean(body.type) || null,
      notes: clean(body.notes) || clean(body.body) || null,
      custodyNotes: clean(body.custodyNotes) || null,
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Family name is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.family.findUnique({ where: { id }, select: { centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Family", expectedScopeId: centerId, actualScopeId: existing?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.family.update({ where: { id }, data }) : await prisma.family.create({ data });
  } else if (entity === "guardian") {
    const familyId = clean(body.familyId) || clean(body.relatedId);
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
    const access = await assertFamilyAccess(user, familyId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.centerId;
    const data = {
      familyId,
      fullName: clean(body.name),
      email: clean(body.email) || clean(body.type) || null,
      phone: clean(body.phone) || null,
      employer: clean(body.employer) || null,
      relation: clean(body.relation) || clean(body.status) || "Guardian",
      preferredCommunication: clean(body.preferredCommunication) || null,
      isBillingContact: Boolean(body.isBillingContact),
    };
    if (!data.fullName) return NextResponse.json({ ok: false, error: "Guardian name is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.guardian.findUnique({ where: { id }, select: { familyId: true } });
      const guard = scopedUpdateGuard({ entity: "Guardian", expectedScopeId: familyId, actualScopeId: existing?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.guardian.update({ where: { id }, data }) : await prisma.guardian.create({ data });
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
    };
    if (!data.fullName) return NextResponse.json({ ok: false, error: "Child name is required." }, { status: 400 });
    if (id) {
      const existing = await prisma.child.findUnique({ where: { id }, select: { familyId: true } });
      const guard = scopedUpdateGuard({ entity: "Child", expectedScopeId: familyId, actualScopeId: existing?.familyId, scopeLabel: "family" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    result = id ? await prisma.child.update({ where: { id }, data }) : await prisma.child.create({ data });
  } else if (entity === "staff") {
    const requestedCenterId = clean(body.centerId) || clean(body.relatedId) || user.primaryCenterId;
    if (!requestedCenterId) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
    const access = await assertCenterAccess(user, requestedCenterId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.center.id;
    const email = clean(body.email) || clean(body.type);
    const staffName = clean(body.name);
    const temporaryPassword = clean(body.temporaryPassword);
    const sendPasswordReset = body.sendPasswordReset === true;
    const rawStaffKioskPin = clean(body.staffKioskPin);
    const staffKioskPin = normalizePin(rawStaffKioskPin);
    if (!email || !staffName) return NextResponse.json({ ok: false, error: "Teacher name and email are required." }, { status: 400 });
    if (temporaryPassword && temporaryPassword.length < 8) {
      return NextResponse.json({ ok: false, error: "Temporary passwords must be at least 8 characters." }, { status: 400 });
    }
    if (rawStaffKioskPin && !staffKioskPin) {
      return NextResponse.json({ ok: false, error: "Staff kiosk code must be exactly 4 digits." }, { status: 400 });
    }
    const staffRole = UserRole.TEACHER;
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true, tenantId: true } });
    const tenantGuard = staffTenantGuard(user.tenantId, existingUser?.tenantId);
    if (!tenantGuard.ok) return NextResponse.json({ ok: false, error: tenantGuard.error }, { status: tenantGuard.status });
    if (clean(body.classroomId)) {
      const classroom = await prisma.classroom.findUnique({ where: { id: clean(body.classroomId) }, select: { centerId: true } });
      const guard = scopedUpdateGuard({ entity: "Classroom", expectedScopeId: centerId, actualScopeId: classroom?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    let auth: Awaited<ReturnType<typeof provisionTeacherLogin>> = { skipped: true };
    try {
      auth = await provisionTeacherLogin({
        email,
        name: staffName,
        temporaryPassword,
        sendPasswordReset,
        requestUrl: request.url,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Teacher login setup failed." },
        { status: 502 },
      );
    }
    const forcePasswordReset = Boolean(temporaryPassword || sendPasswordReset);
    const staffUser = await prisma.user.upsert({
      where: { email },
      update: {
        name: staffName,
        role: staffRole,
        isActive: true,
        organizationId: access.center.organizationId,
        ...(forcePasswordReset
          ? {
              mustResetPassword: true,
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
      create: {
        tenantId: user.tenantId,
        organizationId: access.center.organizationId,
        email,
        name: staffName,
        role: staffRole,
        isActive: true,
        mustResetPassword: forcePasswordReset,
      },
    });
    await ensureTeacherCenterGrant({
      userId: staffUser.id,
      tenantId: user.tenantId,
      organizationId: access.center.organizationId,
      centerId,
    });
    const existingProfile = await prisma.staffProfile.findUnique({
      where: { userId: staffUser.id },
      select: { id: true, customFields: true },
    });
    const staffKioskPinSetAt = staffKioskPin ? new Date() : null;
    const data = {
      userId: staffUser.id,
      centerId,
      classroomId: clean(body.classroomId) || null,
      title: clean(body.title) || clean(body.body) || staffRole.replaceAll("_", " "),
      phone: clean(body.phone) || null,
      backgroundCheckStatus: clean(body.backgroundCheckStatus) || "pending",
      ...(staffKioskPin && existingProfile && staffKioskPinSetAt
        ? {
            customFields: staffKioskPinFields({
              customFields: existingProfile.customFields,
              pinHash: hashStaffPin(existingProfile.id, staffKioskPin),
              pinSetAt: staffKioskPinSetAt,
              pinSetById: user.id,
            }),
          }
        : {}),
    };
    if (id) {
      const existing = await prisma.staffProfile.findUnique({ where: { id }, select: { centerId: true, userId: true } });
      const guard = scopedUpdateGuard({ entity: "Teacher profile", expectedScopeId: centerId, actualScopeId: existing?.centerId, scopeLabel: "center" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
      if (existing?.userId !== staffUser.id) {
        return NextResponse.json({ ok: false, error: "Teacher profile is not linked to this user." }, { status: 403 });
      }
    }
    const savedStaffProfile = id
      ? await prisma.staffProfile.update({ where: { id }, data })
      : await prisma.staffProfile.upsert({
          where: { userId: staffUser.id },
          update: data,
          create: data,
        });
    result = savedStaffProfile;
    if (staffKioskPin && !existingProfile && staffKioskPinSetAt) {
      result = await prisma.staffProfile.update({
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
    auditMetadata.auth = auth as Prisma.InputJsonValue;
    auditMetadata.staffKioskCodeSet = Boolean(staffKioskPin);
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
      const existing = await prisma.campaign.findUnique({ where: { id }, select: { brandId: true } });
      const guard = scopedUpdateGuard({ entity: "Campaign", expectedScopeId: brand?.id ?? null, actualScopeId: existing?.brandId, scopeLabel: "brand" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const data = {
      brandId: brand?.id ?? null,
      name: clean(body.name),
      type: clean(body.type) || "email",
      audience: clean(body.audience) ? { label: clean(body.audience) } : undefined,
      status: clean(body.status) || "draft",
      metrics: id ? undefined : { createdFrom: "operations_record_api" },
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Campaign name is required." }, { status: 400 });
    result = id ? await prisma.campaign.update({ where: { id }, data }) : await prisma.campaign.create({ data });
  } else if (entity === "automation") {
    const brand = await prisma.brand.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (id) {
      const existing = await prisma.automation.findUnique({ where: { id }, select: { brandId: true } });
      const guard = scopedUpdateGuard({ entity: "Automation", expectedScopeId: brand?.id ?? null, actualScopeId: existing?.brandId, scopeLabel: "brand" });
      if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }
    const data = {
      brandId: brand?.id ?? null,
      name: clean(body.name),
      trigger: clean(body.trigger) || "manual",
      condition: clean(body.condition) ? { rule: clean(body.condition) } : undefined,
      action: { type: clean(body.action) || "create_task" },
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
      storageKey: clean(body.storageKey) || "upload_pending",
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Document name is required." }, { status: 400 });
    result = id ? await prisma.document.update({ where: { id }, data }) : await prisma.document.create({ data });
  } else if (entity === "form") {
    const data = {
      name: clean(body.name),
      type: clean(body.type) || "custom",
      schema: { fields: clean(body.fields) ? clean(body.fields).split(",").map((field) => field.trim()) : [] },
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
      cadence: clean(body.cadence) || "monthly",
      amountCents: intValue(body.amountCents || Number(body.amountDollars) * 100),
    };
    if (!data.name || data.amountCents <= 0) return NextResponse.json({ ok: false, error: "Plan name and amount are required." }, { status: 400 });
    result = id ? await prisma.tuitionPlan.update({ where: { id }, data }) : await prisma.tuitionPlan.create({ data });
  } else if (entity === "review") {
    const data = {
      source: clean(body.source) || "manual",
      rating: Math.min(Math.max(intValue(body.rating, 5), 1), 5),
      body: clean(body.body) || null,
      responseDraft: clean(body.responseDraft) || null,
      approvedForPublicTestimonial: Boolean(body.approvedForPublicTestimonial),
    };
    result = id ? await prisma.review.update({ where: { id }, data }) : await prisma.review.create({ data });
  } else {
    return NextResponse.json({ ok: false, error: `Unsupported entity: ${entity}` }, { status: 400 });
  }

  await writeAuditLog(user, {
    centerId,
    action: `operations.${entity}.${mode}`,
    resource: entity,
    resourceId: id || (typeof result === "object" && result && "id" in result ? String(result.id) : null),
    metadata: auditMetadata as Prisma.InputJsonObject,
  });

  return NextResponse.json({ ok: true, entity, mode, record: result, ...auditMetadata }, { status: id ? 200 : 201 });
}

export async function DELETE(request: NextRequest) {
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

  if (entity === "staff") {
    const staff = await prisma.staffProfile.findUnique({
      where: { id },
      select: { id: true, centerId: true, userId: true },
    });
    if (!staff) return NextResponse.json({ ok: false, error: "Teacher profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this teacher profile." }, { status: 403 });
    }

    const result = await prisma.user.update({
      where: { id: staff.userId },
      data: { isActive: false },
      select: { id: true, email: true, name: true, isActive: true },
    });
    await writeAuditLog(user, {
      centerId: staff.centerId,
      action: "operations.staff.deactivated",
      resource: "staff",
      resourceId: staff.id,
      metadata: { mode: "deactivated", userId: staff.userId },
    });
    return NextResponse.json({ ok: true, entity, mode: "deactivated", record: result });
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
