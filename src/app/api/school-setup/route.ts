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
import {
  assessSchoolDataSetup,
  normalizeSchoolDataSetupInput,
  readSchoolDataSetup,
  type SchoolDataSetup,
} from "@/lib/school-data-setup";
import { loadSchoolDataReviewEvidence } from "@/lib/school-data-setup-server";
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

type SchoolBusinessProfile = {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  timezone: string;
  licensedCapacity: number;
};

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizeBusinessProfile(value: unknown): SchoolBusinessProfile {
  const input = record(value);
  const capacityText = cleanText(input.licensedCapacity, 20);
  const capacity = capacityText && !/^\d+$/.test(capacityText) ? Number.NaN : Number(capacityText || 0);
  return {
    name: cleanText(input.name, 200),
    address: cleanText(input.address, 300),
    city: cleanText(input.city, 150),
    state: cleanText(input.state, 100).toUpperCase(),
    postalCode: cleanText(input.postalCode, 30),
    phone: cleanText(input.phone, 50),
    email: cleanText(input.email, 320).toLowerCase(),
    timezone: cleanText(input.timezone, 100),
    licensedCapacity: Number.isInteger(capacity) && capacity >= 0 && capacity <= 10_000 ? capacity : Number.NaN,
  };
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validTimeZone(value: string) {
  if (!value) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

const businessProfileFields = ["name", "address", "city", "state", "postalCode", "phone", "email", "timezone", "licensedCapacity"] as const;

function completedBusinessProfileFields(profile: SchoolBusinessProfile) {
  return businessProfileFields.filter((field) => field === "licensedCapacity" ? profile.licensedCapacity > 0 : Boolean(profile[field]));
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
  const dataSetupProvided = hasOwn(body, "dataSetup");
  const dataSetupInput = dataSetupProvided ? normalizeSchoolDataSetupInput(body?.dataSetup) : null;
  const confirmDataReview = body?.confirmDataReview === true;
  if (dataSetupProvided && !dataSetupInput?.path) {
    return NextResponse.json({ ok: false, error: "Choose how this school is starting before saving." }, { status: 400 });
  }
  if (dataSetupInput?.path === "import_existing" && !dataSetupInput.sourceSystem) {
    return NextResponse.json({ ok: false, error: "Choose the previous source system before saving the import path." }, { status: 400 });
  }
  if (confirmDataReview && !dataSetupProvided) {
    return NextResponse.json({ ok: false, error: "Save the school data starting point before confirming its review." }, { status: 400 });
  }
  const savedAt = new Date().toISOString();
  const schoolEinProvided = hasOwn(body, "schoolEin");
  if (schoolEinProvided && !isValidEinInput(body?.schoolEin)) {
    return NextResponse.json({ ok: false, error: "School EIN must be 9 digits." }, { status: 400 });
  }
  const businessProfileProvided = hasOwn(body, "businessProfile");
  const businessProfile = businessProfileProvided ? normalizeBusinessProfile(body?.businessProfile) : null;
  if (businessProfile && !businessProfile.name) {
    return NextResponse.json({ ok: false, error: "School name is required." }, { status: 400 });
  }
  if (businessProfile && !Number.isFinite(businessProfile.licensedCapacity)) {
    return NextResponse.json({ ok: false, error: "Licensed capacity must be a whole number between 0 and 10,000." }, { status: 400 });
  }
  if (businessProfile && !validEmail(businessProfile.email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid school email address." }, { status: 400 });
  }
  if (businessProfile && !validTimeZone(businessProfile.timezone)) {
    return NextResponse.json({ ok: false, error: "Enter a valid IANA timezone such as America/New_York." }, { status: 400 });
  }

  let savedCenterId: string | null = null;
  let savedCustomFields: Record<string, unknown> | null = null;
  let savedBusinessProfile: SchoolBusinessProfile | null = null;
  let dataReviewConfirmed = false;
  let dataReviewConfirmationStale = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const center = await prisma.center.findFirst({
      where: {
        id: requestedCenterId,
        organization: { tenantId: user.tenantId },
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        phone: true,
        email: true,
        timezone: true,
        licensedCapacity: true,
        customFields: true,
        updatedAt: true,
      },
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
    const effectiveBusinessProfile = businessProfile ? {
      ...businessProfile,
      timezone: businessProfile.timezone || center.timezone,
    } : {
      name: center.name,
      address: center.address ?? "",
      city: center.city ?? "",
      state: center.state ?? "",
      postalCode: center.postalCode ?? "",
      phone: center.phone ?? "",
      email: center.email ?? "",
      timezone: center.timezone ?? "",
      licensedCapacity: center.licensedCapacity,
    };
    if (businessProfileProvided) {
      const existingBusinessInformation = record(customFields.businessInformation);
      customFields.businessInformation = {
        ...existingBusinessInformation,
        source: existingBusinessInformation.source ?? "school_setup",
        capturedAt: existingBusinessInformation.capturedAt ?? savedAt,
        ...effectiveBusinessProfile,
        licensedCapacity: effectiveBusinessProfile.licensedCapacity || null,
        lastReviewedAt: savedAt,
        lastReviewedByEmail: user.email,
        lastReviewedByUserId: user.id,
      };
    }
    if (setup || businessProfileProvided) {
      const completedFields = completedBusinessProfileFields(effectiveBusinessProfile);
      const missingBusinessFields = businessProfileFields.filter((field) => !completedFields.includes(field));
      const storedSchoolSetup = record(customFields.schoolOnboardingSetup);
      const storedSchoolSections = record(storedSchoolSetup.sections);
      const storedSchoolProfile = record(storedSchoolSections.schoolProfile);
      const schoolProfileNote = typeof storedSchoolProfile.value === "string" ? storedSchoolProfile.value.trim() : "";
      const schoolProfileReviewed = Boolean(schoolProfileNote && !schoolProfileNote.toLowerCase().includes("needs confirmation"));
      const preparationReceipt = record(customFields.setupPreparationReceipt);
      const profileConfirmed = missingBusinessFields.length === 0 && schoolProfileReviewed;
      customFields.setupPreparationReceipt = {
        ...preparationReceipt,
        version: 1,
        source: preparationReceipt.source ?? "authorized_business_information",
        preparedAt: preparationReceipt.preparedAt ?? savedAt,
        preparedFields: completedFields,
        missingBusinessFields,
        excludedFields: ["payout_bank", "family_data", "child_data"],
        status: profileConfirmed ? "school_confirmed" : "awaiting_school_confirmation",
        confirmedAt: profileConfirmed ? savedAt : null,
        confirmedByEmail: profileConfirmed ? user.email : null,
        confirmedByUserId: profileConfirmed ? user.id : null,
      };
      const businessInformation = record(customFields.businessInformation);
      if (Object.keys(businessInformation).length) {
        customFields.businessInformation = {
          ...businessInformation,
          reviewRequired: !profileConfirmed,
        };
      }
    }
    if (schoolEinProvided) {
      customFields = schoolEinCustomFields(customFields, body?.schoolEin, {
        savedAt,
        savedByEmail: user.email,
        savedByUserId: user.id,
      });
    }
    if (dataSetupInput?.path) {
      const existingDataSetup = readSchoolDataSetup(customFields);
      const selectionChanged = existingDataSetup.path !== dataSetupInput.path
        || existingDataSetup.sourceSystem !== dataSetupInput.sourceSystem
        || existingDataSetup.noCurrentFamiliesExpected !== dataSetupInput.noCurrentFamiliesExpected;
      let reviewConfirmation = selectionChanged ? null : existingDataSetup.reviewConfirmation;
      const nextDataSetup: SchoolDataSetup = {
        version: 1,
        ...dataSetupInput,
        selectedAt: selectionChanged || !existingDataSetup.selectedAt ? savedAt : existingDataSetup.selectedAt,
        selectedByUserId: selectionChanged || !existingDataSetup.selectedByUserId ? user.id : existingDataSetup.selectedByUserId,
        selectedByEmail: selectionChanged || !existingDataSetup.selectedByEmail ? user.email : existingDataSetup.selectedByEmail,
        reviewConfirmation,
      };
      if (confirmDataReview) {
        const evidence = await loadSchoolDataReviewEvidence({ centerId: center.id, tenantId: user.tenantId });
        const currentAssessment = assessSchoolDataSetup({ ...nextDataSetup, reviewConfirmation: null }, evidence);
        if (!currentAssessment.canConfirm) {
          return NextResponse.json({
            ok: false,
            error: currentAssessment.blockedReason || "Finish the current school data review before confirming it.",
          }, { status: 409 });
        }
        reviewConfirmation = {
          revision: currentAssessment.revision,
          path: dataSetupInput.path,
          sourceSystem: dataSetupInput.sourceSystem,
          noCurrentFamiliesExpected: dataSetupInput.noCurrentFamiliesExpected,
          confirmedAt: savedAt,
          confirmedByUserId: user.id,
          confirmedByEmail: user.email,
          latestImportBatchId: evidence.latestImportBatch?.id ?? null,
          familyCount: evidence.familyCount,
          childCount: evidence.childCount,
          guardianCount: evidence.guardianCount,
          relevantFamilyCount: evidence.relevantFamilyCount,
          relevantChildCount: evidence.relevantChildCount,
          domainFingerprints: evidence.domainFingerprints,
          domainMetrics: evidence.domainMetrics,
          sourceEvidenceReceipt: dataSetupInput.path === "import_existing" && evidence.latestImportBatch?.sourceSha256 && evidence.latestImportBatch.reviewFingerprint
            ? {
                batchId: evidence.latestImportBatch.id,
                filename: evidence.latestImportBatch.filename,
                sourceSha256: evidence.latestImportBatch.sourceSha256,
                reviewFingerprint: evidence.latestImportBatch.reviewFingerprint,
                sourceAdapter: evidence.latestImportBatch.sourceAdapter,
                retainedRowCount: evidence.latestImportBatch.totalRows,
                recordedAt: savedAt,
                status: "recoverable_backup_available" as const,
              }
            : null,
        };
        nextDataSetup.reviewConfirmation = reviewConfirmation;
        dataReviewConfirmed = true;
      }
      customFields.schoolDataSetup = nextDataSetup;
    }

    const update = await prisma.center.updateMany({
      where: { id: center.id, updatedAt: center.updatedAt },
      data: {
        customFields: customFields as Prisma.InputJsonValue,
        ...(businessProfileProvided ? {
          name: effectiveBusinessProfile.name,
          address: effectiveBusinessProfile.address || null,
          city: effectiveBusinessProfile.city || null,
          state: effectiveBusinessProfile.state || null,
          postalCode: effectiveBusinessProfile.postalCode || null,
          phone: effectiveBusinessProfile.phone || null,
          email: effectiveBusinessProfile.email || null,
          timezone: effectiveBusinessProfile.timezone,
          licensedCapacity: effectiveBusinessProfile.licensedCapacity,
        } : {}),
      },
    });
    if (update.count === 1) {
      savedCenterId = center.id;
      savedCustomFields = customFields;
      savedBusinessProfile = effectiveBusinessProfile;
      break;
    }
  }

  if (!savedCenterId || !savedCustomFields) {
    return NextResponse.json(
      { ok: false, error: "This school changed while you were saving. Review the latest values and try again." },
      { status: 409 },
    );
  }

  if (dataReviewConfirmed) {
    const postSaveEvidence = await loadSchoolDataReviewEvidence({ centerId: savedCenterId, tenantId: user.tenantId });
    const postSaveAssessment = assessSchoolDataSetup(readSchoolDataSetup(savedCustomFields), postSaveEvidence);
    if (!postSaveAssessment.confirmationCurrent) {
      dataReviewConfirmed = false;
      dataReviewConfirmationStale = true;
    }
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
      businessProfileUpdated: businessProfileProvided,
      dataSetupUpdated: dataSetupProvided,
      dataSetupPath: dataSetupInput?.path ?? null,
      dataReviewConfirmed,
      dataReviewConfirmationStale,
      savedAt,
    },
  });

  if (dataReviewConfirmationStale) {
    return NextResponse.json({
      ok: false,
      error: "School data changed while the confirmation was being saved. Review the refreshed evidence and confirm again.",
      dataSetup: readSchoolDataSetup(savedCustomFields),
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    centerId: savedCenterId,
    setup,
    sections: setup ? responseSections(setup) : undefined,
    businessProfile: savedBusinessProfile,
    dataSetup: readSchoolDataSetup(savedCustomFields),
    schoolEin: normalizeEin(savedCustomFields.schoolEin),
    savedAt,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
