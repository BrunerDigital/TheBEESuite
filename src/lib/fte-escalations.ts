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

export function shouldSendExternalFteEscalation(phase: FteEscalationPhase) {
  return phase === "due_soon" || phase === "overdue";
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
}) {
  const urgency = input.phase === "overdue" ? "Overdue" : "Due soon";
  const subject = `FTE ${urgency}: ${input.centerName} (${input.weekLabel})`;
  const body = [
    input.reminder,
    "",
    `Missing FTE report: ${input.centerName}`,
    `Reporting week: ${input.weekLabel}`,
    "",
    "Please submit the weekly FTE report in The BEE Suite so operations has the current enrollment count.",
  ].join("\n");
  const sms = `${subject}. Submit the weekly FTE report in The BEE Suite.`;

  return { subject, body, sms };
}
