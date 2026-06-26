import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, EnrollmentStage, PaymentStatus, Prisma } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { buildParentPortalSetupUrl, getParentPortalDefaultPassword, PARENT_PORTAL_INVITE_MODE } from "@/lib/parent-portal-invitations";
import { ensureParentPortalLoginForGuardian } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import {
  asRecord,
  buildEnrollmentChecklist,
  buildRegistrationDocumentRequests,
  cleanText,
  familyNameFromGuardian,
  normalizeEmailText,
  parsePacketContactLines,
  type RegistrationPacketPayload,
} from "@/lib/registration-packet";
import {
  formatRegistrationPaymentAmount,
  normalizeRegistrationPaymentPlan,
  registrationInvoiceExternalId,
  registrationInvoiceNumber,
  registrationLedgerExternalId,
  type RegistrationPaymentStatus,
} from "@/lib/registration-billing";
import { getAppBaseUrl } from "@/lib/supabase-auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReviewAction = "APPROVED" | "REJECTED";

function reviewAction(value: unknown): ReviewAction | null {
  const normalized = cleanText(value).toUpperCase();
  if (normalized === "APPROVED" || normalized === "APPROVE") return "APPROVED";
  if (normalized === "REJECTED" || normalized === "REJECT") return "REJECTED";
  return null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function nullable(value: string) {
  return value || null;
}

function dateFromPacket(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function inputJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return stripUndefined(value) as Prisma.InputJsonObject;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]),
  );
}

