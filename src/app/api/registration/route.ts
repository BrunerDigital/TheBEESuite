import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, EnrollmentStage, UserRole } from "@prisma/client";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, uniqueEmails } from "@/lib/integrations";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { prisma } from "@/lib/prisma";
import {
  cleanText,
  kidCityRegistrationPacketSchema,
  normalizeEmailText,
  normalizeScheduleDays,
  type RegistrationPacketPayload,
} from "@/lib/registration-packet";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RegistrationPayload = RegistrationPacketPayload;

const rateLimit = new Map<string, { count: number; resetAt: number }>();

const stageRank: Record<EnrollmentStage, number> = {
  NEW_INQUIRY: 1,
  CONTACTED: 2,
  TOUR_SCHEDULED: 3,
  TOUR_COMPLETED: 4,
  APPLICATION_SENT: 5,
  APPLICATION_STARTED: 6,
  APPLICATION_SUBMITTED: 7,
  DOCUMENTS_PENDING: 8,
  DEPOSIT_PENDING: 9,
  ENROLLED: 10,
  WAITLISTED: 10,
  LOST_NOT_A_FIT: 10,
};

function clean(value: unknown) {
  return cleanText(value);
}

function cleanBool(value: unknown) {
  return value === true;
}

function cleanArray(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(values.map((item) => clean(item)).filter(Boolean)));
}

