import { INTERNAL_SIGNATURE_PENDING_KEY } from "@/lib/signature-capture";

export type RegistrationReviewStatus = "submitted" | "approved" | "rejected";

export type RegistrationPacketPayload = {
  centerId: string;
  primaryGuardianName: string;
  primaryGuardianEmail: string;
  primaryGuardianPhone: string;
  primaryGuardianAddress: string;
  primaryGuardianRelation: string;
  primaryGuardianEmployer: string;
  primaryGuardianWorkPhone: string;
  secondaryGuardianName: string;
  secondaryGuardianEmail: string;
  secondaryGuardianPhone: string;
  secondaryGuardianRelation: string;
  secondaryGuardianEmployer: string;
  secondaryGuardianAddress: string;
  billingContactName: string;
  billingContactEmail: string;
  billingContactPhone: string;
  childFullName: string;
  childPreferredName: string;
  childDateOfBirth: string;
  childSex: string;
  childPrimaryLanguage: string;
  childLivesWith: string;
  previousCareProgram: string;
  program: string;
  schedule: string;
  scheduleDays: string[];
  desiredStartDate: string;
  allergies: string;
  allergyActionPlan: string;
  medications: string;
  medicationAuthorizationNeeded: boolean;
  dietaryRestrictions: string;
  physicianInfo: string;
  physicianPhone: string;
  dentistInfo: string;
  insuranceInfo: string;
  hospitalPreference: string;
  immunizationStatus: string;
  medicalNotes: string;
  emergencyContacts: string;
  authorizedPickups: string;
  restrictedPickups: string;
  custodyNotes: string;
  photoVideoPermission: boolean;
  fieldTripPermission: boolean;
  transportationPermission: boolean;
  sunscreenPermission: boolean;
  waterActivityPermission: boolean;
  emergencyMedicalPermission: boolean;
  foodProgramPermission: boolean;
  handbookAcknowledgment: boolean;
  tuitionPolicyAcknowledgment: boolean;
  disciplinePolicyAcknowledgment: boolean;
  healthPolicyAcknowledgment: boolean;
  policyAcknowledgment: boolean;
  eSignatureConsent: boolean;
  signatureName: string;
  signatureDate: string;
  pageUrl: string;
};

export type RegistrationDocumentRequest = {
  key: string;
  scope: "family" | "child";
  name: string;
  type: string;
  restricted: boolean;
  storageKey: string;
  signatureRequired: boolean;
};

export type EnrollmentChecklistItemStatus = "complete" | "pending" | "blocked";

export type EnrollmentChecklistItem = {
  id: string;
  label: string;
  owner: "director" | "parent" | "billing";
  status: EnrollmentChecklistItemStatus;
  detail: string;
};

export type EnrollmentChecklist = {
  version: 1;
  generatedAt: string;
  status: "ready_for_documents" | "approved_pending_documents" | "blocked";
  items: EnrollmentChecklistItem[];
};

type PacketField = {
  key: keyof RegistrationPacketPayload;
  label: string;
  type: "text" | "email" | "phone" | "date" | "textarea" | "checkbox" | "multi_checkbox" | "select";
  required?: boolean;
  options?: string[];
};

type PacketSection = {
  id: string;
  label: string;
  fields: PacketField[];
};

