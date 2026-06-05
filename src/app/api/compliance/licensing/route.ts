import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeLicensingConfiguration } from "@/lib/licensing-config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, Prisma.InputJsonValue>) }
    : {};
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Licensing configuration is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const centerId = clean(body?.centerId);
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      state: true,
      licensedCapacity: true,
      customFields: true,
    },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }
  if (!canAccessCenter(user, center.id)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const licensingConfiguration = normalizeLicensingConfiguration(
    {
      state: body?.state,
      licensingAgency: body?.licensingAgency,
      licenseNumber: body?.licenseNumber,
      licenseType: body?.licenseType,
      licensedCapacity: body?.licensedCapacity,
      renewalDueDate: body?.renewalDueDate,
      inspectionDueDate: body?.inspectionDueDate,
      ratioRules: body?.ratioRules,
      childDocumentRules: body?.childDocumentRules,
      staffCredentialRules: body?.staffCredentialRules,
      emergencyPreparednessRules: body?.emergencyPreparednessRules,
      medicationRules: body?.medicationRules,
      notes: body?.notes,
    },
    {
      fallbackState: center.state,
      fallbackLicensedCapacity: center.licensedCapacity,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user.id,
    },
  );

  const customFields = {
    ...jsonObject(center.customFields),
    licensingConfiguration,
  };
  const updateData: Prisma.CenterUpdateInput = {
    customFields,
  };
  if (licensingConfiguration.licensedCapacity !== null) {
    updateData.licensedCapacity = licensingConfiguration.licensedCapacity;
  }

  const updated = await prisma.center.update({
    where: { id: center.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      state: true,
      licensedCapacity: true,
      customFields: true,
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "compliance.licensing_config.saved",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      status: licensingConfiguration.status,
      missingFields: licensingConfiguration.missingFields,
      state: licensingConfiguration.state,
      licenseType: licensingConfiguration.licenseType,
    },
  });

  return NextResponse.json({
    ok: true,
    center: {
      id: updated.id,
      name: updated.name,
      crmLocationId: updated.crmLocationId,
      state: updated.state,
      licensedCapacity: updated.licensedCapacity,
      licensingConfiguration,
    },
  });
}
