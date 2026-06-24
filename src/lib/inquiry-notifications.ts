import { uniqueInquiryEmails } from "@/lib/inquiry-integrations";

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function kidCityEmails(values: Array<string | null | undefined>) {
  return values
    .map(normalizeEmail)
    .filter((email) => email.endsWith("@kidcityusa.com"));
}

export function resolveInquiryLocationNotificationEmails({
  centerEmail,
  userAccessGrantEmails = [],
  staffProfileEmails = [],
}: {
  centerEmail?: string | null;
  userAccessGrantEmails?: Array<string | null | undefined>;
  staffProfileEmails?: Array<string | null | undefined>;
}) {
  const centerRecipients = uniqueInquiryEmails([normalizeEmail(centerEmail)]);
  if (centerRecipients.length) return centerRecipients.slice(0, 1);

  const grantRecipients = uniqueInquiryEmails(kidCityEmails(userAccessGrantEmails));
  if (grantRecipients.length) return grantRecipients.slice(0, 3);

  return uniqueInquiryEmails(kidCityEmails(staffProfileEmails)).slice(0, 3);
}