export const registrationScheduleDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export const kidCityRegistrationPacketSections: PacketSection[] = [
  {
    id: "school_program",
    label: "School, program, schedule, and requested start",
    fields: [
      { key: "centerId", label: "School", type: "select", required: true },
      { key: "program", label: "Program / age group", type: "select", required: true },
      { key: "schedule", label: "Requested schedule", type: "select", required: true },
      { key: "scheduleDays", label: "Requested days", type: "multi_checkbox", options: [...registrationScheduleDays] },
      { key: "desiredStartDate", label: "Desired start date", type: "date", required: true },
    ],
  },
  {
    id: "guardians_billing",
    label: "Parent, guardian, billing, and household contacts",
    fields: [
      { key: "primaryGuardianName", label: "Primary guardian legal name", type: "text", required: true },
      { key: "primaryGuardianEmail", label: "Primary guardian email", type: "email", required: true },
      { key: "primaryGuardianPhone", label: "Primary guardian mobile phone", type: "phone", required: true },
      { key: "primaryGuardianAddress", label: "Primary guardian address", type: "text" },
      { key: "primaryGuardianRelation", label: "Primary guardian relationship", type: "text" },
      { key: "primaryGuardianEmployer", label: "Primary guardian employer", type: "text" },
      { key: "primaryGuardianWorkPhone", label: "Primary guardian work phone", type: "phone" },
      { key: "secondaryGuardianName", label: "Secondary guardian legal name", type: "text" },
      { key: "secondaryGuardianEmail", label: "Secondary guardian email", type: "email" },
      { key: "secondaryGuardianPhone", label: "Secondary guardian phone", type: "phone" },
      { key: "secondaryGuardianRelation", label: "Secondary guardian relationship", type: "text" },
      { key: "secondaryGuardianEmployer", label: "Secondary guardian employer", type: "text" },
      { key: "secondaryGuardianAddress", label: "Secondary guardian address", type: "text" },
      { key: "billingContactName", label: "Billing contact name", type: "text" },
      { key: "billingContactEmail", label: "Billing contact email", type: "email" },
      { key: "billingContactPhone", label: "Billing contact phone", type: "phone" },
    ],
  },
  {
    id: "child_information",
    label: "Child identity, household, and care history",
    fields: [
      { key: "childFullName", label: "Child legal full name", type: "text", required: true },
      { key: "childPreferredName", label: "Child preferred name", type: "text" },
      { key: "childDateOfBirth", label: "Child date of birth", type: "date", required: true },
      { key: "childSex", label: "Child sex", type: "text" },
      { key: "childPrimaryLanguage", label: "Primary language", type: "text" },
      { key: "childLivesWith", label: "Child lives with", type: "text" },
      { key: "previousCareProgram", label: "Previous care or school", type: "text" },
    ],
  },
  {
    id: "medical_safety",
    label: "Medical, allergy, diet, custody, and safety",
    fields: [
      { key: "allergies", label: "Allergies", type: "textarea" },
      { key: "allergyActionPlan", label: "Allergy action plan", type: "textarea" },
      { key: "medications", label: "Medications", type: "textarea" },
      { key: "medicationAuthorizationNeeded", label: "Medication authorization needed", type: "checkbox" },
      { key: "dietaryRestrictions", label: "Dietary restrictions", type: "textarea" },
      { key: "physicianInfo", label: "Physician / pediatrician", type: "textarea" },
      { key: "physicianPhone", label: "Physician phone", type: "phone" },
      { key: "dentistInfo", label: "Dentist", type: "textarea" },
      { key: "insuranceInfo", label: "Insurance / policy notes", type: "textarea" },
      { key: "hospitalPreference", label: "Hospital preference", type: "text" },
      { key: "immunizationStatus", label: "Immunization status", type: "text" },
      { key: "medicalNotes", label: "Additional care notes", type: "textarea" },
      { key: "custodyNotes", label: "Custody or restricted pickup notes", type: "textarea" },
      { key: "restrictedPickups", label: "Restricted pickup people", type: "textarea" },
    ],
  },
  {
    id: "emergency_pickups",
    label: "Emergency contacts and authorized pickups",
    fields: [
      { key: "emergencyContacts", label: "Emergency contacts", type: "textarea", required: true },
      { key: "authorizedPickups", label: "Authorized pickups", type: "textarea", required: true },
    ],
  },
  {
    id: "permissions_acknowledgments",
    label: "Permissions, acknowledgments, and e-signature",
    fields: [
      { key: "photoVideoPermission", label: "Photo/video release", type: "checkbox" },
      { key: "fieldTripPermission", label: "Field trip permission", type: "checkbox" },
      { key: "transportationPermission", label: "Transportation permission", type: "checkbox" },
      { key: "sunscreenPermission", label: "Sunscreen/topical permission", type: "checkbox" },
      { key: "waterActivityPermission", label: "Water activity permission", type: "checkbox" },
      { key: "emergencyMedicalPermission", label: "Emergency medical care permission", type: "checkbox" },
      { key: "foodProgramPermission", label: "Food program participation", type: "checkbox" },
      { key: "handbookAcknowledgment", label: "Parent handbook acknowledgment", type: "checkbox" },
      { key: "tuitionPolicyAcknowledgment", label: "Tuition policy acknowledgment", type: "checkbox" },
      { key: "disciplinePolicyAcknowledgment", label: "Discipline policy acknowledgment", type: "checkbox" },
      { key: "healthPolicyAcknowledgment", label: "Health policy acknowledgment", type: "checkbox" },
      { key: "policyAcknowledgment", label: "Information accuracy certification", type: "checkbox", required: true },
      { key: "eSignatureConsent", label: "Electronic signature consent", type: "checkbox" },
      { key: "signatureName", label: "Typed signature", type: "text", required: true },
      { key: "signatureDate", label: "Signature date", type: "date" },
    ],
  },
];

