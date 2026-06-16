import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEnrollmentChecklist,
  buildRegistrationDocumentRequests,
  kidCityRegistrationPacketSchema,
  markRegistrationPaymentChecklistPaid,
  parsePacketContactLines,
  registrationReviewFromData,
  registrationSubmissionSummary,
  summarizeEnrollmentChecklist,
} from "../src/lib/registration-packet";
import { INTERNAL_SIGNATURE_PENDING_KEY } from "../src/lib/signature-capture";

test("Kid City registration packet schema includes final operational sections", () => {
  const schema = kidCityRegistrationPacketSchema();
  assert.equal(schema.version, 3);
  assert.equal(schema.title, "Kid City USA Online Registration Packet - Florida March 2026");
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
