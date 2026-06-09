import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashGuardianPin, normalizePin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dollarsToCents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Family intake is not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const centerId = clean(body.centerId) || user.primaryCenterId || "";
  const familyName = clean(body.familyName);
  const address = clean(body.address);
  const familyNotes = clean(body.familyNotes);
  const custodyNotes = clean(body.custodyNotes);
  const guardianName = clean(body.guardianName);
  const guardianEmail = normalizeEmail(body.guardianEmail);
  const guardianPhone = clean(body.guardianPhone);
  const guardianRelation = clean(body.guardianRelation) || "Parent/Guardian";
  const guardianEmployer = clean(body.guardianEmployer);
  const preferredCommunication = clean(body.preferredCommunication) || (guardianEmail ? "email" : guardianPhone ? "phone" : null);
  const checkInPin = normalizePin(body.checkInPin);
  const childName = clean(body.childName);
  const preferredName = clean(body.preferredName);
  const dateOfBirth = parseDate(body.dateOfBirth);
  const ageGroup = clean(body.ageGroup) || "Preschool";
  const enrollmentStatus = clean(body.enrollmentStatus) || "enrolled";
  const startDate = parseDate(body.startDate);
  const classroomId = clean(body.classroomId);
  const scheduleNotes = clean(body.scheduleNotes);
  const napNotes = clean(body.napNotes);
  const feedingNotes = clean(body.feedingNotes);
  const pottyNotes = clean(body.pottyNotes);
  const developmentalNotes = clean(body.developmentalNotes);
  const startingBalanceCents = dollarsToCents(body.startingBalanceDollars);

  const errors: Record<string, string> = {};
  if (!centerId) errors.centerId = "Center is required.";
  if (!familyName) errors.familyName = "Family name is required.";
  if (!guardianName) errors.guardianName = "Primary guardian name is required.";
  if (!guardianEmail && !guardianPhone) errors.guardianEmail = "Parent email or phone is required.";
  if (!childName) errors.childName = "Child name is required.";
  if (!dateOfBirth) errors.dateOfBirth = "Child date of birth is required.";
  if (clean(body.checkInPin) && !checkInPin) errors.checkInPin = "Check-in PIN must be exactly 4 digits.";
  if (Object.keys(errors).length) {
    return NextResponse.json({ ok: false, error: "Please fix the highlighted fields.", errors }, { status: 400 });
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, organizationId: true, name: true, crmLocationId: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }
  if (!canAccessCenter(user, center.id)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  if (classroomId) {
    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { centerId: true } });
    if (!classroom || classroom.centerId !== center.id) {
      return NextResponse.json({ ok: false, error: "Classroom must belong to the selected center." }, { status: 400 });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingFamily = guardianEmail
      ? await tx.family.findFirst({
          where: {
            centerId: center.id,
            OR: [
              { billingEmail: guardianEmail },
              { guardians: { some: { email: guardianEmail } } },
            ],
          },
          select: { id: true, name: true },
        })
      : null;

    const family = existingFamily
      ? await tx.family.update({
          where: { id: existingFamily.id },
          data: {
            name: familyName,
            address: address || undefined,
            billingEmail: guardianEmail || undefined,
            notes: familyNotes || undefined,
            custodyNotes: custodyNotes || undefined,
          },
        })
      : await tx.family.create({
          data: {
            centerId: center.id,
            name: familyName,
            address: address || null,
            billingEmail: guardianEmail || null,
            notes: familyNotes || null,
            custodyNotes: custodyNotes || null,
          },
        });

    const existingParentUser = guardianEmail
      ? await tx.user.findUnique({
          where: { email: guardianEmail },
          select: { id: true, role: true },
        })
      : null;

    const existingGuardian = await tx.guardian.findFirst({
      where: {
        familyId: family.id,
        OR: [
          guardianEmail ? { email: guardianEmail } : undefined,
          { fullName: guardianName },
        ].filter(Boolean) as Array<{ email?: string; fullName?: string }>,
      },
    });

    const guardianData = {
      fullName: guardianName,
      email: guardianEmail || null,
      phone: guardianPhone || null,
      employer: guardianEmployer || null,
      relation: guardianRelation,
      preferredCommunication,
      isBillingContact: true,
      userId: existingParentUser?.role === UserRole.PARENT_GUARDIAN ? existingParentUser.id : null,
    };

    const guardian = existingGuardian
      ? await tx.guardian.update({
          where: { id: existingGuardian.id },
          data: guardianData,
        })
      : await tx.guardian.create({
          data: {
            familyId: family.id,
            ...guardianData,
          },
        });

    if (checkInPin) {
      await tx.guardian.update({
        where: { id: guardian.id },
        data: {
          checkInPinHash: hashGuardianPin(guardian.id, checkInPin),
          checkInPinSetAt: new Date(),
          checkInPinSetById: user.id,
        },
      });
    }

    const existingChild = await tx.child.findFirst({
      where: {
        familyId: family.id,
        fullName: childName,
      },
      select: { id: true },
    });

    const childData = {
      familyId: family.id,
      classroomId: classroomId || null,
      fullName: childName,
      preferredName: preferredName || null,
      dateOfBirth: dateOfBirth!,
      ageGroup,
      enrollmentStatus,
      startDate,
      schedule: scheduleNotes ? { notes: scheduleNotes } : undefined,
      photoVideoPermission: Boolean(body.photoVideoPermission),
      fieldTripPermission: Boolean(body.fieldTripPermission),
      napNotes: napNotes || null,
      feedingNotes: feedingNotes || null,
      pottyNotes: pottyNotes || null,
      developmentalNotes: developmentalNotes || null,
    };

    const child = existingChild
      ? await tx.child.update({
          where: { id: existingChild.id },
          data: childData,
        })
      : await tx.child.create({ data: childData });

    const billingAccount = await tx.billingAccount.upsert({
      where: { familyId: family.id },
      update: {},
      create: { familyId: family.id, balanceCents: 0 },
    });

    let invoiceId: string | null = null;
    if (startingBalanceCents) {
      const invoice = await tx.invoice.create({
        data: {
          billingAccountId: billingAccount.id,
          number: `OPEN-${Date.now()}`,
          status: PaymentStatus.OPEN,
          dueDate: new Date(),
          totalCents: startingBalanceCents,
          items: {
            create: [{ description: "Opening family balance", amountCents: startingBalanceCents }],
          },
        },
      });
      const updatedAccount = await tx.billingAccount.update({
        where: { id: billingAccount.id },
        data: { balanceCents: { increment: startingBalanceCents } },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: billingAccount.id,
          invoiceId: invoice.id,
          type: "opening_balance",
          description: "Opening family balance",
          amountCents: startingBalanceCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "bee_suite_manual_intake",
          externalId: `manual-intake:${family.id}:${Date.now()}`,
          metadata: { enteredBy: user.email, childId: child.id },
        },
      });
      invoiceId = invoice.id;
    }

    return {
      family,
      guardian,
      child,
      billingAccountId: billingAccount.id,
      invoiceId,
      mode: existingFamily ? "updated_existing_family" : "created_family",
    };
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "family.intake.saved",
    resource: "Family",
    resourceId: result.family.id,
    metadata: {
      center: center.crmLocationId ?? center.name,
      familyId: result.family.id,
      guardianId: result.guardian.id,
      childId: result.child.id,
      billingAccountId: result.billingAccountId,
      invoiceId: result.invoiceId,
      mode: result.mode,
      pinSet: Boolean(checkInPin),
    },
  });

  return NextResponse.json({
    ok: true,
    mode: result.mode,
    family: { id: result.family.id, name: result.family.name },
    guardian: { id: result.guardian.id, fullName: result.guardian.fullName },
    child: { id: result.child.id, fullName: result.child.fullName },
    billingAccountId: result.billingAccountId,
    invoiceId: result.invoiceId,
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