export function kidCityRegistrationPacketSchema() {
  return {
    version: 2,
    source: "public_online_registration",
    title: "Kid City USA Online Registration Packet",
    sections: kidCityRegistrationPacketSections,
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmailText(value: unknown) {
  return cleanText(value).toLowerCase();
}

export function familyNameFromGuardian(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0] || "New";
  return `${surname} Family`;
}

export function normalizeScheduleDays(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const allowed = new Set<string>(registrationScheduleDays);
  return Array.from(new Set(values.map((item) => cleanText(item)).filter((item) => allowed.has(item))));
}

export function packetHasValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  return cleanText(value).length > 0;
}

export function registrationReviewFromData(data: unknown): {
  status: RegistrationReviewStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
} {
  const review = asRecord(asRecord(data).registrationReview);
  const rawStatus = cleanText(review.status).toLowerCase();
  const status: RegistrationReviewStatus =
    rawStatus === "approved" || rawStatus === "rejected" ? rawStatus : "submitted";
  return {
    status,
    reviewedAt: cleanText(review.reviewedAt) || null,
    reviewedBy: cleanText(review.reviewedBy) || null,
    note: cleanText(review.note) || null,
  };
}

export function registrationSubmissionSummary(data: unknown) {
  const record = asRecord(data);
  const child = cleanText(record.childFullName) || "Child";
  const guardian = cleanText(record.primaryGuardianName) || "Parent/guardian";
  const program = cleanText(record.program) || "Program not set";
  const start = cleanText(record.desiredStartDate) || "Start not set";
  const review = registrationReviewFromData(data);
  return `${child} · ${guardian} · ${program} · ${start} · ${review.status}`;
}

export function parsePacketContactLines(text: string) {
  return text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,|]/).map((part) => part.trim()).filter(Boolean);
      return {
        fullName: parts[0] || line,
        phone: parts.find((part, index) => index > 0 && /[0-9]/.test(part)) ?? null,
        relation: parts.find((part, index) => index > 0 && !/[0-9]/.test(part)) ?? null,
        notes: parts.length > 3 ? parts.slice(3).join(", ") : null,
      };
    });
}

export function buildRegistrationDocumentRequests(packet: Partial<RegistrationPacketPayload>): RegistrationDocumentRequest[] {
  const signature = (key: string, scope: "family" | "child", name: string, type: string): RegistrationDocumentRequest => ({
    key,
    scope,
    name,
    type,
    restricted: false,
    storageKey: INTERNAL_SIGNATURE_PENDING_KEY,
    signatureRequired: true,
  });
  const upload = (
    key: string,
    scope: "family" | "child",
    name: string,
    type: string,
    restricted = false,
  ): RegistrationDocumentRequest => ({
    key,
    scope,
    name,
    type,
    restricted,
    storageKey: "upload_pending",
    signatureRequired: false,
  });

  const requests: RegistrationDocumentRequest[] = [
    upload("family-emergency-card", "family", "Emergency Card", "emergency_card"),
    signature("family-authorized-pickup", "family", "Authorized Pickup Form", "authorized_pickup"),
    signature("family-handbook", "family", "Parent Handbook Acknowledgment", "handbook_acknowledgment"),
    signature("family-tuition-policy", "family", "Tuition Policy Acknowledgment", "tuition_policy"),
    signature("child-enrollment-packet", "child", "Enrollment Packet", "enrollment_packet"),
    upload("child-immunization", "child", "Immunization Record", "immunization"),
    upload("child-health-assessment", "child", "Health Assessment", "health_assessment"),
    signature("child-photo-release", "child", "Photo/Video Release", "photo_video_release"),
    signature("child-field-trip", "child", "Field Trip Permission", "field_trip_permission"),
    signature("child-emergency-medical", "child", "Emergency Medical Authorization", "emergency_medical_authorization"),
  ];

  if (packetHasValue(packet.transportationPermission)) {
    requests.push(signature("child-transportation", "child", "Transportation Permission", "transportation_permission"));
  }
  if (packetHasValue(packet.sunscreenPermission)) {
    requests.push(signature("child-sunscreen", "child", "Sunscreen / Topical Permission", "sunscreen_topical_permission"));
  }
  if (packetHasValue(packet.waterActivityPermission)) {
    requests.push(signature("child-water-activity", "child", "Water Activity Permission", "water_activity_permission"));
  }
  if (packetHasValue(packet.allergies) || packetHasValue(packet.allergyActionPlan)) {
    requests.push(upload("child-allergy-action-plan", "child", "Allergy Action Plan", "allergy_action_plan", true));
  }
  if (packetHasValue(packet.medications) || packet.medicationAuthorizationNeeded) {
    requests.push(upload("child-medication-authorization", "child", "Medication Authorization", "medication_authorization", true));
  }
  if (packetHasValue(packet.dietaryRestrictions)) {
    requests.push(upload("child-dietary-care-plan", "child", "Dietary Care Plan", "dietary_care_plan", true));
  }
  if (packetHasValue(packet.custodyNotes) || packetHasValue(packet.restrictedPickups)) {
    requests.push(upload("family-custody", "family", "Custody / Restricted Pickup Documents", "custody_document", true));
  }

  return requests;
}

