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
  tenantId?: string | null;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
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

const executiveReminderRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function grantMatchesCenter(grant: FteReminderAccessGrant, center: FteReminderCenterScope, fallbackTenantId: string) {
  const scopeType = clean(grant.scopeType).toUpperCase();
  if (scopeType === "CENTER") return clean(grant.centerId) === center.id;
  if (scopeType === "TENANT") return (clean(grant.tenantId) || fallbackTenantId) === center.tenantId;
  if (scopeType === "BRAND") return Boolean(grant.brandId && grant.brandId === center.brandId);
  if (scopeType === "ORGANIZATION") return Boolean(grant.organizationId && grant.organizationId === center.organizationId);
  if (scopeType === "OWNER_GROUP") return Boolean(grant.ownerGroupId && grant.ownerGroupId === center.ownerGroupId);
  return false;
}

export function fteReminderCenterIdsForUser(
  user: FteReminderUserScope,
  centers: FteReminderCenterScope[],
) {
  if (!centers.length) return [];
  if (user.role === "PLATFORM_OWNER") return centers.map((center) => center.id);

  const matchingCenterIds = new Set<string>();
  const profileCenterId = clean(user.profileCenterId);
  const accessGrants = user.accessGrants ?? [];

  if (profileCenterId) matchingCenterIds.add(profileCenterId);
  for (const grant of accessGrants) {
    if (clean(grant.scopeType).toUpperCase() === "CENTER" && clean(grant.centerId)) {
      matchingCenterIds.add(clean(grant.centerId));
    }
  }

  if (executiveReminderRoles.has(user.role) && !profileCenterId) {
    const broadGrants = accessGrants.filter((grant) => clean(grant.scopeType).toUpperCase() !== "CENTER");
    const broadCenters = broadGrants.length
      ? centers.filter((center) => broadGrants.some((grant) => grantMatchesCenter(grant, center, user.tenantId)))
      : accessGrants.length
        ? []
        : centers.filter((center) => center.tenantId === user.tenantId);
    for (const center of broadCenters) matchingCenterIds.add(center.id);
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
