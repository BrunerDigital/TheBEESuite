import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEnrollmentChecklist,
  buildRegistrationChildCustomFields,
  buildRegistrationDocumentRequests,
  buildRegistrationFamilyCustomFields,
  buildRegistrationGuardianCustomFields,
  buildRegistrationReviewPreview,
  kidCityRegistrationPacketSchema,
  markRegistrationPaymentChecklistPaid,
  parsePacketContactLines,
  registrationGuardianIsBillingContact,
  registrationReviewFromData,
  registrationReviewTransitionError,
  registrationSubmissionSummary,
  summarizeEnrollmentChecklist,
  shouldInviteParentOnRegistrationApproval,
  type RegistrationPacketPayload,
} from "../src/lib/registration-packet";

test("registration approval requires an explicit parent invitation opt-in", () => {
  assert.equal(shouldInviteParentOnRegistrationApproval(true), true);
  assert.equal(shouldInviteParentOnRegistrationApproval(false), false);
  assert.equal(shouldInviteParentOnRegistrationApproval(undefined), false);
  assert.equal(shouldInviteParentOnRegistrationApproval("true"), false);
});

test("registration approval refuses duplicate or post-approval review writes", () => {
  assert.match(registrationReviewTransitionError("approved", "APPROVED") ?? "", /already been approved/);
  assert.match(registrationReviewTransitionError("approved", "REJECTED") ?? "", /cannot be reviewed again/);
  assert.match(registrationReviewTransitionError("rejected", "REJECTED") ?? "", /already been rejected/);
  assert.equal(registrationReviewTransitionError("rejected", "APPROVED"), null);
  assert.equal(registrationReviewTransitionError("submitted", "APPROVED"), null);
});
import { INTERNAL_SIGNATURE_PENDING_KEY } from "../src/lib/signature-capture";

test("registration packet schema includes final operational sections without tenant-specific branding", () => {
  const schema = kidCityRegistrationPacketSchema();
  assert.equal(schema.version, 3);
  assert.equal(schema.title, "Online Registration Packet - Florida March 2026");
  assert.deepEqual(schema.sections.map((section) => section.id), [
    "school_program",
    "guardians_billing",
    "child_information",
    "child_profile",
    "medical_safety",
    "emergency_pickups",
    "permissions",
    "food_media_uniforms",
    "financial_handbook_acknowledgments",
  ]);
});

test("registration document requests include base signatures and conditional restricted uploads", () => {
  const requests = buildRegistrationDocumentRequests({
    allergies: "Peanut allergy",
    allergyActionPlan: "EpiPen in office",
    medications: "Daily inhaler",
    custodyNotes: "Court order on file",
    transportationPermission: true,
  });

  assert.equal(requests.some((request) => request.type === "handbook_acknowledgment" && request.storageKey === INTERNAL_SIGNATURE_PENDING_KEY), true);
  assert.equal(requests.some((request) => request.type === "allergy_action_plan" && request.restricted), true);
  assert.equal(requests.some((request) => request.type === "medication_authorization" && request.restricted), true);
  assert.equal(requests.some((request) => request.type === "custody_document" && request.scope === "family"), true);
  assert.equal(requests.some((request) => request.type === "transportation_permission" && request.signatureRequired), true);
});

test("registration contact parser handles newline and comma separated contacts", () => {
  assert.deepEqual(parsePacketContactLines("Jane Parent, 555-1212, Mother\nSam Uncle | 555-3434 | Uncle"), [
    { fullName: "Jane Parent", phone: "555-1212", relation: "Mother", notes: null },
    { fullName: "Sam Uncle", phone: "555-3434", relation: "Uncle", notes: null },
  ]);
});

test("registration review and summary helpers read packet data safely", () => {
  const data = {
    childFullName: "Avery Bee",
    primaryGuardianName: "Jane Bee",
    program: "Pre-K",
    desiredStartDate: "2026-08-10",
    registrationReview: { status: "approved", reviewedAt: "2026-06-08T12:00:00.000Z", reviewedBy: "director@example.com" },
  };

  assert.equal(registrationReviewFromData(data).status, "approved");
  assert.equal(registrationSubmissionSummary(data), "Avery Bee · Jane Bee · Pre-K · 2026-08-10 · approved");
});

test("director review preview includes filed destinations and redacts restricted values", () => {
  const preview = buildRegistrationReviewPreview({
    centerId: "center-1",
    program: "Pre-K",
    schedule: "Full time",
    desiredStartDate: "2026-08-10",
    primaryGuardianName: "Jane Bee",
    primaryGuardianEmail: "jane@example.com",
    primaryGuardianSocialSecurityNumber: "111-22-3333",
    primaryGuardianDriverLicense: "D1234567",
    childFullName: "Avery Bee",
    insurancePolicyNumber: "POLICY-SECRET",
    emergencyContacts: "Sam Bee, 555-1111, Uncle",
    authorizedPickups: "Sam Bee, 555-1111, Uncle",
    policyAcknowledgment: true,
  });
  const serialized = JSON.stringify(preview);

  assert.equal(preview.destinations.includes("Family billing profile and guardian records"), true);
  assert.equal(preview.destinations.includes("Emergency contacts and authorized pickup records"), true);
  assert.equal(serialized.includes("111-22-3333"), false);
  assert.equal(serialized.includes("D1234567"), false);
  assert.equal(serialized.includes("POLICY-SECRET"), false);
  assert.match(serialized, /restricted registration packet/);
});