export function buildEnrollmentChecklist(input: {
  applicationReviewed: boolean;
  familyProfileReady: boolean;
  childProfileReady: boolean;
  guardianCount: number;
  parentPortalInviteStatus: "not_ready" | "pending" | "sent" | "failed";
  documentRequestCount: number;
  signatureRequestCount: number;
  hasTuitionPlan: boolean;
  hasClassroomAssignment: boolean;
  hasDepositPlan: boolean;
  registrationPaymentRequired?: boolean;
  registrationPaymentReady?: boolean;
  registrationPaymentPaid?: boolean;
  registrationPaymentAmountCents?: number;
  startDateReady: boolean;
  generatedAt?: Date;
}): EnrollmentChecklist {
  const items: EnrollmentChecklistItem[] = [
    {
      id: "application_review",
      label: "Application reviewed",
      owner: "director",
      status: input.applicationReviewed ? "complete" : "pending",
      detail: input.applicationReviewed ? "Director approved the registration application." : "Director approval is required before enrollment setup continues.",
    },
    {
      id: "family_profile",
      label: "Family profile created",
      owner: "director",
      status: input.familyProfileReady ? "complete" : "pending",
      detail: input.familyProfileReady ? "Family record is linked to the packet." : "Create or link the family record.",
    },
    {
      id: "child_profile",
      label: "Child profile created",
      owner: "director",
      status: input.childProfileReady ? "complete" : "pending",
      detail: input.childProfileReady ? "Child record is linked to the packet." : "Create or link the child record.",
    },
    {
      id: "guardians",
      label: "Guardian contacts loaded",
      owner: "director",
      status: input.guardianCount > 0 ? "complete" : "pending",
      detail: `${input.guardianCount} guardian contact${input.guardianCount === 1 ? "" : "s"} linked.`,
    },
    {
      id: "parent_portal",
      label: "Parent portal invite",
      owner: "director",
      status: input.parentPortalInviteStatus === "sent" ? "complete" : input.parentPortalInviteStatus === "failed" ? "blocked" : "pending",
      detail:
        input.parentPortalInviteStatus === "sent"
          ? "Parent portal account is linked and setup email was requested."
          : input.parentPortalInviteStatus === "failed"
            ? "Parent portal auth/email setup needs staff follow-up."
            : "Parent portal access has not been sent yet.",
    },
    {
      id: "documents",
      label: "Required documents requested",
      owner: "parent",
      status: input.documentRequestCount > 0 ? "complete" : "pending",
      detail: `${input.documentRequestCount} upload request${input.documentRequestCount === 1 ? "" : "s"} queued.`,
    },
    {
      id: "signatures",
      label: "Required signatures requested",
      owner: "parent",
      status: input.signatureRequestCount > 0 ? "complete" : "pending",
      detail: `${input.signatureRequestCount} signature request${input.signatureRequestCount === 1 ? "" : "s"} queued.`,
    },
    {
      id: "tuition_rates",
      label: "Tuition rate/deposit plan",
      owner: "billing",
      status: input.hasTuitionPlan || input.hasDepositPlan ? "complete" : "pending",
      detail: input.hasTuitionPlan || input.hasDepositPlan ? "Billing setup can be confirmed." : "Select tuition rate, registration fee, and deposit rules.",
    },
    {
      id: "classroom",
      label: "Classroom assignment",
      owner: "director",
      status: input.hasClassroomAssignment ? "complete" : "pending",
      detail: input.hasClassroomAssignment ? "Child has a classroom assignment." : "Assign classroom once capacity and ratio are confirmed.",
    },
    {
      id: "start_date",
      label: "Start date confirmed",
      owner: "director",
      status: input.startDateReady ? "complete" : "pending",
      detail: input.startDateReady ? "Desired start date has been loaded." : "Confirm the child's first day.",
    },
  ];

  if (input.registrationPaymentRequired !== undefined) {
    const amount = input.registrationPaymentAmountCents ?? 0;
    const paymentItem: EnrollmentChecklistItem = {
      id: "registration_payment",
      label: "Registration fee/deposit payment",
      owner: "billing",
      status: !input.registrationPaymentRequired || input.registrationPaymentPaid
        ? "complete"
        : "pending",
      detail: !input.registrationPaymentRequired
        ? "No registration fee/deposit is configured for this school."
        : input.registrationPaymentPaid
          ? `Registration fee/deposit payment is recorded${amount > 0 ? ` for $${(amount / 100).toFixed(2)}` : ""}.`
          : input.registrationPaymentReady
            ? `Registration fee/deposit invoice is ready for parent checkout${amount > 0 ? ` for $${(amount / 100).toFixed(2)}` : ""}.`
            : "Create the registration fee/deposit invoice before final enrollment.",
    };
    const billingIndex = items.findIndex((item) => item.id === "tuition_rates");
    items.splice(billingIndex >= 0 ? billingIndex + 1 : items.length, 0, paymentItem);
  }

  return {
    version: 1,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    status: enrollmentChecklistStatus(items),
    items,
  };
}

