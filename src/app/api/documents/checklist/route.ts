import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  findChecklistDefinition,
  matchesRequiredChecklistDefinition,
  type RequirementScope,
} from "@/lib/required-document-checklist";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRequirementScope(value: string): value is RequirementScope {
  return value === "family" || value === "child" || value === "staff";
}

function canAccessRequiredCenter(user: CurrentUser, centerId: string | null) {
  return canAccessAllCenters(user) || Boolean(centerId && canAccessCenter(user, centerId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Document checklist updates are not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const scope = clean(body.scope);
  const subjectId = clean(body.subjectId);
  const requirementId = clean(body.requirementId);
  if (!isRequirementScope(scope) || !subjectId || !requirementId) {
    return NextResponse.json({ ok: false, error: "Scope, subject, and requirement are required." }, { status: 400 });
  }

  if (scope === "family") {
    const requirement = findChecklistDefinition(scope, requirementId);
    if (!requirement) {
      return NextResponse.json({ ok: false, error: "Required checklist item was not found." }, { status: 404 });
    }
    const family = await prisma.family.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        name: true,
        centerId: true,
        documents: { select: { id: true, name: true, type: true, status: true, expiresAt: true } },
      },
    });
    if (!family) return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
    if (!canAccessRequiredCenter(user, family.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
    }
    const existing = family.documents.find((document) => matchesRequiredChecklistDefinition(requirement, document));
    if (existing && existing.status !== DocumentStatus.REJECTED) {
      return NextResponse.json({ ok: true, mode: "existing", record: existing });
    }

    const document = await prisma.document.create({
      data: {
        familyId: family.id,
        name: requirement.label,
        type: requirement.type,
        status: DocumentStatus.REQUESTED,
        restricted: Boolean(requirement.restricted),
        storageKey: "upload_pending",
      },
    });
    await writeAuditLog(user, {
      centerId: family.centerId,
      action: "document.checklist.requested",
      resource: "Document",
      resourceId: document.id,
      metadata: { scope, subjectId, requirementId },
    });
    return NextResponse.json({ ok: true, mode: "created", record: document }, { status: 201 });
  }

  if (scope === "child") {
    const requirement = findChecklistDefinition(scope, requirementId);
    if (!requirement) {
      return NextResponse.json({ ok: false, error: "Required checklist item was not found." }, { status: 404 });
    }
    const child = await prisma.child.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        fullName: true,
        familyId: true,
        family: { select: { centerId: true } },
        documents: { select: { id: true, name: true, type: true, status: true, expiresAt: true } },
      },
    });
    if (!child) return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
    if (!canAccessRequiredCenter(user, child.family.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this child." }, { status: 403 });
    }
    const existing = child.documents.find((document) => matchesRequiredChecklistDefinition(requirement, document));
    if (existing && existing.status !== DocumentStatus.REJECTED) {
      return NextResponse.json({ ok: true, mode: "existing", record: existing });
    }

    const document = await prisma.document.create({
      data: {
        familyId: child.familyId,
        childId: child.id,
        name: requirement.label,
        type: requirement.type,
        status: DocumentStatus.REQUESTED,
        restricted: Boolean(requirement.restricted),
        storageKey: "upload_pending",
      },
    });
    await writeAuditLog(user, {
      centerId: child.family.centerId,
      action: "document.checklist.requested",
      resource: "Document",
      resourceId: document.id,
      metadata: { scope, subjectId, requirementId },
    });
    return NextResponse.json({ ok: true, mode: "created", record: document }, { status: 201 });
  }

  const staff = await prisma.staffProfile.findUnique({
    where: { id: subjectId },
    select: {
      id: true,
      centerId: true,
      user: { select: { name: true } },
      center: { select: { name: true, crmLocationId: true, state: true, licensedCapacity: true, customFields: true } },
      certifications: { select: { id: true, name: true, status: true, expiresAt: true } },
    },
  });
  if (!staff) return NextResponse.json({ ok: false, error: "Staff profile not found." }, { status: 404 });
  if (!canAccessRequiredCenter(user, staff.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this staff profile." }, { status: 403 });
  }
  const requirement = findChecklistDefinition(scope, requirementId, { center: staff.center });
  if (!requirement) {
    return NextResponse.json({ ok: false, error: "Required checklist item was not found for this school." }, { status: 404 });
  }
  const existing = staff.certifications.find((certification) => matchesRequiredChecklistDefinition(requirement, certification));
  if (existing && existing.status.toLowerCase() !== "rejected") {
    return NextResponse.json({ ok: true, mode: "existing", record: existing });
  }

  const certification = await prisma.certification.create({
    data: {
      staffId: staff.id,
      name: requirement.label,
      status: "requested",
    },
  });
  await writeAuditLog(user, {
    centerId: staff.centerId,
    action: "staff.checklist.requested",
    resource: "Certification",
    resourceId: certification.id,
    metadata: { scope, subjectId, requirementId },
  });
  return NextResponse.json({ ok: true, mode: "created", record: certification }, { status: 201 });
}