function packetFromSubmission(data: unknown): RegistrationPacketPayload & { leadId: string } {
  const record = asRecord(data);
  return {
    centerId: cleanText(record.centerId),
    primaryGuardianName: cleanText(record.primaryGuardianName),
    primaryGuardianEmail: normalizeEmailText(record.primaryGuardianEmail),
    primaryGuardianPhone: cleanText(record.primaryGuardianPhone),
    primaryGuardianAddress: cleanText(record.primaryGuardianAddress),
    primaryGuardianRelation: cleanText(record.primaryGuardianRelation),
    primaryGuardianEmployer: cleanText(record.primaryGuardianEmployer),
    primaryGuardianHomePhone: cleanText(record.primaryGuardianHomePhone),
    primaryGuardianWorkPhone: cleanText(record.primaryGuardianWorkPhone),
    primaryGuardianCellPhoneCarrier: cleanText(record.primaryGuardianCellPhoneCarrier),
    primaryGuardianDriverLicense: cleanText(record.primaryGuardianDriverLicense),
    primaryGuardianSocialSecurityNumber: cleanText(record.primaryGuardianSocialSecurityNumber),
    secondaryGuardianName: cleanText(record.secondaryGuardianName),
    secondaryGuardianEmail: normalizeEmailText(record.secondaryGuardianEmail),
    secondaryGuardianPhone: cleanText(record.secondaryGuardianPhone),
    secondaryGuardianRelation: cleanText(record.secondaryGuardianRelation),
    secondaryGuardianEmployer: cleanText(record.secondaryGuardianEmployer),
    secondaryGuardianAddress: cleanText(record.secondaryGuardianAddress),
    secondaryGuardianHomePhone: cleanText(record.secondaryGuardianHomePhone),
    secondaryGuardianWorkPhone: cleanText(record.secondaryGuardianWorkPhone),
    secondaryGuardianCellPhoneCarrier: cleanText(record.secondaryGuardianCellPhoneCarrier),
    secondaryGuardianDriverLicense: cleanText(record.secondaryGuardianDriverLicense),
    secondaryGuardianSocialSecurityNumber: cleanText(record.secondaryGuardianSocialSecurityNumber),
    billingContactName: cleanText(record.billingContactName),
    billingContactEmail: normalizeEmailText(record.billingContactEmail),
    billingContactPhone: cleanText(record.billingContactPhone),
    childFullName: cleanText(record.childFullName),
    childPreferredName: cleanText(record.childPreferredName),
    childDateOfBirth: cleanText(record.childDateOfBirth),
    childSex: cleanText(record.childSex),
    childAddress: cleanText(record.childAddress),
    childPrimaryLanguage: cleanText(record.childPrimaryLanguage),
    childLivesWith: cleanText(record.childLivesWith),
    previousCareProgram: cleanText(record.previousCareProgram),
    siblingNamesAges: cleanText(record.siblingNamesAges),
    dayStructure: cleanText(record.dayStructure),
    newSituationNotes: cleanText(record.newSituationNotes),
    appetiteNotes: cleanText(record.appetiteNotes),
    feedsSelf: cleanText(record.feedsSelf),
    foodLikes: cleanText(record.foodLikes),
    foodDislikes: cleanText(record.foodDislikes),
    napSchedule: cleanText(record.napSchedule),
    nightSleepSchedule: cleanText(record.nightSleepSchedule),
    sleepItems: cleanText(record.sleepItems),
    napHints: cleanText(record.napHints),
    favoriteActivities: cleanText(record.favoriteActivities),
    developmentSkills: Array.isArray(record.developmentSkills) ? record.developmentSkills.map(cleanText).filter(Boolean) : [],
    toiletingStatus: cleanText(record.toiletingStatus),
    bathroomRequest: cleanText(record.bathroomRequest),
    bathroomHelpNeeded: cleanText(record.bathroomHelpNeeded),
    toiletingRoutine: cleanText(record.toiletingRoutine),
    goalsExpectations: cleanText(record.goalsExpectations),
    friendsAtCenter: cleanText(record.friendsAtCenter),
    childPersonality: cleanText(record.childPersonality),
    otherHelpfulInfo: cleanText(record.otherHelpfulInfo),
    participationInterests: Array.isArray(record.participationInterests) ? record.participationInterests.map(cleanText).filter(Boolean) : [],
    participationOther: cleanText(record.participationOther),
    program: cleanText(record.program),
    schedule: cleanText(record.schedule),
    scheduleDays: Array.isArray(record.scheduleDays) ? record.scheduleDays.map(cleanText).filter(Boolean) : [],
    desiredStartDate: cleanText(record.desiredStartDate),
    specialNeedsNotes: cleanText(record.specialNeedsNotes),
    medicalConditions: Array.isArray(record.medicalConditions) ? record.medicalConditions.map(cleanText).filter(Boolean) : [],
    medicalConditionOther: cleanText(record.medicalConditionOther),
    allergies: cleanText(record.allergies),
    allergyActionPlan: cleanText(record.allergyActionPlan),
    allergyReactionSymptoms: cleanText(record.allergyReactionSymptoms),
    allergyPreventativeMeasures: cleanText(record.allergyPreventativeMeasures),
    allergyExposureResponse: cleanText(record.allergyExposureResponse),
    emergencyMedicationInstructions: cleanText(record.emergencyMedicationInstructions),
    emergencyCarePlanContacts: cleanText(record.emergencyCarePlanContacts),
    medications: cleanText(record.medications),
    medicationAuthorizationNeeded: record.medicationAuthorizationNeeded === true,
    dietaryRestrictions: cleanText(record.dietaryRestrictions),
    physicianInfo: cleanText(record.physicianInfo),
    physicianPhone: cleanText(record.physicianPhone),
    dentistInfo: cleanText(record.dentistInfo),
    dentistPhone: cleanText(record.dentistPhone),
    insuranceInfo: cleanText(record.insuranceInfo),
    insuranceCompany: cleanText(record.insuranceCompany),
    insurancePolicyNumber: cleanText(record.insurancePolicyNumber),
    hospitalPreference: cleanText(record.hospitalPreference),
    immunizationStatus: cleanText(record.immunizationStatus),
    immunizationExpirationDate: cleanText(record.immunizationExpirationDate),
    physicalExpirationDate: cleanText(record.physicalExpirationDate),
    elc4cExpirationDate: cleanText(record.elc4cExpirationDate),
    medicalNotes: cleanText(record.medicalNotes),
    emergencyContacts: cleanText(record.emergencyContacts),
    authorizedPickups: cleanText(record.authorizedPickups),
    restrictedPickups: cleanText(record.restrictedPickups),
    custodyNotes: cleanText(record.custodyNotes),
    photoVideoReleaseChoice: cleanText(record.photoVideoReleaseChoice),
    photoVideoPermission: record.photoVideoPermission === true,
    fieldTripPermission: record.fieldTripPermission === true,
    transportationPermission: record.transportationPermission === true,
    sunscreenPermission: record.sunscreenPermission === true,
    waterActivityPermission: record.waterActivityPermission === true,
    emergencyMedicalPermission: record.emergencyMedicalPermission === true,
    firstAidEmergencyConsent: record.firstAidEmergencyConsent === true,
    floridaKnowYourChildcareAcknowledgment: record.floridaKnowYourChildcareAcknowledgment === true,
    floridaDistractedAdultAcknowledgment: record.floridaDistractedAdultAcknowledgment === true,
    dcfInspectionAccessAcknowledgment: record.dcfInspectionAccessAcknowledgment === true,
    physicalImmunizationThirtyDayAcknowledgment: record.physicalImmunizationThirtyDayAcknowledgment === true,
    foodProgramPermission: record.foodProgramPermission === true,
    foodActivityPermission: cleanText(record.foodActivityPermission),
    foodActivityAllergyChoice: cleanText(record.foodActivityAllergyChoice),
    foodActivityRestrictedItems: cleanText(record.foodActivityRestrictedItems),
    uniformBlackQuantity: cleanText(record.uniformBlackQuantity),
    uniformBlackSize: cleanText(record.uniformBlackSize),
    uniformYellowQuantity: cleanText(record.uniformYellowQuantity),
    uniformYellowSize: cleanText(record.uniformYellowSize),
    uniformPaymentChoice: cleanText(record.uniformPaymentChoice),
    uniformPaymentAmount: cleanText(record.uniformPaymentAmount),
    uniformComments: cleanText(record.uniformComments),
    handbookAcknowledgment: record.handbookAcknowledgment === true,
    emergencyProceduresAcknowledgment: record.emergencyProceduresAcknowledgment === true,
    tuitionPolicyAcknowledgment: record.tuitionPolicyAcknowledgment === true,
    disciplinePolicyAcknowledgment: record.disciplinePolicyAcknowledgment === true,
    expulsionPolicyAcknowledgment: record.expulsionPolicyAcknowledgment === true,
    mandatoryReportingAcknowledgment: record.mandatoryReportingAcknowledgment === true,
    healthPolicyAcknowledgment: record.healthPolicyAcknowledgment === true,
    nutritionPolicyAcknowledgment: record.nutritionPolicyAcknowledgment === true,
    collectionResponsibilityAcknowledgment: record.collectionResponsibilityAcknowledgment === true,
    financialAgreementPaymentFeesInitials: cleanText(record.financialAgreementPaymentFeesInitials),
    financialAgreementAbsenteePolicyInitials: cleanText(record.financialAgreementAbsenteePolicyInitials),
    financialAgreementRegistrationFeeInitials: cleanText(record.financialAgreementRegistrationFeeInitials),
    financialAgreementReturnedPaymentInitials: cleanText(record.financialAgreementReturnedPaymentInitials),
    financialAgreementDischargeInitials: cleanText(record.financialAgreementDischargeInitials),
    financialAgreementWithdrawalInitials: cleanText(record.financialAgreementWithdrawalInitials),
    financialAgreementLatePickupInitials: cleanText(record.financialAgreementLatePickupInitials),
    financialAgreementCollectionInitials: cleanText(record.financialAgreementCollectionInitials),
    financialAgreementUniformInitials: cleanText(record.financialAgreementUniformInitials),
    financialAgreementFinalTermsInitials: cleanText(record.financialAgreementFinalTermsInitials),
    mealBenefitApplicationNeeded: record.mealBenefitApplicationNeeded === true,
    mealApplicationCaseNumberSnap: cleanText(record.mealApplicationCaseNumberSnap),
    mealApplicationCaseNumberTanf: cleanText(record.mealApplicationCaseNumberTanf),
    mealApplicationChildStatuses: Array.isArray(record.mealApplicationChildStatuses) ? record.mealApplicationChildStatuses.map(cleanText).filter(Boolean) : [],
    mealApplicationAttendedThisCenter: cleanText(record.mealApplicationAttendedThisCenter),
    mealApplicationHeadStartPreK: cleanText(record.mealApplicationHeadStartPreK),
    mealApplicationChildIncome: cleanText(record.mealApplicationChildIncome),
    mealApplicationHouseholdMembers: cleanText(record.mealApplicationHouseholdMembers),
    mealApplicationAdultIncome: cleanText(record.mealApplicationAdultIncome),
    mealApplicationLastFourSsn: cleanText(record.mealApplicationLastFourSsn),
    mealApplicationNoSsn: record.mealApplicationNoSsn === true,
    mealApplicationEthnicity: cleanText(record.mealApplicationEthnicity),
    mealApplicationRace: cleanText(record.mealApplicationRace),
    mealApplicationSignatureName: cleanText(record.mealApplicationSignatureName),
    mealApplicationSignatureDate: cleanText(record.mealApplicationSignatureDate),
    policyAcknowledgment: record.policyAcknowledgment === true,
    eSignatureConsent: record.eSignatureConsent === true,
    signatureName: cleanText(record.signatureName),
    signatureDate: cleanText(record.signatureDate),
    pageUrl: cleanText(record.pageUrl),
    leadId: cleanText(record.leadId),
  };
}