test("registration mapping files submitted values into family, guardian, and child records without copying full identity numbers", () => {
  const packet = {
    primaryGuardianName: "Jane Bee",
    primaryGuardianEmail: "jane@example.com",
    primaryGuardianAddress: "1 Main St",
    primaryGuardianDriverLicense: "D1234567",
    primaryGuardianSocialSecurityNumber: "111-22-3333",
    secondaryGuardianName: "John Bee",
    secondaryGuardianEmail: "john@example.com",
    secondaryGuardianDriverLicense: "D7654321",
    secondaryGuardianSocialSecurityNumber: "999-88-7777",
    billingContactName: "John Bee",
    billingContactEmail: "john@example.com",
    billingContactPhone: "555-1212",
    childSex: "Female",
    childPrimaryLanguage: "English",
    mealBenefitApplicationNeeded: true,
    mealApplicationAttendedThisCenter: "Yes",
    mealApplicationHeadStartPreK: "No",
    mealApplicationChildIncome: "None",
    mealApplicationLastFourSsn: "3333",
    handbookAcknowledgment: true,
    emergencyProceduresAcknowledgment: true,
    tuitionPolicyAcknowledgment: true,
    disciplinePolicyAcknowledgment: true,
    expulsionPolicyAcknowledgment: true,
    mandatoryReportingAcknowledgment: true,
    healthPolicyAcknowledgment: true,
    collectionResponsibilityAcknowledgment: true,
    policyAcknowledgment: true,
    eSignatureConsent: true,
    signatureName: "Jane Bee",
    signatureDate: "2026-07-27",
    insurancePolicyNumber: "POLICY-SECRET",
  } as RegistrationPacketPayload;

  const family = buildRegistrationFamilyCustomFields(packet, {
    submissionId: "submission-1",
    reviewedAt: "2026-07-27T12:00:00.000Z",
  });
  const primary = buildRegistrationGuardianCustomFields(packet, "primary", {
    submissionId: "submission-1",
    inviteParent: false,
  });
  const child = buildRegistrationChildCustomFields(packet, { submissionId: "submission-1" });
  const serialized = JSON.stringify({ family, primary, child });

  assert.equal(family.mealBenefitApplication.attendedThisCenter, "Yes");
  assert.equal(family.mealBenefitApplication.headStartPreK, "No");
  assert.equal(family.mealBenefitApplication.childIncome, "None");
  assert.equal(family.registrationAcknowledgments.handbook, true);
  assert.equal(primary.driverLicenseProvidedOnPacket, true);
  assert.equal(primary.socialSecurityNumberProvidedOnPacket, true);
  assert.equal(child.insurancePolicyNumberProvidedOnPacket, true);
  assert.equal(registrationGuardianIsBillingContact(packet, "primary"), false);
  assert.equal(registrationGuardianIsBillingContact(packet, "secondary"), true);
  assert.equal(serialized.includes("111-22-3333"), false);
  assert.equal(serialized.includes("D1234567"), false);
  assert.equal(serialized.includes("POLICY-SECRET"), false);
});

test("enrollment checklist summary counts completed, pending, and blocked items", () => {
  const checklist = buildEnrollmentChecklist({
    applicationReviewed: true,
    familyProfileReady: true,
    childProfileReady: true,
    guardianCount: 2,
    parentPortalInviteStatus: "failed",
    documentRequestCount: 4,
    signatureRequestCount: 5,
    hasTuitionPlan: false,
    hasClassroomAssignment: false,
    hasDepositPlan: false,
    startDateReady: true,
    generatedAt: new Date("2026-06-08T12:00:00.000Z"),
  });
  const summary = summarizeEnrollmentChecklist(checklist);

  assert.equal(summary.total, 10);
  assert.equal(summary.complete, 7);
  assert.equal(summary.pending, 2);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.percentComplete, 70);
});

test("enrollment checklist tracks registration payment readiness and paid status", () => {
  const checklist = buildEnrollmentChecklist({
    applicationReviewed: true,
    familyProfileReady: true,
    childProfileReady: true,
    guardianCount: 2,
    parentPortalInviteStatus: "sent",
    documentRequestCount: 4,
    signatureRequestCount: 5,
    hasTuitionPlan: false,
    hasClassroomAssignment: false,
    hasDepositPlan: true,
    registrationPaymentRequired: true,
    registrationPaymentReady: true,
    registrationPaymentPaid: false,
    registrationPaymentAmountCents: 35_000,
    startDateReady: true,
    generatedAt: new Date("2026-06-08T12:00:00.000Z"),
  });
  const paymentItem = checklist.items.find((item) => item.id === "registration_payment");

  assert.equal(paymentItem?.status, "pending");
  assert.match(paymentItem?.detail ?? "", /ready for parent checkout/);

  const paidChecklist = markRegistrationPaymentChecklistPaid(checklist, {
    amountCents: 35_000,
    paidAt: new Date("2026-06-09T12:00:00.000Z"),
  });
  const paidItem = paidChecklist?.items.find((item) => item.id === "registration_payment");

  assert.equal(paidItem?.status, "complete");
  assert.match(paidItem?.detail ?? "", /payment is recorded/);
});