function readPayload(body: Record<string, unknown>): RegistrationPayload {
  return {
    centerId: clean(body.centerId),
    primaryGuardianName: clean(body.primaryGuardianName),
    primaryGuardianEmail: normalizeEmailText(body.primaryGuardianEmail),
    primaryGuardianPhone: clean(body.primaryGuardianPhone),
    primaryGuardianAddress: clean(body.primaryGuardianAddress),
    primaryGuardianRelation: clean(body.primaryGuardianRelation),
    primaryGuardianEmployer: clean(body.primaryGuardianEmployer),
    primaryGuardianHomePhone: clean(body.primaryGuardianHomePhone),
    primaryGuardianWorkPhone: clean(body.primaryGuardianWorkPhone),
    primaryGuardianCellPhoneCarrier: clean(body.primaryGuardianCellPhoneCarrier),
    primaryGuardianDriverLicense: clean(body.primaryGuardianDriverLicense),
    primaryGuardianSocialSecurityNumber: clean(body.primaryGuardianSocialSecurityNumber),
    secondaryGuardianName: clean(body.secondaryGuardianName),
    secondaryGuardianEmail: normalizeEmailText(body.secondaryGuardianEmail),
    secondaryGuardianPhone: clean(body.secondaryGuardianPhone),
    secondaryGuardianRelation: clean(body.secondaryGuardianRelation),
    secondaryGuardianEmployer: clean(body.secondaryGuardianEmployer),
    secondaryGuardianAddress: clean(body.secondaryGuardianAddress),
    secondaryGuardianHomePhone: clean(body.secondaryGuardianHomePhone),
    secondaryGuardianWorkPhone: clean(body.secondaryGuardianWorkPhone),
    secondaryGuardianCellPhoneCarrier: clean(body.secondaryGuardianCellPhoneCarrier),
    secondaryGuardianDriverLicense: clean(body.secondaryGuardianDriverLicense),
    secondaryGuardianSocialSecurityNumber: clean(body.secondaryGuardianSocialSecurityNumber),
    billingContactName: clean(body.billingContactName),
    billingContactEmail: normalizeEmailText(body.billingContactEmail),
    billingContactPhone: clean(body.billingContactPhone),
    childFullName: clean(body.childFullName),
    childPreferredName: clean(body.childPreferredName),
    childDateOfBirth: clean(body.childDateOfBirth),
    childSex: clean(body.childSex),
    childAddress: clean(body.childAddress),
    childPrimaryLanguage: clean(body.childPrimaryLanguage),
    childLivesWith: clean(body.childLivesWith),
    previousCareProgram: clean(body.previousCareProgram),
    siblingNamesAges: clean(body.siblingNamesAges),
    dayStructure: clean(body.dayStructure),
    newSituationNotes: clean(body.newSituationNotes),
    appetiteNotes: clean(body.appetiteNotes),
    feedsSelf: clean(body.feedsSelf),
    foodLikes: clean(body.foodLikes),
    foodDislikes: clean(body.foodDislikes),
    napSchedule: clean(body.napSchedule),
    nightSleepSchedule: clean(body.nightSleepSchedule),
    sleepItems: clean(body.sleepItems),
    napHints: clean(body.napHints),
    favoriteActivities: clean(body.favoriteActivities),
    developmentSkills: cleanArray(body.developmentSkills),
    toiletingStatus: clean(body.toiletingStatus),
    bathroomRequest: clean(body.bathroomRequest),
    bathroomHelpNeeded: clean(body.bathroomHelpNeeded),
    toiletingRoutine: clean(body.toiletingRoutine),
    goalsExpectations: clean(body.goalsExpectations),
    friendsAtCenter: clean(body.friendsAtCenter),
    childPersonality: clean(body.childPersonality),
    otherHelpfulInfo: clean(body.otherHelpfulInfo),
    participationInterests: cleanArray(body.participationInterests),
    participationOther: clean(body.participationOther),
    program: clean(body.program),
    schedule: clean(body.schedule),
    scheduleDays: normalizeScheduleDays(body.scheduleDays),
    desiredStartDate: clean(body.desiredStartDate),
    specialNeedsNotes: clean(body.specialNeedsNotes),
    medicalConditions: cleanArray(body.medicalConditions),
    medicalConditionOther: clean(body.medicalConditionOther),
    allergies: clean(body.allergies),
    allergyActionPlan: clean(body.allergyActionPlan),
    allergyReactionSymptoms: clean(body.allergyReactionSymptoms),
    allergyPreventativeMeasures: clean(body.allergyPreventativeMeasures),
    allergyExposureResponse: clean(body.allergyExposureResponse),
    emergencyMedicationInstructions: clean(body.emergencyMedicationInstructions),
    emergencyCarePlanContacts: clean(body.emergencyCarePlanContacts),
    medications: clean(body.medications),
    medicationAuthorizationNeeded: cleanBool(body.medicationAuthorizationNeeded),
    dietaryRestrictions: clean(body.dietaryRestrictions),
    medicalNotes: clean(body.medicalNotes),
    emergencyContacts: clean(body.emergencyContacts),
    authorizedPickups: clean(body.authorizedPickups),
    restrictedPickups: clean(body.restrictedPickups),
    custodyNotes: clean(body.custodyNotes),
    physicianInfo: clean(body.physicianInfo),
    physicianPhone: clean(body.physicianPhone),
    dentistInfo: clean(body.dentistInfo),
    dentistPhone: clean(body.dentistPhone),
    insuranceInfo: clean(body.insuranceInfo),
    insuranceCompany: clean(body.insuranceCompany),
    insurancePolicyNumber: clean(body.insurancePolicyNumber),
    hospitalPreference: clean(body.hospitalPreference),
    immunizationStatus: clean(body.immunizationStatus),
    immunizationExpirationDate: clean(body.immunizationExpirationDate),
    physicalExpirationDate: clean(body.physicalExpirationDate),
    elc4cExpirationDate: clean(body.elc4cExpirationDate),
    photoVideoReleaseChoice: clean(body.photoVideoReleaseChoice),
    photoVideoPermission: cleanBool(body.photoVideoPermission),
    fieldTripPermission: cleanBool(body.fieldTripPermission),
    transportationPermission: cleanBool(body.transportationPermission),
    sunscreenPermission: cleanBool(body.sunscreenPermission),
    waterActivityPermission: cleanBool(body.waterActivityPermission),
    emergencyMedicalPermission: cleanBool(body.emergencyMedicalPermission),
    firstAidEmergencyConsent: cleanBool(body.firstAidEmergencyConsent),
    floridaKnowYourChildcareAcknowledgment: cleanBool(body.floridaKnowYourChildcareAcknowledgment),
    floridaDistractedAdultAcknowledgment: cleanBool(body.floridaDistractedAdultAcknowledgment),
    dcfInspectionAccessAcknowledgment: cleanBool(body.dcfInspectionAccessAcknowledgment),
    physicalImmunizationThirtyDayAcknowledgment: cleanBool(body.physicalImmunizationThirtyDayAcknowledgment),
    foodProgramPermission: cleanBool(body.foodProgramPermission),
    foodActivityPermission: clean(body.foodActivityPermission),
    foodActivityAllergyChoice: clean(body.foodActivityAllergyChoice),
    foodActivityRestrictedItems: clean(body.foodActivityRestrictedItems),
    uniformBlackQuantity: clean(body.uniformBlackQuantity),
    uniformBlackSize: clean(body.uniformBlackSize),
    uniformYellowQuantity: clean(body.uniformYellowQuantity),
    uniformYellowSize: clean(body.uniformYellowSize),
    uniformPaymentChoice: clean(body.uniformPaymentChoice),
    uniformPaymentAmount: clean(body.uniformPaymentAmount),
    uniformComments: clean(body.uniformComments),
    handbookAcknowledgment: cleanBool(body.handbookAcknowledgment),
    emergencyProceduresAcknowledgment: cleanBool(body.emergencyProceduresAcknowledgment),
    tuitionPolicyAcknowledgment: cleanBool(body.tuitionPolicyAcknowledgment),
    disciplinePolicyAcknowledgment: cleanBool(body.disciplinePolicyAcknowledgment),
    expulsionPolicyAcknowledgment: cleanBool(body.expulsionPolicyAcknowledgment),
    mandatoryReportingAcknowledgment: cleanBool(body.mandatoryReportingAcknowledgment),
    healthPolicyAcknowledgment: cleanBool(body.healthPolicyAcknowledgment),
    nutritionPolicyAcknowledgment: cleanBool(body.nutritionPolicyAcknowledgment),
    collectionResponsibilityAcknowledgment: cleanBool(body.collectionResponsibilityAcknowledgment),
    financialAgreementPaymentFeesInitials: clean(body.financialAgreementPaymentFeesInitials),
    financialAgreementAbsenteePolicyInitials: clean(body.financialAgreementAbsenteePolicyInitials),
    financialAgreementRegistrationFeeInitials: clean(body.financialAgreementRegistrationFeeInitials),
    financialAgreementReturnedPaymentInitials: clean(body.financialAgreementReturnedPaymentInitials),
    financialAgreementDischargeInitials: clean(body.financialAgreementDischargeInitials),
    financialAgreementWithdrawalInitials: clean(body.financialAgreementWithdrawalInitials),
    financialAgreementLatePickupInitials: clean(body.financialAgreementLatePickupInitials),
    financialAgreementCollectionInitials: clean(body.financialAgreementCollectionInitials),
    financialAgreementUniformInitials: clean(body.financialAgreementUniformInitials),
    financialAgreementFinalTermsInitials: clean(body.financialAgreementFinalTermsInitials),
    mealBenefitApplicationNeeded: cleanBool(body.mealBenefitApplicationNeeded),
    mealApplicationCaseNumberSnap: clean(body.mealApplicationCaseNumberSnap),
    mealApplicationCaseNumberTanf: clean(body.mealApplicationCaseNumberTanf),
    mealApplicationChildStatuses: cleanArray(body.mealApplicationChildStatuses),
    mealApplicationAttendedThisCenter: clean(body.mealApplicationAttendedThisCenter),
    mealApplicationHeadStartPreK: clean(body.mealApplicationHeadStartPreK),
    mealApplicationChildIncome: clean(body.mealApplicationChildIncome),
    mealApplicationHouseholdMembers: clean(body.mealApplicationHouseholdMembers),
    mealApplicationAdultIncome: clean(body.mealApplicationAdultIncome),
    mealApplicationLastFourSsn: clean(body.mealApplicationLastFourSsn),
    mealApplicationNoSsn: cleanBool(body.mealApplicationNoSsn),
    mealApplicationEthnicity: clean(body.mealApplicationEthnicity),
    mealApplicationRace: clean(body.mealApplicationRace),
    mealApplicationSignatureName: clean(body.mealApplicationSignatureName),
    mealApplicationSignatureDate: clean(body.mealApplicationSignatureDate),
    policyAcknowledgment: cleanBool(body.policyAcknowledgment),
    eSignatureConsent: cleanBool(body.eSignatureConsent),
    signatureName: clean(body.signatureName),
    signatureDate: clean(body.signatureDate),
    pageUrl: clean(body.pageUrl),
  };
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validDate(value: string) {
  if (!value) return false;
  const timestamp = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(timestamp);
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function splitName(fullName: string) {
  const [firstName, ...rest] = fullName.split(/\s+/);
  return [firstName || fullName, rest.join(" ") || null] as const;
}

function requestKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const current = rateLimit.get(key);
  if (!current || current.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

function validationErrors(payload: RegistrationPayload) {
  const errors: Record<string, string> = {};
  if (!payload.centerId) errors.centerId = "School is required.";
  if (!payload.primaryGuardianName) errors.primaryGuardianName = "Primary guardian name is required.";
  if (!validEmail(payload.primaryGuardianEmail)) errors.primaryGuardianEmail = "A valid guardian email is required.";
  if (!payload.primaryGuardianPhone) errors.primaryGuardianPhone = "Guardian phone is required.";
  if (!payload.childFullName) errors.childFullName = "Child full name is required.";
  if (!validDate(payload.childDateOfBirth)) errors.childDateOfBirth = "Child date of birth is required.";
  if (!payload.program) errors.program = "Program is required.";
  if (!payload.schedule) errors.schedule = "Schedule is required.";
  if (!validDate(payload.desiredStartDate)) errors.desiredStartDate = "Desired start date is required.";
  if (!payload.emergencyContacts) errors.emergencyContacts = "At least one emergency contact is required.";
  if (!payload.authorizedPickups) errors.authorizedPickups = "At least one authorized pickup is required.";
  if (!payload.policyAcknowledgment) errors.policyAcknowledgment = "Policy acknowledgment is required.";
  if (!payload.signatureName) errors.signatureName = "Typed signature is required.";
  return errors;
}

function existingCustomFields(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function POSTHandler(request: NextRequest) {
  if (!checkRateLimit(requestKey(request))) {
    return NextResponse.json({ ok: false, error: "Too many registration attempts. Please try again shortly." }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid registration payload." }, { status: 400 });
    }

    const payload = readPayload(body);
    const errors = validationErrors(payload);
    if (Object.keys(errors).length) {
      return NextResponse.json({ ok: false, error: "Required registration fields are missing.", errors }, { status: 400 });
    }

    const center = await prisma.center.findFirst({
      where: { id: payload.centerId, status: { not: "closed" } },
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        email: true,
        city: true,
        state: true,
        organization: { select: { tenantId: true } },
      },
    });
    if (!center) {
      return NextResponse.json({ ok: false, error: "Selected school is not available for online registration." }, { status: 404 });
    }

    const [parentFirstName, parentLastName] = splitName(payload.primaryGuardianName);
    const existingLead = await prisma.lead.findFirst({
      where: {
        centerId: center.id,
        email: payload.primaryGuardianEmail,
        status: { not: "lost" },
      },
      orderBy: { updatedAt: "desc" },
    });

    const nextStage = existingLead && stageRank[existingLead.stage] > stageRank.APPLICATION_SUBMITTED
      ? existingLead.stage
      : EnrollmentStage.APPLICATION_SUBMITTED;

    const leadData = {
      familyName: payload.primaryGuardianName,
      parentFirstName,
      parentLastName,
      email: payload.primaryGuardianEmail,
      phone: payload.primaryGuardianPhone,
      childName: payload.childFullName,
      leadSource: "Online Registration",
      ageGroupInterest: payload.program,
      desiredStartDate: toDate(payload.desiredStartDate),
      programInterest: payload.program,
      stage: nextStage,
      score: 90,
      status: "open",
      customFields: {
        ...existingCustomFields(existingLead?.customFields),
        intakeType: "online_registration",
        registrationStatus: "submitted",
        schoolName: center.name,
        crmLocationId: center.crmLocationId,
        childPreferredName: payload.childPreferredName,
        childDateOfBirth: payload.childDateOfBirth,
        childSex: payload.childSex,
        childPrimaryLanguage: payload.childPrimaryLanguage,
        childLivesWith: payload.childLivesWith,
        previousCareProgram: payload.previousCareProgram,
        schedule: payload.schedule,
        scheduleDays: payload.scheduleDays,
        primaryGuardianAddress: payload.primaryGuardianAddress,
        primaryGuardianRelation: payload.primaryGuardianRelation,
        primaryGuardianEmployer: payload.primaryGuardianEmployer,
        primaryGuardianWorkPhone: payload.primaryGuardianWorkPhone,
        secondaryGuardianName: payload.secondaryGuardianName,
        secondaryGuardianEmail: payload.secondaryGuardianEmail,
        secondaryGuardianPhone: payload.secondaryGuardianPhone,
        secondaryGuardianRelation: payload.secondaryGuardianRelation,
        secondaryGuardianEmployer: payload.secondaryGuardianEmployer,
        secondaryGuardianAddress: payload.secondaryGuardianAddress,
        billingContactName: payload.billingContactName,
        billingContactEmail: payload.billingContactEmail,
        billingContactPhone: payload.billingContactPhone,
        allergies: payload.allergies,
        allergyActionPlan: payload.allergyActionPlan,
        medications: payload.medications,
        medicationAuthorizationNeeded: payload.medicationAuthorizationNeeded,
        dietaryRestrictions: payload.dietaryRestrictions,
        medicalNotes: payload.medicalNotes,
        emergencyContacts: payload.emergencyContacts,
        authorizedPickups: payload.authorizedPickups,
        restrictedPickups: payload.restrictedPickups,
        custodyNotes: payload.custodyNotes,
        physicianInfo: payload.physicianInfo,
        physicianPhone: payload.physicianPhone,
        dentistInfo: payload.dentistInfo,
        insuranceInfo: payload.insuranceInfo,
        hospitalPreference: payload.hospitalPreference,
        immunizationStatus: payload.immunizationStatus,
        photoVideoPermission: payload.photoVideoPermission,
        fieldTripPermission: payload.fieldTripPermission,
        transportationPermission: payload.transportationPermission,
        sunscreenPermission: payload.sunscreenPermission,
        waterActivityPermission: payload.waterActivityPermission,
        emergencyMedicalPermission: payload.emergencyMedicalPermission,
        foodProgramPermission: payload.foodProgramPermission,
        handbookAcknowledgment: payload.handbookAcknowledgment,
        tuitionPolicyAcknowledgment: payload.tuitionPolicyAcknowledgment,
        disciplinePolicyAcknowledgment: payload.disciplinePolicyAcknowledgment,
        healthPolicyAcknowledgment: payload.healthPolicyAcknowledgment,
        pageUrl: payload.pageUrl,
        submittedAt: new Date().toISOString(),
        kidCityFloridaMarch2026Packet: {
          childAddress: payload.childAddress,
          siblingNamesAges: payload.siblingNamesAges,
          childProfile: {
            dayStructure: payload.dayStructure,
            feedsSelf: payload.feedsSelf,
            napSchedule: payload.napSchedule,
            nightSleepSchedule: payload.nightSleepSchedule,
            developmentSkills: payload.developmentSkills,
            toiletingStatus: payload.toiletingStatus,
            goalsExpectations: payload.goalsExpectations,
          },
          medicalCarePlan: {
            specialNeedsNotes: payload.specialNeedsNotes,
            medicalConditions: payload.medicalConditions,
            medicalConditionOther: payload.medicalConditionOther,
            allergyReactionSymptoms: payload.allergyReactionSymptoms,
            allergyPreventativeMeasures: payload.allergyPreventativeMeasures,
            allergyExposureResponse: payload.allergyExposureResponse,
            emergencyMedicationInstructions: payload.emergencyMedicationInstructions,
            emergencyCarePlanContacts: payload.emergencyCarePlanContacts,
            dentistPhone: payload.dentistPhone,
            insuranceCompany: payload.insuranceCompany,
            insurancePolicyNumber: payload.insurancePolicyNumber,
            immunizationExpirationDate: payload.immunizationExpirationDate,
            physicalExpirationDate: payload.physicalExpirationDate,
            elc4cExpirationDate: payload.elc4cExpirationDate,
          },
          permissions: {
            photoVideoReleaseChoice: payload.photoVideoReleaseChoice,
            firstAidEmergencyConsent: payload.firstAidEmergencyConsent,
            floridaKnowYourChildcareAcknowledgment: payload.floridaKnowYourChildcareAcknowledgment,
            floridaDistractedAdultAcknowledgment: payload.floridaDistractedAdultAcknowledgment,
            dcfInspectionAccessAcknowledgment: payload.dcfInspectionAccessAcknowledgment,
            physicalImmunizationThirtyDayAcknowledgment: payload.physicalImmunizationThirtyDayAcknowledgment,
            nutritionPolicyAcknowledgment: payload.nutritionPolicyAcknowledgment,
            foodActivityPermission: payload.foodActivityPermission,
            foodActivityAllergyChoice: payload.foodActivityAllergyChoice,
          },
          uniformOrder: {
            blackQuantity: payload.uniformBlackQuantity,
            blackSize: payload.uniformBlackSize,
            yellowQuantity: payload.uniformYellowQuantity,
            yellowSize: payload.uniformYellowSize,
            paymentChoice: payload.uniformPaymentChoice,
            paymentAmount: payload.uniformPaymentAmount,
          },
          mealBenefitApplication: {
            requested: payload.mealBenefitApplicationNeeded,
            childStatuses: payload.mealApplicationChildStatuses,
            attendedThisCenter: payload.mealApplicationAttendedThisCenter,
            headStartPreK: payload.mealApplicationHeadStartPreK,
            householdMembersProvided: Boolean(payload.mealApplicationHouseholdMembers),
            adultIncomeProvided: Boolean(payload.mealApplicationAdultIncome),
            noSsn: payload.mealApplicationNoSsn,
          },
          financialAgreementInitialsCaptured: [
            payload.financialAgreementPaymentFeesInitials,
            payload.financialAgreementAbsenteePolicyInitials,
            payload.financialAgreementRegistrationFeeInitials,
            payload.financialAgreementReturnedPaymentInitials,
            payload.financialAgreementDischargeInitials,
            payload.financialAgreementWithdrawalInitials,
            payload.financialAgreementLatePickupInitials,
            payload.financialAgreementCollectionInitials,
            payload.financialAgreementUniformInitials,
            payload.financialAgreementFinalTermsInitials,
          ].filter(Boolean).length,
        },
      },
    };

    const lead = existingLead
      ? await prisma.lead.update({
          where: { id: existingLead.id },
          data: leadData,
          select: { id: true, stage: true },
        })
      : await prisma.lead.create({
          data: {
            centerId: center.id,
            externalId: `online-registration:${center.id}:${Date.now()}:${payload.primaryGuardianEmail}`,
            ...leadData,
          },
          select: { id: true, stage: true },
        });

    const form = await prisma.form.upsert({
      where: { id: "online-registration-packet" },
      update: { name: "Kid City USA Online Registration Packet", type: "online_registration", schema: kidCityRegistrationPacketSchema(), status: "active" },
      create: { id: "online-registration-packet", name: "Kid City USA Online Registration Packet", type: "online_registration", schema: kidCityRegistrationPacketSchema(), status: "active" },
    });

    const submission = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        status: DocumentStatus.SUBMITTED,
        signaturePlaceholder: true,
        submittedAt: new Date(),
        data: {
          ...payload,
          centerName: center.name,
          crmLocationId: center.crmLocationId,
          city: center.city,
          state: center.state,
          leadId: lead.id,
          registrationReview: {
            status: "submitted",
            submittedAt: new Date().toISOString(),
          },
        },
      },
      select: { id: true },
    });

    await Promise.all([
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          customFields: {
            ...leadData.customFields,
            registrationSubmissionId: submission.id,
          },
        },
      }),
      prisma.task.create({
        data: {
          leadId: lead.id,
          title: `Review online registration packet for ${payload.childFullName}`,
          status: "open",
          dueAt: addDays(1),
        },
      }),
      prisma.note.create({
        data: {
          leadId: lead.id,
          restricted: true,
          body: `Online registration submitted for ${payload.childFullName}. Emergency contacts, authorized pickups, medical, and custody details require director review before moving into the live family profile.`,
        },
      }),
    ]);

    const directors = await getCenterLeadershipUsers({
      centerId: center.id,
      roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN],
    });

    if (directors.length) {
      await prisma.notification.createMany({
        data: directors.map((director) => ({
          userId: director.id,
          title: "Online registration submitted",
          body: `${payload.primaryGuardianName} submitted a packet for ${payload.childFullName}.`,
          type: "online_registration",
          priority: "high",
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: center.organization.tenantId,
        centerId: center.id,
        action: "registration.submitted",
        resource: "FormSubmission",
        resourceId: submission.id,
        metadata: {
          leadId: lead.id,
          stage: lead.stage,
          public: true,
        },
      },
    });

    const recipients = uniqueEmails([
      center.email ?? "",
      ...(process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",") ?? []),
    ]);
    const email = await sendEmail({
      to: recipients,
      replyTo: payload.primaryGuardianEmail,
      subject: `New Online Registration - ${payload.program} - ${center.crmLocationId ?? center.name}`,
      text: [
        `School: ${center.name}`,
        `Location ID: ${center.crmLocationId ?? ""}`,
        `Parent: ${payload.primaryGuardianName}`,
        `Email: ${payload.primaryGuardianEmail}`,
        `Phone: ${payload.primaryGuardianPhone}`,
        `Child: ${payload.childFullName}`,
        `Program: ${payload.program}`,
        `Schedule: ${payload.schedule}`,
        `Desired start date: ${payload.desiredStartDate}`,
        `BEE Suite Lead ID: ${lead.id}`,
        `Registration Submission ID: ${submission.id}`,
      ].join("\n"),
      categories: ["registration_email"],
      customArgs: { leadId: lead.id, centerId: center.id, submissionId: submission.id },
      tenantId: center.organization.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      leadId: lead.id,
      purpose: "registration_email",
      to: recipients,
      replyTo: payload.primaryGuardianEmail,
      subject: `New Online Registration - ${payload.program} - ${center.crmLocationId ?? center.name}`,
      text: [
        `School: ${center.name}`,
        `Location ID: ${center.crmLocationId ?? ""}`,
        `Parent: ${payload.primaryGuardianName}`,
        `Email: ${payload.primaryGuardianEmail}`,
        `Phone: ${payload.primaryGuardianPhone}`,
        `Child: ${payload.childFullName}`,
        `Program: ${payload.program}`,
        `Schedule: ${payload.schedule}`,
        `Desired start date: ${payload.desiredStartDate}`,
        `BEE Suite Lead ID: ${lead.id}`,
        `Registration Submission ID: ${submission.id}`,
      ].join("\n"),
      result: email,
      metadata: { submissionId: submission.id },
    });

    return NextResponse.json(
      {
        ok: true,
        leadId: lead.id,
        submissionId: submission.id,
        integrations: { email },
      },
      { status: 201 },
    );
  } catch (error) {
    logOperationalError("registration.submit_failed", error);
    return NextResponse.json({ ok: false, error: "Registration could not be submitted. Please try again or contact the school." }, { status: 500 });
  }
}

export const POST = withApiLogging("POST", POSTHandler);
