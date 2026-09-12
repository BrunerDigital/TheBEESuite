import { createHash } from "node:crypto";

export const schoolBusinessProfileFields = [
  "name",
  "address",
  "city",
  "state",
  "postalCode",
  "phone",
  "email",
  "timezone",
  "licensedCapacity",
] as const;

export type SchoolBusinessProfileField = (typeof schoolBusinessProfileFields)[number];

export type SchoolBusinessProfile = {
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

export type SchoolBusinessProfileConfirmation = {
  complete: boolean;
  confirmationCurrent: boolean;
  status: "awaiting_school_confirmation" | "school_confirmed";
  revision: string;
  missingFields: SchoolBusinessProfileField[];
  confirmedAt: string | null;
  confirmedByEmail: string | null;
  legacyConfirmation: boolean;
};

const fieldLabels: Record<SchoolBusinessProfileField, string> = {
  name: "school name",
  address: "street address",
  city: "city",
  state: "state or region",
  postalCode: "postal code",
  phone: "main phone",
  email: "school email",
  timezone: "timezone",
  licensedCapacity: "licensed capacity",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength = 500) {
  return cleanText(value, maxLength) || null;
}

function normalizedCapacity(value: unknown) {
  const raw = typeof value === "number" ? String(value) : cleanText(value, 20);
  const capacity = raw && !/^\d+$/.test(raw) ? Number.NaN : Number(raw || 0);
  return Number.isInteger(capacity) && capacity >= 0 && capacity <= 10_000 ? capacity : Number.NaN;
}

export function normalizeSchoolBusinessProfile(value: unknown): SchoolBusinessProfile {
  const input = record(value);
  return {
    name: cleanText(input.name, 200),
    address: cleanText(input.address, 300),
    city: cleanText(input.city, 150),
    state: cleanText(input.state, 100).toUpperCase(),
    postalCode: cleanText(input.postalCode, 30),
    phone: cleanText(input.phone, 50),
    email: cleanText(input.email, 320).toLowerCase(),
    timezone: cleanText(input.timezone, 100),
    licensedCapacity: normalizedCapacity(input.licensedCapacity),
  };
}

export function schoolBusinessProfileFieldLabel(field: SchoolBusinessProfileField) {
  return fieldLabels[field];
}

export function completedSchoolBusinessProfileFields(profileValue: unknown) {
  const profile = normalizeSchoolBusinessProfile(profileValue);
  return schoolBusinessProfileFields.filter((field) => (
    field === "licensedCapacity" ? profile.licensedCapacity > 0 : Boolean(profile[field])
  ));
}

export function missingSchoolBusinessProfileFields(profileValue: unknown) {
  const completed = new Set(completedSchoolBusinessProfileFields(profileValue));
  return schoolBusinessProfileFields.filter((field) => !completed.has(field));
}

export function schoolBusinessProfileRevision(profileValue: unknown) {
  const profile = normalizeSchoolBusinessProfile(profileValue);
  const digest = createHash("sha256")
    .update(JSON.stringify({ version: 1, ...profile }))
    .digest("hex");
  return `school-business-profile:v1:${digest}`;
}

export function readSchoolBusinessProfileConfirmation(
  customFieldsValue: unknown,
  profileValue: unknown,
): SchoolBusinessProfileConfirmation {
  const customFields = record(customFieldsValue);
  const receipt = record(customFields.setupPreparationReceipt);
  const revision = schoolBusinessProfileRevision(profileValue);
  const missingFields = missingSchoolBusinessProfileFields(profileValue);
  const complete = missingFields.length === 0;
  const status = receipt.status === "school_confirmed"
    ? "school_confirmed" as const
    : "awaiting_school_confirmation" as const;
  const confirmedRevision = cleanText(receipt.confirmedBusinessProfileRevision, 200);
  const legacyConfirmation = complete && status === "school_confirmed" && !confirmedRevision;
  const confirmationCurrent = complete
    && status === "school_confirmed"
    && (confirmedRevision === revision || legacyConfirmation);

  return {
    complete,
    confirmationCurrent,
    status,
    revision,
    missingFields,
    confirmedAt: nullableText(receipt.confirmedAt, 100),
    confirmedByEmail: nullableText(receipt.confirmedByEmail, 320),
    legacyConfirmation,
  };
}

export function buildSchoolBusinessProfilePreparationReceipt(input: {
  existingReceipt: unknown;
  previousProfile: unknown;
  nextProfile: unknown;
  confirm: boolean;
  savedAt: string;
  savedByEmail?: string | null;
  savedByUserId?: string | null;
  savedByRole?: string | null;
}) {
  const existingReceipt = record(input.existingReceipt);
  const previousConfirmation = readSchoolBusinessProfileConfirmation(
    { setupPreparationReceipt: existingReceipt },
    input.previousProfile,
  );
  const nextProfile = normalizeSchoolBusinessProfile(input.nextProfile);
  const preparedFields = completedSchoolBusinessProfileFields(nextProfile);
  const missingBusinessFields = missingSchoolBusinessProfileFields(nextProfile);
  const revision = schoolBusinessProfileRevision(nextProfile);
  const storedConfirmedRevision = cleanText(existingReceipt.confirmedBusinessProfileRevision, 200);
  const exactRevisionWasConfirmed = storedConfirmedRevision === revision;
  const unchangedLegacyConfirmation = previousConfirmation.legacyConfirmation
    && previousConfirmation.revision === revision;
  const confirmationCurrent = missingBusinessFields.length === 0
    && (input.confirm || exactRevisionWasConfirmed || unchangedLegacyConfirmation);
  const newConfirmation = input.confirm && confirmationCurrent;
  const confirmedAt = newConfirmation
    ? input.savedAt
    : nullableText(existingReceipt.confirmedAt, 100);
  const confirmedByEmail = newConfirmation
    ? input.savedByEmail ?? null
    : nullableText(existingReceipt.confirmedByEmail, 320);
  const confirmedByUserId = newConfirmation
    ? input.savedByUserId ?? null
    : nullableText(existingReceipt.confirmedByUserId);
  const confirmedByRole = newConfirmation
    ? input.savedByRole ?? null
    : nullableText(existingReceipt.confirmedByRole, 100);

  return {
    ...existingReceipt,
    version: 2,
    source: existingReceipt.source ?? "authorized_business_information",
    preparedAt: existingReceipt.preparedAt ?? input.savedAt,
    preparedFields,
    missingBusinessFields,
    excludedFields: ["payout_bank", "family_data", "child_data"],
    preparedBusinessProfileRevision: revision,
    status: confirmationCurrent ? "school_confirmed" : "awaiting_school_confirmation",
    confirmedBusinessProfileRevision: confirmationCurrent
      ? revision
      : storedConfirmedRevision || null,
    confirmedAt,
    confirmedByEmail,
    confirmedByUserId,
    confirmedByRole,
  };
}
