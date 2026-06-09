import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";
import {
  normalizeSchoolOnboardingSetup,
  schoolOnboardingSetupSections,
  type SchoolOnboardingSetupInput,
} from "@/lib/onboarding-setup";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanSections(value: unknown) {
  const input = record(value);
  return Object.fromEntries(
    schoolOnboardingSetupSections.map((section) => [section.field, input[section.field]]),
  ) as SchoolOnboardingSetupInput;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "School setup is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const requestedCenterId = typeof body?.centerId === "string" ? body.centerId : user.primaryCenterId;
  if (!requestedCenterId) {
    return NextResponse.json({ ok: false, error: "Choose a school before saving setup." }, { status: 400 });
  }
  if (!canAccessCenter(user, requestedCenterId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to that school." }, { status: 403 });
  }

  const center = await prisma.center.findFirst({
    where: {
      id: requestedCenterId,
      organization: { tenantId: user.tenantId },
    },
    select: { id: true, customFields: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  }

  const setup = normalizeSchoolOnboardingSetup(cleanSections(body?.sections));
  const savedAt = new Date().toISOString();
  const customFields = {
    ...record(center.customFields),
    schoolOnboardingSetup: {
      ...setup,
      capturedAt: savedAt,
      capturedByEmail: user.email,
      capturedByUserId: user.id,
      expectedOwner: "school_director",
    },
  };

  await prisma.center.update({
    where: { id: center.id },
    data: {
      customFields: customFields as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog(user, {
    action: "school_setup.director_input.saved",
    resource: "Center",
    resourceId: center.id,
    centerId: center.id,
    metadata: {
      status: setup.status,
      completedSections: setup.completedSections,
      missingSections: setup.missingSections,
      savedAt,
    },
  });

  return NextResponse.json({ ok: true, setup });
}