function mergedSubmissionData(data: unknown, updates: Record<string, unknown>) {
  return inputJson({
    ...asRecord(data),
    ...updates,
  });
}

function customFields(value: unknown, updates: Record<string, unknown>) {
  return inputJson({
    ...asRecord(value),
    ...updates,
  });
}

function registrationPaymentStatus(input: {
  required: boolean;
  status: RegistrationPaymentStatus["status"];
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  dueDate?: Date | string | null;
  registrationFeeCents: number;
  depositCents: number;
  totalCents: number;
}): RegistrationPaymentStatus {
  return {
    required: input.required,
    status: input.status,
    invoiceId: input.invoiceId ?? null,
    invoiceNumber: input.invoiceNumber ?? null,
    dueDate: input.dueDate instanceof Date ? input.dueDate.toISOString() : input.dueDate ?? null,
    registrationFeeCents: input.registrationFeeCents,
    depositCents: input.depositCents,
    totalCents: input.totalCents,
  };
}

async function ensureRegistrationPaymentInvoice(
  tx: Prisma.TransactionClient,
  input: {
    familyId: string;
    childId: string;
    enrollmentId: string;
    leadId: string | null;
    submissionId: string;
    reviewedAt: Date;
    paymentPlan: ReturnType<typeof normalizeRegistrationPaymentPlan>;
  },
): Promise<RegistrationPaymentStatus> {
  if (!input.paymentPlan.required) {
    return registrationPaymentStatus({
      required: false,
      status: "not_required",
      registrationFeeCents: 0,
      depositCents: 0,
      totalCents: 0,
    });
  }

  const billingAccount = await tx.billingAccount.upsert({
    where: { familyId: input.familyId },
    update: {},
    create: {
      familyId: input.familyId,
      balanceCents: 0,
      sourceSystem: "bee_suite_registration",
      externalId: `registration:${input.submissionId}:billing`,
      customFields: inputJson({
        registrationSubmissionId: input.submissionId,
        registrationPaymentRequired: true,
      }),
    },
  });

  const externalId = registrationInvoiceExternalId(input.submissionId);
  const existingInvoice = await tx.invoice.findFirst({
    where: {
      sourceSystem: "bee_suite_registration",
      externalId,
    },
    select: { id: true, number: true, status: true, dueDate: true, totalCents: true },
  });
  if (existingInvoice) {
    return registrationPaymentStatus({
      required: true,
      status: existingInvoice.status === PaymentStatus.PAID ? "paid" : "invoice_open",
      invoiceId: existingInvoice.id,
      invoiceNumber: existingInvoice.number,
      dueDate: existingInvoice.dueDate,
      registrationFeeCents: input.paymentPlan.registrationFeeCents,
      depositCents: input.paymentPlan.depositCents,
      totalCents: existingInvoice.totalCents,
    });
  }

  const dueDate = new Date(input.reviewedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const invoiceItems = [
    input.paymentPlan.registrationFeeCents > 0
      ? { description: "Registration fee", amountCents: input.paymentPlan.registrationFeeCents }
      : null,
    input.paymentPlan.depositCents > 0
      ? { description: "Enrollment deposit", amountCents: input.paymentPlan.depositCents }
      : null,
  ].filter((item): item is { description: string; amountCents: number } => Boolean(item));
  const paymentMetadata = {
    kind: "registration_fee_deposit",
    checkoutPurpose: "registration_fee_deposit",
    registrationSubmissionId: input.submissionId,
    familyId: input.familyId,
    childId: input.childId,
    enrollmentId: input.enrollmentId,
    leadId: input.leadId,
    registrationFeeCents: input.paymentPlan.registrationFeeCents,
    depositCents: input.paymentPlan.depositCents,
    totalCents: input.paymentPlan.totalCents,
    status: "invoice_open",
  };

  const invoice = await tx.invoice.create({
    data: {
      billingAccountId: billingAccount.id,
      number: registrationInvoiceNumber(input.submissionId),
      status: PaymentStatus.OPEN,
      dueDate,
      totalCents: input.paymentPlan.totalCents,
      sourceSystem: "bee_suite_registration",
      externalId,
      customFields: inputJson(paymentMetadata),
      items: {
        create: invoiceItems,
      },
    },
    select: { id: true, number: true, dueDate: true },
  });

  const ledgerExternalId = registrationLedgerExternalId(input.submissionId);
  const existingLedger = await tx.ledgerEntry.findFirst({
    where: { sourceSystem: "bee_suite_registration", externalId: ledgerExternalId },
    select: { id: true },
  });
  if (!existingLedger) {
    const updatedAccount = await tx.billingAccount.update({
      where: { id: billingAccount.id },
      data: { balanceCents: { increment: input.paymentPlan.totalCents } },
    });
    await tx.ledgerEntry.create({
      data: {
        billingAccountId: billingAccount.id,
        invoiceId: invoice.id,
        type: "invoice",
        description: "Registration fee/deposit",
        amountCents: input.paymentPlan.totalCents,
        balanceAfterCents: updatedAccount.balanceCents,
        sourceSystem: "bee_suite_registration",
        externalId: ledgerExternalId,
        metadata: inputJson({
          ...paymentMetadata,
          invoiceId: invoice.id,
        }),
      },
    });
  }

  return registrationPaymentStatus({
    required: true,
    status: "invoice_open",
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    dueDate: invoice.dueDate,
    registrationFeeCents: input.paymentPlan.registrationFeeCents,
    depositCents: input.paymentPlan.depositCents,
    totalCents: input.paymentPlan.totalCents,
  });
}

async function createParentPortalInvite(input: {
  requestUrl: string;
  user: CurrentUser;
  center: {
    id: string;
    name: string;
    crmLocationId: string | null;
    organizationId: string;
    organization: { tenantId: string };
  };
  family: { id: string; name: string };
  guardian: { id: string; fullName: string; email: string | null; customFields: unknown };
  registrationPayment?: RegistrationPaymentStatus;
}) {
  const email = normalizeEmailText(input.guardian.email);
  if (!validEmail(email)) {
    return { ok: false, error: "Primary guardian email is not valid.", emailSent: false, passwordResetSent: false, defaultPasswordSet: false };
  }
  const defaultPassword = getParentPortalDefaultPassword();
  if (defaultPassword.length < 8) {
    return {
      ok: false,
      error: "Parent portal default password is not configured.",
      emailSent: false,
      passwordResetSent: false,
      defaultPasswordSet: false,
    };
  }

  try {
    const appBaseUrl = getAppBaseUrl(input.requestUrl);
    const parentPortal = await ensureParentPortalLoginForGuardian({
      guardianId: input.guardian.id,
      linkedBy: input.user.email,
      linkedReason: "registration_approval",
      registrationApproval: true,
    });
    if (!parentPortal.ok) {
      return {
        ok: false,
        error: parentPortal.reason,
        emailSent: false,
        passwordResetSent: false,
        defaultPasswordSet: false,
      };
    }
    const defaultPasswordSet = parentPortal.defaultPasswordSet;

    const portalUrl = buildParentPortalSetupUrl(appBaseUrl);
    const paymentLine = input.registrationPayment?.required
      ? `A registration fee/deposit invoice for ${formatRegistrationPaymentAmount(input.registrationPayment.totalCents)} is ready in the parent portal for secure checkout.`
      : "";
    const text = [
      `Hi ${input.guardian.fullName},`,
      "",
      `Your registration application for ${input.center.crmLocationId ?? input.center.name} was approved for the next enrollment steps.`,
      `Use ${email} as your login email.`,
      `Use ${defaultPassword} as your default password if you have not changed it yet.`,
      "Your approved child records and school connections are already linked in the portal.",
      `Confirm your family portal information and check-in PIN: ${portalUrl}`,
      "You do not have to choose a new password, but you can set one any time from Profile settings after you sign in.",
      paymentLine || null,
      "",
      "The school may still need uploaded documents, signatures, tuition/deposit setup, classroom assignment, and start-date confirmation before final enrollment.",
    ].filter((line): line is string => line !== null).join("\n");
    const emailCopy = await sendEmail({
      to: [email],
      subject: "Kid City USA registration next steps",
      text,
      fromName: "Kid City USA",
      categories: ["parent_invitation_email"],
      customArgs: { guardianId: input.guardian.id, familyId: input.family.id, centerId: input.center.id },
      tenantId: input.user.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: input.user.tenantId,
      centerId: input.center.id,
      purpose: "parent_invitation_email",
      to: [email],
      subject: "Kid City USA registration next steps",
      text,
      fromName: "Kid City USA",
      result: emailCopy,
      metadata: { guardianId: input.guardian.id, familyId: input.family.id, registrationApproval: true },
    });

    await writeAuditLog(input.user, {
      centerId: input.center.id,
      action: "registration.parent_portal_invited",
      resource: "Guardian",
      resourceId: input.guardian.id,
      metadata: {
        familyId: input.family.id,
        parentUserId: parentPortal.userId,
        linkedGuardianIds: parentPortal.linkedGuardianIds,
        email,
        authMode: PARENT_PORTAL_INVITE_MODE,
        defaultPasswordSet,
        emailCopySent: emailCopy.ok,
      },
    });

    if (!emailCopy.ok) {
      return {
        ok: false,
        error: emailCopy.error || "The parent portal user was linked, but the login email could not be sent.",
        emailSent: false,
        passwordResetSent: false,
        defaultPasswordSet,
      };
    }

    return { ok: true, emailSent: true, passwordResetSent: false, defaultPasswordSet, parentUserId: parentPortal.userId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Parent portal invite failed.",
      emailSent: false,
      passwordResetSent: false,
      defaultPasswordSet: false,
    };
  }
}

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  const actor = user;
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Registration review is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = reviewAction(body.status || body.action);
  const note = cleanText(body.note);
  const inviteParent = body.inviteParent !== false;
  if (!action) {
    return NextResponse.json({ ok: false, error: "Review status must be approved or rejected." }, { status: 400 });
  }

  const submission = await prisma.formSubmission.findUnique({
    where: { id },
    include: { form: { select: { id: true, name: true, type: true } } },
  });
  if (!submission) {
    return NextResponse.json({ ok: false, error: "Registration submission not found." }, { status: 404 });
  }
  if (submission.form.type !== "online_registration") {
    return NextResponse.json({ ok: false, error: "This form submission is not an online registration packet." }, { status: 400 });
  }
  const submissionId = submission.id;

  const packet = packetFromSubmission(submission.data);
  const childDateOfBirth = dateFromPacket(packet.childDateOfBirth);
  const desiredStartDate = dateFromPacket(packet.desiredStartDate);
  if (!packet.centerId || !packet.primaryGuardianName || !packet.primaryGuardianEmail || !packet.childFullName || !childDateOfBirth) {
    return NextResponse.json({ ok: false, error: "Registration packet is missing required family or child fields." }, { status: 400 });
  }

  const center = await prisma.center.findUnique({
    where: { id: packet.centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      email: true,
      organizationId: true,
      customFields: true,
      organization: { select: { tenantId: true } },
      _count: { select: { classrooms: true } },
    },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Registration center was not found." }, { status: 404 });
  }
  if (!canAccessAllCenters(user) && !canAccessCenter(user, center.id)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this registration packet." }, { status: 403 });
  }

  if (action === "REJECTED") {
    const reviewedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const nextSubmission = await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          status: DocumentStatus.REJECTED,
          data: mergedSubmissionData(submission.data, {
            registrationReview: {
              status: "rejected",
              reviewedAt: reviewedAt.toISOString(),
              reviewedBy: user.email,
              note,
            },
          }),
        },
      });

      const lead = packet.leadId
        ? await tx.lead.findFirst({
            where: { id: packet.leadId, centerId: center.id },
            select: { id: true, customFields: true },
          })
        : null;
      if (lead) {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            stage: EnrollmentStage.LOST_NOT_A_FIT,
            status: "lost",
            customFields: customFields(lead.customFields, {
              registrationStatus: "rejected",
              registrationReviewNote: note,
              registrationReviewedAt: reviewedAt.toISOString(),
            }),
          },
        });
        await tx.note.create({
          data: {
            leadId: packet.leadId,
            userId: user.id,
            restricted: true,
            body: `Online registration rejected by ${user.name}.${note ? ` Review note: ${note}` : ""}`,
          },
        });
      }

      return nextSubmission;
    });

    const rejectionText = [
      `Hi ${packet.primaryGuardianName},`,
      "",
      `The school reviewed the registration application for ${packet.childFullName}. The application cannot be approved in The BEE Suite at this time.`,
      "Please contact the school director for the next step or any questions about availability and requirements.",
      note ? `Director note: ${note}` : "",
    ].filter(Boolean).join("\n");
    const email = await sendEmail({
      to: [packet.primaryGuardianEmail],
      replyTo: center.email,
      subject: "Kid City USA registration review update",
      text: rejectionText,
      fromName: "Kid City USA",
      categories: ["registration_email"],
      customArgs: { submissionId, centerId: center.id, leadId: packet.leadId },
      tenantId: center.organization.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      leadId: packet.leadId || null,
      purpose: "registration_email",
      to: [packet.primaryGuardianEmail],
      replyTo: center.email,
      subject: "Kid City USA registration review update",
      text: rejectionText,
      fromName: "Kid City USA",
      result: email,
      metadata: { submissionId, reviewStatus: "rejected" },
    });
    await writeAuditLog(user, {
      centerId: center.id,
      action: "registration.rejected",
      resource: "FormSubmission",
      resourceId: submissionId,
      metadata: { leadId: packet.leadId, hasReviewNote: Boolean(note), emailSent: email.ok },
    });

    return NextResponse.json({ ok: true, submission: updated, reviewStatus: "rejected", email });
  }

  const reviewedAt = new Date();
  const documentRequests = buildRegistrationDocumentRequests(packet);
  const paymentPlan = normalizeRegistrationPaymentPlan({
    customFields: center.customFields,
    defaultRegistrationFeeCents: process.env.REGISTRATION_FEE_CENTS,
    defaultDepositCents: process.env.REGISTRATION_DEPOSIT_CENTS,
  });
  const approval = await prisma.$transaction(async (tx) => {
    const familyMatch = await tx.family.findFirst({
      where: {
        centerId: center.id,
        OR: [
          { billingEmail: packet.primaryGuardianEmail },
          { guardians: { some: { email: packet.primaryGuardianEmail } } },
        ],
      },
      include: { guardians: true },
    });
    const family = familyMatch
      ? await tx.family.update({
          where: { id: familyMatch.id },
          data: {
            name: familyMatch.name || familyNameFromGuardian(packet.primaryGuardianName),
            address: nullable(packet.primaryGuardianAddress) ?? familyMatch.address,
            billingEmail: nullable(packet.billingContactEmail || packet.primaryGuardianEmail),
            custodyNotes: nullable(packet.custodyNotes || packet.restrictedPickups) ?? familyMatch.custodyNotes,
            sourceSystem: familyMatch.sourceSystem ?? "bee_suite_registration",
            customFields: customFields(familyMatch.customFields, {
              registrationSubmissionId: submissionId,
              registrationReviewedAt: reviewedAt.toISOString(),
              billingContactName: packet.billingContactName,
              billingContactPhone: packet.billingContactPhone,
              childAddress: packet.childAddress,
              siblingNamesAges: packet.siblingNamesAges,
              collectionResponsibilityAcknowledgment: packet.collectionResponsibilityAcknowledgment,
              mealBenefitApplication: {
                requested: packet.mealBenefitApplicationNeeded,
                caseNumberSnap: packet.mealApplicationCaseNumberSnap,
                caseNumberTanf: packet.mealApplicationCaseNumberTanf,
                childStatuses: packet.mealApplicationChildStatuses,
                householdMembers: packet.mealApplicationHouseholdMembers,
                adultIncome: packet.mealApplicationAdultIncome,
                noSsn: packet.mealApplicationNoSsn,
                ethnicity: packet.mealApplicationEthnicity,
                race: packet.mealApplicationRace,
                signatureName: packet.mealApplicationSignatureName,
                signatureDate: packet.mealApplicationSignatureDate,
              },
            }),
          },
        })
      : await tx.family.create({
          data: {
            centerId: center.id,
            name: familyNameFromGuardian(packet.primaryGuardianName),
            address: nullable(packet.primaryGuardianAddress),
            billingEmail: nullable(packet.billingContactEmail || packet.primaryGuardianEmail),
            custodyNotes: nullable(packet.custodyNotes || packet.restrictedPickups),
            sourceSystem: "bee_suite_registration",
      externalId: `registration:${submissionId}`,
            customFields: inputJson({
              registrationSubmissionId: submissionId,
              registrationReviewedAt: reviewedAt.toISOString(),
              billingContactName: packet.billingContactName,
              billingContactPhone: packet.billingContactPhone,
              childAddress: packet.childAddress,
              siblingNamesAges: packet.siblingNamesAges,
              collectionResponsibilityAcknowledgment: packet.collectionResponsibilityAcknowledgment,
              mealBenefitApplication: {
                requested: packet.mealBenefitApplicationNeeded,
                caseNumberSnap: packet.mealApplicationCaseNumberSnap,
                caseNumberTanf: packet.mealApplicationCaseNumberTanf,
                childStatuses: packet.mealApplicationChildStatuses,
                householdMembers: packet.mealApplicationHouseholdMembers,
                adultIncome: packet.mealApplicationAdultIncome,
                noSsn: packet.mealApplicationNoSsn,
                ethnicity: packet.mealApplicationEthnicity,
                race: packet.mealApplicationRace,
                signatureName: packet.mealApplicationSignatureName,
                signatureDate: packet.mealApplicationSignatureDate,
              },
            }),
          },
        });

    async function upsertGuardian(input: {
      fullName: string;
      email: string;
      phone: string;
      relation: string;
      employer: string;
      address: string;
      homePhone: string;
      workPhone: string;
      cellPhoneCarrier: string;
      driverLicense: string;
      socialSecurityNumber: string;
      isBillingContact: boolean;
    }) {
      if (!input.fullName && !input.email) return null;
      const existing = await tx.guardian.findFirst({
        where: {
          familyId: family.id,
          OR: [
            input.email ? { email: input.email } : undefined,
            input.fullName ? { fullName: input.fullName } : undefined,
          ].filter((value): value is NonNullable<typeof value> => Boolean(value)),
        },
      });
      const data = {
        fullName: input.fullName || input.email,
        email: nullable(input.email),
        phone: nullable(input.phone),
        relation: input.relation || "Parent/Guardian",
        employer: nullable(input.employer),
        isBillingContact: input.isBillingContact,
        sourceSystem: "bee_suite_registration",
        customFields: customFields(existing?.customFields, {
          registrationSubmissionId: submissionId,
          address: input.address,
          homePhone: input.homePhone,
          workPhone: input.workPhone,
          cellPhoneCarrier: input.cellPhoneCarrier,
          driverLicense: input.driverLicense,
          socialSecurityNumberProvidedOnPacket: Boolean(input.socialSecurityNumber),
          parentPortalInvite: { status: inviteParent ? "pending" : "not_requested" },
        }),
      };
      const guardian = existing
        ? tx.guardian.update({ where: { id: existing.id }, data })
        : tx.guardian.create({ data: { familyId: family.id, ...data } });
      const savedGuardian = await guardian;
      if (!savedGuardian.checkInPinHash) {
        const defaultPinData = defaultGuardianPinUpdate({ guardianId: savedGuardian.id, phone: savedGuardian.phone, setById: actor.id });
        if (defaultPinData) return tx.guardian.update({ where: { id: savedGuardian.id }, data: defaultPinData });
      }
      return savedGuardian;
    }

    const primaryGuardian = await upsertGuardian({
      fullName: packet.primaryGuardianName,
      email: packet.primaryGuardianEmail,
      phone: packet.primaryGuardianPhone,
      relation: packet.primaryGuardianRelation,
      employer: packet.primaryGuardianEmployer,
      address: packet.primaryGuardianAddress,
      homePhone: packet.primaryGuardianHomePhone,
      workPhone: packet.primaryGuardianWorkPhone,
      cellPhoneCarrier: packet.primaryGuardianCellPhoneCarrier,
      driverLicense: packet.primaryGuardianDriverLicense,
      socialSecurityNumber: packet.primaryGuardianSocialSecurityNumber,
      isBillingContact: true,
    });
    const secondaryGuardian = await upsertGuardian({
      fullName: packet.secondaryGuardianName,
      email: packet.secondaryGuardianEmail,
      phone: packet.secondaryGuardianPhone,
      relation: packet.secondaryGuardianRelation,
      employer: packet.secondaryGuardianEmployer,
      address: packet.secondaryGuardianAddress,
      homePhone: packet.secondaryGuardianHomePhone,
      workPhone: packet.secondaryGuardianWorkPhone,
      cellPhoneCarrier: packet.secondaryGuardianCellPhoneCarrier,
      driverLicense: packet.secondaryGuardianDriverLicense,
      socialSecurityNumber: packet.secondaryGuardianSocialSecurityNumber,
      isBillingContact: false,
    });
    const savedGuardians = [primaryGuardian, secondaryGuardian].filter((guardian): guardian is NonNullable<typeof guardian> => Boolean(guardian));

    const childMatch = await tx.child.findFirst({
      where: {
        familyId: family.id,
        fullName: packet.childFullName,
      },
    });
    const childData = {
      fullName: packet.childFullName,
      preferredName: nullable(packet.childPreferredName),
      dateOfBirth: childDateOfBirth,
      ageGroup: packet.program || "Not set",
      enrollmentStatus: "pending",
      startDate: desiredStartDate,
      schedule: inputJson({
        program: packet.program,
        schedule: packet.schedule,
        days: packet.scheduleDays,
        desiredStartDate: packet.desiredStartDate,
      }),
      photoVideoPermission: packet.photoVideoPermission,
      fieldTripPermission: packet.fieldTripPermission,
      sourceSystem: "bee_suite_registration",
      customFields: inputJson({
          registrationSubmissionId: submissionId,
        childSex: packet.childSex,
        childAddress: packet.childAddress,
        childPrimaryLanguage: packet.childPrimaryLanguage,
        childLivesWith: packet.childLivesWith,
        previousCareProgram: packet.previousCareProgram,
        siblingNamesAges: packet.siblingNamesAges,
        dayStructure: packet.dayStructure,
        newSituationNotes: packet.newSituationNotes,
        appetiteNotes: packet.appetiteNotes,
        feedsSelf: packet.feedsSelf,
        foodLikes: packet.foodLikes,
        foodDislikes: packet.foodDislikes,
        napSchedule: packet.napSchedule,
        nightSleepSchedule: packet.nightSleepSchedule,
        sleepItems: packet.sleepItems,
        napHints: packet.napHints,
        favoriteActivities: packet.favoriteActivities,
        developmentSkills: packet.developmentSkills,
        toiletingStatus: packet.toiletingStatus,
        bathroomRequest: packet.bathroomRequest,
        bathroomHelpNeeded: packet.bathroomHelpNeeded,
        toiletingRoutine: packet.toiletingRoutine,
        goalsExpectations: packet.goalsExpectations,
        friendsAtCenter: packet.friendsAtCenter,
        childPersonality: packet.childPersonality,
        otherHelpfulInfo: packet.otherHelpfulInfo,
        participationInterests: packet.participationInterests,
        participationOther: packet.participationOther,
        transportationPermission: packet.transportationPermission,
        sunscreenPermission: packet.sunscreenPermission,
        waterActivityPermission: packet.waterActivityPermission,
        emergencyMedicalPermission: packet.emergencyMedicalPermission,
        firstAidEmergencyConsent: packet.firstAidEmergencyConsent,
        floridaKnowYourChildcareAcknowledgment: packet.floridaKnowYourChildcareAcknowledgment,
        floridaDistractedAdultAcknowledgment: packet.floridaDistractedAdultAcknowledgment,
        dcfInspectionAccessAcknowledgment: packet.dcfInspectionAccessAcknowledgment,
        physicalImmunizationThirtyDayAcknowledgment: packet.physicalImmunizationThirtyDayAcknowledgment,
        foodProgramPermission: packet.foodProgramPermission,
        nutritionPolicyAcknowledgment: packet.nutritionPolicyAcknowledgment,
        foodActivityPermission: packet.foodActivityPermission,
        foodActivityAllergyChoice: packet.foodActivityAllergyChoice,
        foodActivityRestrictedItems: packet.foodActivityRestrictedItems,
        uniformOrder: {
          blackQuantity: packet.uniformBlackQuantity,
          blackSize: packet.uniformBlackSize,
          yellowQuantity: packet.uniformYellowQuantity,
          yellowSize: packet.uniformYellowSize,
          paymentChoice: packet.uniformPaymentChoice,
          paymentAmount: packet.uniformPaymentAmount,
          comments: packet.uniformComments,
        },
        immunizationStatus: packet.immunizationStatus,
        immunizationExpirationDate: packet.immunizationExpirationDate,
        physicalExpirationDate: packet.physicalExpirationDate,
        elc4cExpirationDate: packet.elc4cExpirationDate,
        hospitalPreference: packet.hospitalPreference,
        financialAgreementInitials: {
          paymentFees: packet.financialAgreementPaymentFeesInitials,
          absenteePolicy: packet.financialAgreementAbsenteePolicyInitials,
          registrationFee: packet.financialAgreementRegistrationFeeInitials,
          returnedPayment: packet.financialAgreementReturnedPaymentInitials,
          discharge: packet.financialAgreementDischargeInitials,
          withdrawal: packet.financialAgreementWithdrawalInitials,
          latePickup: packet.financialAgreementLatePickupInitials,
          collection: packet.financialAgreementCollectionInitials,
          uniform: packet.financialAgreementUniformInitials,
          finalTerms: packet.financialAgreementFinalTermsInitials,
        },
      }),
    };
    const child = childMatch
      ? await tx.child.update({ where: { id: childMatch.id }, data: childData })
      : await tx.child.create({
          data: {
            familyId: family.id,
            externalId: `registration:${submissionId}:child`,
            ...childData,
          },
        });

    const allergyNote = [packet.allergies, packet.allergyActionPlan].filter(Boolean).join("\nAction plan: ");
    if (allergyNote) {
      const existingAllergy = await tx.allergy.findFirst({ where: { childId: child.id, allergen: "Registration packet allergy note" } });
      if (!existingAllergy) {
        await tx.allergy.create({
          data: {
            childId: child.id,
            allergen: "Registration packet allergy note",
            severity: "director_review_required",
            actionPlan: allergyNote,
          },
        });
      }
    }

    const medicalNote = [
      packet.specialNeedsNotes ? `Special needs: ${packet.specialNeedsNotes}` : "",
      packet.medicalConditions.length ? `Medical conditions: ${packet.medicalConditions.join(", ")}` : "",
      packet.medicalConditionOther ? `Other medical condition: ${packet.medicalConditionOther}` : "",
      packet.allergyReactionSymptoms ? `Allergy symptoms: ${packet.allergyReactionSymptoms}` : "",
      packet.allergyPreventativeMeasures ? `Preventative measures: ${packet.allergyPreventativeMeasures}` : "",
      packet.allergyExposureResponse ? `Emergency exposure response: ${packet.allergyExposureResponse}` : "",
      packet.emergencyMedicationInstructions ? `Emergency medication instructions: ${packet.emergencyMedicationInstructions}` : "",
      packet.emergencyCarePlanContacts ? `Emergency care plan contacts: ${packet.emergencyCarePlanContacts}` : "",
      packet.medications ? `Medications: ${packet.medications}` : "",
      packet.medicationAuthorizationNeeded ? "Medication authorization may be needed." : "",
      packet.dietaryRestrictions ? `Dietary restrictions: ${packet.dietaryRestrictions}` : "",
      packet.physicianInfo || packet.physicianPhone ? `Physician: ${[packet.physicianInfo, packet.physicianPhone].filter(Boolean).join(" · ")}` : "",
      packet.dentistInfo || packet.dentistPhone ? `Dentist: ${[packet.dentistInfo, packet.dentistPhone].filter(Boolean).join(" · ")}` : "",
      packet.insuranceInfo || packet.insuranceCompany || packet.insurancePolicyNumber ? `Insurance: ${[packet.insuranceCompany, packet.insurancePolicyNumber, packet.insuranceInfo].filter(Boolean).join(" · ")}` : "",
      packet.medicalNotes ? `Additional notes: ${packet.medicalNotes}` : "",
    ].filter(Boolean).join("\n");
    if (medicalNote) {
      await tx.childMedicalNote.create({
        data: {
          childId: child.id,
          category: "registration_packet",
          note: medicalNote,
          restricted: true,
        },
      });
    }

    for (const contact of parsePacketContactLines(packet.emergencyContacts)) {
      const existing = await tx.emergencyContact.findFirst({
        where: { familyId: family.id, fullName: contact.fullName, phone: contact.phone ?? "Not provided" },
      });
      if (!existing) {
        await tx.emergencyContact.create({
          data: {
            familyId: family.id,
            fullName: contact.fullName,
            phone: contact.phone ?? "Not provided",
            relation: contact.relation ?? "Emergency contact",
            sourceSystem: "bee_suite_registration",
          },
        });
      }
    }

    for (const pickup of parsePacketContactLines(packet.authorizedPickups)) {
      const existing = await tx.authorizedPickup.findFirst({
        where: { familyId: family.id, fullName: pickup.fullName, phone: pickup.phone },
      });
      if (!existing) {
        await tx.authorizedPickup.create({
          data: {
            familyId: family.id,
            fullName: pickup.fullName,
            phone: pickup.phone,
            relation: pickup.relation,
            verificationNotes: pickup.notes,
            sourceSystem: "bee_suite_registration",
          },
        });
      }
    }

    const createdDocuments = [];
    for (const requestItem of documentRequests) {
      const existing = await tx.document.findFirst({
        where: {
          familyId: family.id,
          childId: requestItem.scope === "child" ? child.id : null,
          type: requestItem.type,
          status: { not: DocumentStatus.REJECTED },
        },
      });
      if (existing) {
        createdDocuments.push(existing);
      } else {
        createdDocuments.push(await tx.document.create({
          data: {
            familyId: family.id,
            childId: requestItem.scope === "child" ? child.id : null,
            name: requestItem.name,
            type: requestItem.type,
            status: DocumentStatus.REQUESTED,
            storageKey: requestItem.storageKey,
            restricted: requestItem.restricted,
          },
        }));
      }
    }

    const signatureRequestCount = documentRequests.filter((item) => item.signatureRequired).length;
    const uploadRequestCount = documentRequests.length - signatureRequestCount;
    const preliminaryChecklist = buildEnrollmentChecklist({
      applicationReviewed: true,
      familyProfileReady: true,
      childProfileReady: true,
      guardianCount: savedGuardians.length,
      parentPortalInviteStatus: inviteParent ? "pending" : "not_ready",
      documentRequestCount: uploadRequestCount,
      signatureRequestCount,
      hasTuitionPlan: false,
      hasClassroomAssignment: Boolean(child.classroomId),
      hasDepositPlan: false,
      registrationPaymentRequired: paymentPlan.required,
      registrationPaymentReady: false,
      registrationPaymentPaid: false,
      registrationPaymentAmountCents: paymentPlan.totalCents,
      startDateReady: Boolean(desiredStartDate),
      generatedAt: reviewedAt,
    });
    const existingEnrollment = await tx.enrollment.findFirst({
      where: packet.leadId ? { childId: child.id, leadId: packet.leadId } : { childId: child.id },
      orderBy: { updatedAt: "desc" },
    });
    const enrollment = existingEnrollment
      ? await tx.enrollment.update({
          where: { id: existingEnrollment.id },
          data: {
            leadId: packet.leadId || existingEnrollment.leadId,
            stage: EnrollmentStage.DOCUMENTS_PENDING,
            desiredStartDate,
            depositDueCents: paymentPlan.depositCents,
            depositPaidCents: paymentPlan.depositCents > 0
              ? Math.min(existingEnrollment.depositPaidCents, paymentPlan.depositCents)
              : existingEnrollment.depositPaidCents,
            checklist: preliminaryChecklist as unknown as Prisma.InputJsonObject,
          },
        })
      : await tx.enrollment.create({
          data: {
            childId: child.id,
            leadId: packet.leadId || null,
            stage: EnrollmentStage.DOCUMENTS_PENDING,
            desiredStartDate,
            depositDueCents: paymentPlan.depositCents,
            depositPaidCents: 0,
            checklist: preliminaryChecklist as unknown as Prisma.InputJsonObject,
          },
        });
    const registrationPayment = await ensureRegistrationPaymentInvoice(tx, {
      familyId: family.id,
      childId: child.id,
      enrollmentId: enrollment.id,
      leadId: packet.leadId || null,
      submissionId,
      reviewedAt,
      paymentPlan,
    });
    const finalChecklist = buildEnrollmentChecklist({
      applicationReviewed: true,
      familyProfileReady: true,
      childProfileReady: true,
      guardianCount: savedGuardians.length,
      parentPortalInviteStatus: inviteParent ? "pending" : "not_ready",
      documentRequestCount: uploadRequestCount,
      signatureRequestCount,
      hasTuitionPlan: false,
      hasClassroomAssignment: Boolean(child.classroomId),
      hasDepositPlan: paymentPlan.depositCents > 0,
      registrationPaymentRequired: registrationPayment.required,
      registrationPaymentReady: registrationPayment.status !== "not_required",
      registrationPaymentPaid: registrationPayment.status === "paid",
      registrationPaymentAmountCents: registrationPayment.totalCents,
      startDateReady: Boolean(desiredStartDate),
      generatedAt: reviewedAt,
    });
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        depositDueCents: paymentPlan.depositCents,
        depositPaidCents: registrationPayment.status === "paid" ? paymentPlan.depositCents : enrollment.depositPaidCents,
        checklist: finalChecklist as unknown as Prisma.InputJsonObject,
      },
    });

    const nextSubmission = await tx.formSubmission.update({
      where: { id: submissionId },
      data: {
        familyId: family.id,
        status: DocumentStatus.APPROVED,
        data: mergedSubmissionData(submission.data, {
          familyId: family.id,
          childId: child.id,
          enrollmentId: enrollment.id,
          registrationPayment,
          documentRequestIds: createdDocuments.map((document) => document.id),
          registrationReview: {
            status: "approved",
            reviewedAt: reviewedAt.toISOString(),
            reviewedBy: user.email,
            note,
          },
        }),
      },
    });

    const lead = packet.leadId
      ? await tx.lead.findFirst({
          where: { id: packet.leadId, centerId: center.id },
          select: { id: true, customFields: true },
        })
      : null;
    if (lead) {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stage: EnrollmentStage.DOCUMENTS_PENDING,
          status: "open",
          customFields: customFields(lead.customFields, {
            registrationStatus: "approved",
            registrationReviewedAt: reviewedAt.toISOString(),
            familyId: family.id,
            childId: child.id,
            enrollmentId: enrollment.id,
          }),
        },
      });
      await tx.task.create({
        data: {
          leadId: packet.leadId,
          title: `Collect enrollment documents and signatures for ${packet.childFullName}`,
          status: "open",
          dueAt: new Date(reviewedAt.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await tx.note.create({
      data: {
        familyId: family.id,
        leadId: packet.leadId || null,
        userId: user.id,
        restricted: true,
        body: `Online registration approved by ${user.name}. ${documentRequests.length} document/signature requests queued.${registrationPayment.required ? ` Registration fee/deposit invoice ${registrationPayment.invoiceNumber ?? ""} queued for ${formatRegistrationPaymentAmount(registrationPayment.totalCents)}.` : ""}${note ? ` Review note: ${note}` : ""}`,
      },
    });

    return {
      submission: nextSubmission,
      family,
      child,
      primaryGuardian,
      guardians: savedGuardians,
      enrollment,
      uploadRequestCount,
      signatureRequestCount,
      documentRequestCount: documentRequests.length,
      registrationPayment,
    };
  });

  let parentInvite: {
    ok: boolean;
    error?: string;
    emailSent: boolean;
    passwordResetSent: boolean;
    defaultPasswordSet: boolean;
    invitedCount?: number;
    failedCount?: number;
    results?: Array<Awaited<ReturnType<typeof createParentPortalInvite>>>;
  } = {
      ok: false,
      error: "Parent portal invite was not requested.",
      emailSent: false,
      passwordResetSent: false,
      defaultPasswordSet: false,
    };
  if (inviteParent && approval.guardians.length) {
    const results = [];
    for (const guardian of approval.guardians) {
      results.push(await createParentPortalInvite({
        requestUrl: request.url,
        user,
        center,
        family: approval.family,
        guardian,
        registrationPayment: approval.registrationPayment,
      }));
    }
    const successes = results.filter((result) => result.ok);
    parentInvite = {
      ok: successes.length > 0,
      error: successes.length ? undefined : results.find((result) => !result.ok)?.error ?? "Parent portal invites failed.",
      emailSent: successes.some((result) => result.emailSent),
      passwordResetSent: false,
      defaultPasswordSet: successes.some((result) => result.defaultPasswordSet),
      invitedCount: successes.length,
      failedCount: results.length - successes.length,
      results,
    };
  }

  const checklist = buildEnrollmentChecklist({
    applicationReviewed: true,
    familyProfileReady: true,
    childProfileReady: true,
    guardianCount: approval.guardians.length,
    parentPortalInviteStatus: parentInvite.ok ? "sent" : inviteParent ? "failed" : "not_ready",
    documentRequestCount: approval.uploadRequestCount,
    signatureRequestCount: approval.signatureRequestCount,
    hasTuitionPlan: false,
    hasClassroomAssignment: Boolean(approval.child.classroomId),
    hasDepositPlan: paymentPlan.depositCents > 0,
    registrationPaymentRequired: approval.registrationPayment.required,
    registrationPaymentReady: approval.registrationPayment.status !== "not_required",
    registrationPaymentPaid: approval.registrationPayment.status === "paid",
    registrationPaymentAmountCents: approval.registrationPayment.totalCents,
    startDateReady: Boolean(desiredStartDate),
    generatedAt: reviewedAt,
  });
  await prisma.enrollment.update({
    where: { id: approval.enrollment.id },
    data: { checklist: checklist as unknown as Prisma.InputJsonObject },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "registration.approved",
    resource: "FormSubmission",
    resourceId: submissionId,
    metadata: {
      leadId: packet.leadId,
      familyId: approval.family.id,
      childId: approval.child.id,
      enrollmentId: approval.enrollment.id,
      documentRequestCount: approval.documentRequestCount,
      parentInviteStatus: parentInvite.ok ? "sent" : "failed",
      registrationPaymentStatus: approval.registrationPayment.status,
      registrationPaymentInvoiceId: approval.registrationPayment.invoiceId,
      registrationPaymentTotalCents: approval.registrationPayment.totalCents,
    },
  });

  return NextResponse.json({
    ok: true,
    reviewStatus: "approved",
    submission: approval.submission,
    familyId: approval.family.id,
    childId: approval.child.id,
    enrollmentId: approval.enrollment.id,
    documentRequestCount: approval.documentRequestCount,
    registrationPayment: approval.registrationPayment,
    parentInvite,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
