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
import { isValidEinInput, normalizeEin, schoolEinCustomFields } from "@/lib/school-tax-id";

import { withApiLogging } from "@/lib/request-response-logging";
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

function hasOwn(value: Record<string, unknown> | null, key: string) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function cleanSections(value: unknown) {
  const input = record(value);
  return Object.fromEntries(
    schoolOnboardingSetupSections.map((section) => [section.field, input[section.field]]),
  ) as SchoolOnboardingSetupInput;
}

function responseSections(setup: ReturnType<typeof normalizeSchoolOnboardingSetup>) {
  return Object.fromEntries(
    schoolOnboardingSetupSections.map((section) => [
      section.field,
      setup.sections[section.storageKey].value,
    ]),
  );
}

async function POSTHandler(request: NextRequest) {
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

  const sectionsProvided = hasOwn(body, "sections");
  const setup = sectionsProvided ? normalizeSchoolOnboardingSetup(cleanSections(body?.sections)) : null;
  const savedAt = new Date().toISOString();
  const schoolEinProvided = hasOwn(body, "schoolEin");
  if (schoolEinProvided && !isValidEinInput(body?.schoolEin)) {
    return NextResponse.json({ ok: false, error: "School EIN must be 9 digits." }, { status: 400 });
  }

  let savedCenterId: string | null = null;
  let savedCustomFields: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const center = await prisma.center.findFirst({
      where: {
        id: requestedCenterId,
        organization: { tenantId: user.tenantId },
      },
      select: { id: true, customFields: true, updatedAt: true },
    });
    if (!center) {
      return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
    }

    let customFields: Record<string, unknown> = {
      ...record(center.customFields),
    };
    if (setup) {
      customFields.schoolOnboardingSetup = {
        ...setup,
        capturedAt: savedAt,
        capturedByEmail: user.email,
        capturedByUserId: user.id,
        expectedOwner: "school_director",
      };
    }
    if (schoolEinProvided) {
      customFields = schoolEinCustomFields(customFields, body?.schoolEin, {
        savedAt,
        savedByEmail: user.email,
        savedByUserId: user.id,
      });
    }

    const update = await prisma.center.updateMany({
      where: { id: center.id, updatedAt: center.updatedAt },
      data: { customFields: customFields as Prisma.InputJsonValue },
    });
    if (update.count === 1) {
      savedCenterId = center.id;
      savedCustomFields = customFields;
      break;
    }
  }

  if (!savedCenterId || !savedCustomFields) {
    return NextResponse.json(
      { ok: false, error: "This school changed while you were saving. Review the latest values and try again." },
      { status: 409 },
    );
  }

  await writeAuditLog(user, {
    action: "school_setup.director_input.saved",
    resource: "Center",
    resourceId: savedCenterId,
    centerId: savedCenterId,
    metadata: {
      status: setup?.status ?? null,
      completedSections: setup?.completedSections ?? [],
      missingSections: setup?.missingSections ?? [],
      sectionsUpdated: sectionsProvided,
      schoolEinUpdated: schoolEinProvided,
      savedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    centerId: savedCenterId,
    setup,
    sections: setup ? responseSections(setup) : undefined,
    schoolEin: normalizeEin(savedCustomFields.schoolEin),
    savedAt,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
