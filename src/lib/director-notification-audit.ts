export const DIRECTOR_NOTIFICATION_ROLES = [
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "BILLING_ADMIN",
] as const;

export type DirectorNotificationRole = (typeof DIRECTOR_NOTIFICATION_ROLES)[number];

export type DirectorNotificationUser = {
  email: string | null;
  isActive: boolean | null;
  role: string | null;
};

export type DirectorNotificationCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId?: string | null;
  email: string | null;
  userAccessGrants?: Array<{
    isActive: boolean | null;
    role: string | null;
    user: Pick<DirectorNotificationUser, "email" | "isActive"> | null;
  }>;
  staff?: Array<{
    user: DirectorNotificationUser | null;
  }>;
};

export type DirectorNotificationAuditRow = {
  centerId: string;
  locationId: string;
  name: string;
  centerEmail: string;
  centerEmailValid: boolean;
  fallbackEmails: string[];
  recipients: string[];
  ready: boolean;
  warnings: string[];
};

export type DirectorNotificationAuditSummary = {
  activeSchools: number;
  ready: number;
  missing: number;
  centerEmailValid: number;
  fallbackAvailable: number;
  missingRows: DirectorNotificationAuditRow[];
};

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function normalizeDirectorNotificationEmail(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

export function isValidDirectorNotificationEmail(value: string | null | undefined) {
  const email = normalizeDirectorNotificationEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isKidCityEmail(value: string | null | undefined) {
  return normalizeDirectorNotificationEmail(value).endsWith("@kidcityusa.com");
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const value of values) {
    const email = normalizeDirectorNotificationEmail(value);
    if (!email || !isValidDirectorNotificationEmail(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return emails;
}

function hasDirectorNotificationRole(role: string | null | undefined) {
  return DIRECTOR_NOTIFICATION_ROLES.includes(role as DirectorNotificationRole);
}

function activeGrantFallbackEmails(center: DirectorNotificationCenter) {
  return uniqueEmails(
    (center.userAccessGrants ?? [])
      .filter((grant) => {
        return (
          grant.isActive &&
          hasDirectorNotificationRole(grant.role) &&
          grant.user?.isActive &&
          isKidCityEmail(grant.user.email)
        );
      })
      .map((grant) => grant.user?.email),
  );
}

function staffProfileFallbackEmails(center: DirectorNotificationCenter) {
  return uniqueEmails(
    (center.staff ?? [])
      .filter((staff) => {
        return (
          staff.user?.isActive &&
          hasDirectorNotificationRole(staff.user.role) &&
          isKidCityEmail(staff.user.email)
        );
      })
      .map((staff) => staff.user?.email),
  );
}

export function resolveDirectorNotificationAuditRow(
  center: DirectorNotificationCenter,
): DirectorNotificationAuditRow {
  const centerEmail = normalizeDirectorNotificationEmail(center.email);
  const centerEmailValid = isValidDirectorNotificationEmail(centerEmail);
  const grantFallbackEmails = activeGrantFallbackEmails(center);
  const staffFallbackEmails = staffProfileFallbackEmails(center);
  const fallbackEmails = grantFallbackEmails.length ? grantFallbackEmails : staffFallbackEmails;
  const recipients = centerEmailValid ? [centerEmail] : fallbackEmails.slice(0, 3);
  const warnings: string[] = [];

  if (center.email && !centerEmailValid) {
    warnings.push("center_email_invalid");
  }

  if (!centerEmailValid && fallbackEmails.length) {
    warnings.push("using_director_fallback");
  }

  if (!recipients.length) {
    warnings.push("missing_notification_recipient");
  }

  return {
    centerId: center.id,
    locationId: clean(center.crmLocationId) || clean(center.locationId) || center.name,
    name: center.name,
    centerEmail,
    centerEmailValid,
    fallbackEmails: fallbackEmails.slice(0, 3),
    recipients,
    ready: recipients.length > 0,
    warnings,
  };
}

export function summarizeDirectorNotificationAudit(
  rows: DirectorNotificationAuditRow[],
): DirectorNotificationAuditSummary {
  return {
    activeSchools: rows.length,
    ready: rows.filter((row) => row.ready).length,
    missing: rows.filter((row) => !row.ready).length,
    centerEmailValid: rows.filter((row) => row.centerEmailValid).length,
    fallbackAvailable: rows.filter((row) => row.fallbackEmails.length > 0).length,
    missingRows: rows.filter((row) => !row.ready),
  };
}
