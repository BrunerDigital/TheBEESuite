import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus } from "@prisma/client";
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

function requestedStatus(value: unknown) {
  const status = clean(value).toUpperCase();
  return Object.values(DocumentStatus).includes(status as DocumentStatus) ? status as DocumentStatus : DocumentStatus.REQUESTED;
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

  if (["product", "tuitionPlan"].includes(entity) && !canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing settings are not allowed for this role." }, { status: 403 });
  }
  if (!["product", "tuitionPlan"].includes(entity) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Record management is not allowed for this role." }, { status: 403 });
  }

  let result: unknown;
  let centerId: string | null = user.primaryCenterId;

  if (entity === "announcement") {
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
    if (!staffId) return NextResponse.json({ ok: false, error: "Staff ID is required." }, { status: 400 });
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffId }, select: { centerId: true } });
    if (!staff) return NextResponse.json({ ok: false, error: "Staff profile not found." }, { status: 404 });
    if (!canAccessCenter(user, staff.centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this staff profile." }, { status: 403 });
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
