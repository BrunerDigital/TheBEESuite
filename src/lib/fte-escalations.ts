import type { FteExternalEscalationWindow } from "@/lib/fte-report-guardrails";

export type FteEscalationPhase = "open" | "due_soon" | "overdue";

export type FteEscalationRecipient = {
  id: string;
  role: string;
  email: string;
  phone?: string | null;
};

export type FteEscalationPreference = {
  userId: string | null;
  role: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
};

export type FteReminderCenterScope = {
  id: string;
  tenantId: string;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
};

export type FteReminderAccessGrant = {
  centerId?: string | null;
  scopeType: string;
};

export type FteReminderUserScope = {
  id: string;
  tenantId: string;
  role: string;
  profileCenterId?: string | null;
  accessGrants?: FteReminderAccessGrant[];
};

const schoolReminderRoles = new Set(["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function fteReminderCenterIdsForUser(
  user: FteReminderUserScope,
  centers: FteReminderCenterScope[],
) {
  if (!centers.length) return [];
  if (!schoolReminderRoles.has(user.role)) return [];

  const matchingCenterIds = new Set<string>();
  const profileCenterId = clean(user.profileCenterId);
  const accessGrants = user.accessGrants ?? [];

  if (profileCenterId) matchingCenterIds.add(profileCenterId);
  for (const grant of accessGrants) {
    if (clean(grant.scopeType).toUpperCase() === "CENTER" && clean(grant.centerId)) {
      matchingCenterIds.add(clean(grant.centerId));
    }
  }

  const missingCenterIds = new Set(centers.map((center) => center.id));
  return unique(Array.from(matchingCenterIds)).filter((centerId) => missingCenterIds.has(centerId));
}

export function shouldSendExternalFteEscalation(window: FteExternalEscalationWindow | null | undefined) {
  return Boolean(window);
}

export function resolveFteEscalationChannels(
  recipient: FteEscalationRecipient,
  preferences: FteEscalationPreference[],
) {
  const userPreference = preferences.find((preference) => preference.userId === recipient.id);
  const rolePreference = preferences.find((preference) => !preference.userId && preference.role === recipient.role);
  const preference = userPreference ?? rolePreference;

  return {
    email: preference?.emailEnabled ?? true,
    sms: preference?.smsEnabled ?? false,
  };
}

export function fteEscalationCopy(input: {
  centerName: string;
  weekLabel: string;
  phase: FteEscalationPhase;
  reminder: string;
  escalationLabel?: string | null;
}) {
  const subject = input.phase === "overdue"
    ? `FTE still needed: ${input.centerName} (${input.weekLabel})`
    : `Friendly FTE reminder: ${input.centerName} (${input.weekLabel})`;
  const opening = input.phase === "overdue"
    ? `Friday evening reminder: ${input.reminder}`
    : `Friendly reminder: ${input.reminder}`;
  const body = [
    opening,
    "",
    `Missing FTE report: ${input.centerName}`,
    `Reporting week: ${input.weekLabel}`,
    input.escalationLabel ? `Escalation checkpoint: ${input.escalationLabel}` : "",
    "",
    "Please submit the weekly FTE report in The BEE Suite so operations has the current enrollment count.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
  const sms = `${subject}. Please submit the weekly FTE report in The BEE Suite.`;

  return { subject, body, sms };
}
