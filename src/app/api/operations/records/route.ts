import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, PaymentStatus, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

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
  if (!canAccessAllCenters(user) && family.centerId && !user.centerIds.includes(family.centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this family." };
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
      developmentalNotes: clean(body.body) || null,
    };
    if (!data.fullName) return NextResponse.json({ ok: false, error: "Child name is required." }, { status: 400 });
    result = id ? await prisma.child.update({ where: { id }, data }) : await prisma.child.create({ data });
  } else if (entity === "staff") {
    const requestedCenterId = clean(body.centerId) || clean(body.relatedId) || user.primaryCenterId;
    if (!requestedCenterId) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
    const access = await assertCenterAccess(user, requestedCenterId);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    centerId = access.center.id;
    const email = clean(body.email) || clean(body.type);
    const staffName = clean(body.name);
    if (!email || !staffName) return NextResponse.json({ ok: false, error: "Teacher name and email are required." }, { status: 400 });
    const staffRole = UserRole.TEACHER;
    const staffUser = await prisma.user.upsert({
      where: { email },
      update: { name: staffName, role: staffRole, isActive: true, organizationId: access.center.organizationId },
      create: {
        tenantId: user.tenantId,
        organizationId: access.center.organizationId,
        email,
        name: staffName,
        role: staffRole,
        isActive: true,
      },
    });
    const data = {
      userId: staffUser.id,
      centerId,
      classroomId: clean(body.classroomId) || null,
      title: clean(body.title) || clean(body.body) || staffRole.replaceAll("_", " "),
      phone: clean(body.phone) || null,
      backgroundCheckStatus: clean(body.backgroundCheckStatus) || "pending",
    };
    result = id
      ? await prisma.staffProfile.update({ where: { id }, data })
      : await prisma.staffProfile.upsert({
          where: { userId: staffUser.id },
          update: data,
          create: data,
        });
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
    if (account.family.centerId && !canAccessCenter(user, account.family.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this billing account." }, { status: 403 });
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
    const data = {
      familyId,
      childId: clean(body.childId) || null,
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
    const data = {
      staffId,
      name: clean(body.name),
      status: clean(body.status) || "active",
      expiresAt: parseDate(body.expiresAt),
    };
    if (!data.name) return NextResponse.json({ ok: false, error: "Certification name is required." }, { status: 400 });
    result = id ? await prisma.certification.update({ where: { id }, data }) : await prisma.certification.create({ data });
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
    metadata: { mode },
  });

  return NextResponse.json({ ok: true, entity, mode, record: result }, { status: id ? 200 : 201 });
}