function enrollmentChecklistStatus(items: EnrollmentChecklistItem[]): EnrollmentChecklist["status"] {
  return items.some((item) => item.status === "blocked")
    ? "blocked"
    : items.every((item) => item.status === "complete")
      ? "ready_for_documents"
      : "approved_pending_documents";
}

export function markRegistrationPaymentChecklistPaid(
  value: unknown,
  input: {
    amountCents?: number;
    paidAt?: Date;
  } = {},
): EnrollmentChecklist | null {
  const checklist = asRecord(value);
  const rawItems = Array.isArray(checklist.items) ? checklist.items : [];
  if (!rawItems.length) return null;
  let found = false;
  const amount = input.amountCents ?? 0;
  const items = rawItems.map((item) => {
    const record = asRecord(item);
    if (cleanText(record.id) !== "registration_payment") {
      return record as unknown as EnrollmentChecklistItem;
    }
    found = true;
    return {
      id: "registration_payment",
      label: cleanText(record.label) || "Registration fee/deposit payment",
      owner: "billing",
      status: "complete",
      detail: `Registration fee/deposit payment is recorded${amount > 0 ? ` for $${(amount / 100).toFixed(2)}` : ""}.`,
    } satisfies EnrollmentChecklistItem;
  });
  if (!found) return null;
  return {
    version: 1,
    generatedAt: input.paidAt?.toISOString() || cleanText(checklist.generatedAt) || new Date().toISOString(),
    status: enrollmentChecklistStatus(items),
    items,
  };
}

export function summarizeEnrollmentChecklist(value: unknown) {
  const checklist = asRecord(value);
  const items = Array.isArray(checklist.items) ? checklist.items.map(asRecord) : [];
  const total = items.length;
  const complete = items.filter((item) => cleanText(item.status) === "complete").length;
  const blocked = items.filter((item) => cleanText(item.status) === "blocked").length;
  const pending = Math.max(0, total - complete - blocked);
  return {
    total,
    complete,
    pending,
    blocked,
    percentComplete: total ? Math.round((complete / total) * 100) : 0,
  };
}
