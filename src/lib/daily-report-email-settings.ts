export const DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY = "dailyReportEmailRecipientGuardianIds";

export type DailyReportEmailGuardian = {
  id: string;
  fullName?: string | null;
  email?: string | null;
};

export type DailyReportEmailRecipient = {
  guardianId: string;
  name: string;
  email: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readDailyReportEmailRecipientGuardianIds(customFields: unknown): string[] | null {
  const fields = asRecord(customFields);
  if (!Object.prototype.hasOwnProperty.call(fields, DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY)) return null;
  return uniqueStrings(stringList(fields[DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY]));
}

export function dailyReportEmailRecipientGuardianIdsFromPayload(value: unknown) {
  return uniqueStrings(stringList(value));
}

export function resolveDailyReportEmailRecipientGuardianIds({
  customFields,
  guardians,
}: {
  customFields: unknown;
  guardians: DailyReportEmailGuardian[];
}) {
  const configuredGuardianIds = readDailyReportEmailRecipientGuardianIds(customFields);
  const emailGuardianIds = new Set(
    guardians
      .filter((guardian) => guardian.email && isEmail(guardian.email))
      .map((guardian) => guardian.id),
  );
  const ids = configuredGuardianIds ?? Array.from(emailGuardianIds);
  return ids.filter((id) => emailGuardianIds.has(id));
}

export function resolveDailyReportEmailRecipients({
  customFields,
  guardians,
}: {
  customFields: unknown;
  guardians: DailyReportEmailGuardian[];
}): DailyReportEmailRecipient[] {
  const selectedGuardianIds = new Set(resolveDailyReportEmailRecipientGuardianIds({ customFields, guardians }));
  const seenEmails = new Set<string>();
  return guardians
    .filter((guardian) => selectedGuardianIds.has(guardian.id))
    .flatMap((guardian) => {
      const email = guardian.email?.trim() ?? "";
      if (!isEmail(email)) return [];
      const emailKey = email.toLowerCase();
      if (seenEmails.has(emailKey)) return [];
      seenEmails.add(emailKey);
      return [{
        guardianId: guardian.id,
        name: guardian.fullName?.trim() || "Parent/guardian",
        email,
      }];
    });
}

export function dailyReportEmailRecipientCustomFields(customFields: unknown, guardianIds: string[]) {
  return {
    ...asRecord(customFields),
    [DAILY_REPORT_EMAIL_RECIPIENT_GUARDIAN_IDS_KEY]: uniqueStrings(guardianIds.map((id) => id.trim()).filter(Boolean)),
  };
}
