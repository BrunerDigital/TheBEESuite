import { UserRole } from "@prisma/client";

export const AI_COMMAND_MODEL = process.env.OPENAI_AI_COMMAND_MODEL?.trim() || "gpt-5.6-sol";

export const aiCommandMutationRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

export const AI_COMMAND_MUTATION_BOUNDARY =
  "You may use only the director dashboard actions exposed by the tools for the selected school. Never change access, roles, authentication, invitations, PINs, submit or refund payments, change payouts or autopay, send messages, delete or merge records, or change external providers.";

export function cleanAiPatch(input: unknown, allowedFields: readonly string[]) {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return Object.fromEntries(
    allowedFields
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, typeof source[field] === "string" ? source[field].trim() : source[field]]),
  );
}

export const familyAiFields = ["name", "address", "billingEmail", "notes"] as const;
export const guardianAiFields = ["fullName", "email", "phone", "employer", "relation", "preferredCommunication", "isBillingContact"] as const;
export const childAiFields = ["fullName", "preferredName", "dateOfBirth", "ageGroup", "startDate", "photoVideoPermission", "fieldTripPermission", "napNotes", "feedingNotes", "pottyNotes", "developmentalNotes"] as const;
export const schoolAiFields = ["address", "city", "state", "postalCode", "phone", "email", "timezone", "licensedCapacity"] as const;
export const invoiceAiFields = ["amountCents", "dueDate", "description"] as const;
export const enrollmentAiFields = ["enrollmentStatus", "classroomId"] as const;
export const tuitionAiFields = ["amountCents", "tuitionPlanId", "billingStartPeriod", "description", "enabled"] as const;

export const AI_COMMAND_MAX_BULK_RECORDS = 250;

export function aiCommandRecordIds(args: Record<string, unknown>) {
  const ids = [
    typeof args.recordId === "string" ? args.recordId.trim() : "",
    ...(Array.isArray(args.recordIds) ? args.recordIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()) : []),
  ].filter(Boolean);
  return [...new Set(ids)].slice(0, AI_COMMAND_MAX_BULK_RECORDS + 1);
}
