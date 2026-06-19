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
