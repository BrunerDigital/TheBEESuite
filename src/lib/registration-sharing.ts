import { registrationHandoffHref } from "@/lib/registration-handoff";

export const MAX_REGISTRATION_SHARE_RECIPIENTS = 20;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildRegistrationShareUrl(appBaseUrl: string, centerId: string) {
  const normalizedBaseUrl = appBaseUrl.trim().replace(/\/+$/, "");
  return new URL(registrationHandoffHref(centerId), `${normalizedBaseUrl}/`).toString();
}

export function parseRegistrationShareRecipients(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [clean(value)];
  const candidates = rawValues
    .flatMap((item) => item.split(/[\s,;]+/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const uniqueCandidates = Array.from(new Set(candidates));

  return {
    emails: uniqueCandidates.filter((email) => emailPattern.test(email)),
    invalidEmails: uniqueCandidates.filter((email) => !emailPattern.test(email)),
  };
}

export function buildRegistrationShareEmail({
  schoolLabel,
  registrationUrl,
  senderName,
  brandName,
}: {
  schoolLabel: string;
  registrationUrl: string;
  senderName?: string | null;
  brandName: string;
}) {
  const senderLine = senderName?.trim()
    ? `${senderName.trim()} from ${schoolLabel} invited you to complete the school's online registration and enrollment packet.`
    : `${schoolLabel} invited you to complete the school's online registration and enrollment packet.`;

  return {
    subject: `Registration and enrollment form - ${schoolLabel}`,
    text: [
      senderLine,
      "",
      "Open your school-specific form:",
      registrationUrl,
      "",
      `This link is connected directly to ${schoolLabel}, so your completed packet will be routed to that school's director dashboard for review.`,
      "",
      "Submitting the packet does not confirm enrollment. The school will follow up after reviewing it.",
      "",
      brandName,
    ].join("\n"),
  };
}

const registrationSuggestionStages = new Set([
  "TOUR_COMPLETED",
  "APPLICATION_SENT",
  "APPLICATION_STARTED",
]);

const registrationCompletedStages = new Set([
  "APPLICATION_SUBMITTED",
  "DOCUMENTS_PENDING",
  "DEPOSIT_PENDING",
  "ENROLLED",
  "WAITLISTED",
  "LOST_NOT_A_FIT",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function registrationInvitationFromLeadCustomFields(value: unknown) {
  const invitation = asRecord(asRecord(value).registrationInvitation);
  return {
    status: clean(invitation.status) || "not_sent",
    sentAt: clean(invitation.sentAt) || null,
    attemptedAt: clean(invitation.attemptedAt) || null,
    registrationUrl: clean(invitation.registrationUrl) || null,
  };
}

export function buildRegistrationLeadCustomFields(
  currentFields: unknown,
  input: {
    status: "sent" | "failed";
    attemptedAt: string;
    sentAt?: string | null;
    registrationUrl: string;
    sentByUserId: string;
    recipientCount: number;
  },
): Record<string, unknown> {
  return {
    ...asRecord(currentFields),
    registrationInvitation: {
      status: input.status,
      attemptedAt: input.attemptedAt,
      sentAt: input.sentAt ?? null,
      registrationUrl: input.registrationUrl,
      sentByUserId: input.sentByUserId,
      recipientCount: input.recipientCount,
    },
  };
}

export function stageAfterRegistrationShare(stage: string) {
  return registrationCompletedStages.has(stage) || stage === "APPLICATION_SENT" || stage === "APPLICATION_STARTED"
    ? stage
    : "APPLICATION_SENT";
}

export type RegistrationLeadSuggestion = {
  label: string;
  subject: string;
  body: string;
};

export function buildRegistrationLeadSuggestion({
  familyName,
  childName,
  program,
  schoolLabel,
  registrationUrl,
  stage,
  contextPrompt,
  customFields,
  brandName,
}: {
  familyName: string;
  childName?: string | null;
  program?: string | null;
  schoolLabel: string;
  registrationUrl: string;
  stage: string;
  contextPrompt?: string;
  customFields?: unknown;
  brandName: string;
}): RegistrationLeadSuggestion | null {
  if (registrationCompletedStages.has(stage)) return null;

  const explicitlyRequested = /\b(registration|application|enroll(?:ment)?|paperwork|form)\b/i.test(contextPrompt ?? "");
  if (!registrationSuggestionStages.has(stage) && !explicitlyRequested) return null;

  const invitation = registrationInvitationFromLeadCustomFields(customFields);
  const alreadySent = invitation.status === "sent" || stage === "APPLICATION_SENT" || stage === "APPLICATION_STARTED";
  const childLine = childName ? ` for ${childName}` : "";
  const programText = program || "childcare";
  const label = alreadySent ? "Registration reminder" : "Send registration form";
  const actionLine = alreadySent
    ? "Here is the school-specific registration form again:"
    : "When you are ready, please complete our school-specific registration and enrollment form:";

  return {
    label,
    subject: alreadySent
      ? `Registration reminder for ${schoolLabel}`
      : `Registration and enrollment form - ${schoolLabel}`,
    body: [
      `Hi ${familyName},`,
      "",
      `Thank you for your interest in ${programText}${childLine} at ${schoolLabel}.`,
      actionLine,
      registrationUrl,
      "",
      "This form is linked directly to this school. Submitting it sends the packet to the director for review and does not confirm enrollment.",
      "",
      "Thank you,",
      brandName,
    ].join("\n"),
  };
}
