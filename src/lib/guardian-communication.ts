export const guardianCommunicationOptions = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "sms", label: "Text message" },
] as const;

export type GuardianCommunicationPreference = (typeof guardianCommunicationOptions)[number]["value"];

const aliases: Record<string, GuardianCommunicationPreference> = {
  email: "email",
  "e-mail": "email",
  "email + portal notification": "email",
  phone: "phone",
  call: "phone",
  "phone call": "phone",
  sms: "sms",
  text: "sms",
  "text message": "sms",
};

export function parseGuardianCommunicationPreference(value: unknown): GuardianCommunicationPreference | null {
  if (typeof value !== "string") return null;
  return aliases[value.trim().toLowerCase()] ?? null;
}

export function guardianCommunicationPreferenceOrDefault(
  value: unknown,
  fallback: GuardianCommunicationPreference = "email",
) {
  return parseGuardianCommunicationPreference(value) ?? fallback;
}
