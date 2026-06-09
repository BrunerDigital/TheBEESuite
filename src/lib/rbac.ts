import type { ModuleSlug } from "@/lib/demo-data";

export const executiveRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "READ_ONLY_AUDITOR"]);

type AccessSubject =
  | string
  | null
  | undefined
  | {
      role?: string | null;
      email?: string | null;
      accessScope?: string | null;
      centerIds?: string[] | null;
    };

const enrollmentRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"]);
const schoolAdminRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "READ_ONLY_AUDITOR"]);
const classroomRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "TEACHER", "READ_ONLY_AUDITOR"]);
const billingRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN", "READ_ONLY_AUDITOR"]);
const parentRoles = new Set(["PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]);

const executiveOnlyModules = new Set<ModuleSlug>([
  "multi-location-dashboard",
  "agency-admin",
  "developer-dashboard",
  "white-label",
  "integrations",
]);

const enrollmentModules = new Set<ModuleSlug>([
  "crm-leads",
  "enrollment-pipeline",
  "tours",
  "waitlist",
  "campaigns",
  "automations",
]);

const schoolAdminModules = new Set<ModuleSlug>([
  "center-dashboard",
  "school-setup",
  "calendar",
  "fte-reports",
  "family-detail",
  "child-profile",
  "messages",
  "announcements",
  "parent-media-review",
  "forms",
  "documents",
  "compliance",
  "analytics",
  "reputation",
  "team-permissions",
  "audit-logs",
  "ai-command",
  "staff",
]);

const classroomModules = new Set<ModuleSlug>([
  "classroom-dashboard",
  "attendance",
  "daily-reports",
  "incident-reports",
  "messages",
  "documents",
  "teacher-portal",
]);

const billingModules = new Set<ModuleSlug>([
  "messages",
  "billing-invoices",
  "payments",
  "billing-settings",
]);

const corporateBillingEmails = new Set(["accounting@kidcityusa.com"]);

const parentGuardianModules = new Set<ModuleSlug>([
  "parent-portal",
  "messages",
  "documents",
  "billing-invoices",
  "payments",
  "notifications",
  "help",
]);

const authorizedPickupModules = new Set<ModuleSlug>([
  "parent-portal",
  "notifications",
  "help",
]);

const readOnlyAuditorModules = new Set<ModuleSlug>([
  "multi-location-dashboard",
  "center-dashboard",
  "fte-reports",
  "family-detail",
  "child-profile",
  "billing-invoices",
  "documents",
  "compliance",
  "analytics",
  "audit-logs",
]);

export function isExecutiveRole(role?: string | null) {
  return Boolean(role && executiveRoles.has(role));
}

function getRole(subject: AccessSubject) {
  return typeof subject === "string" || subject == null ? subject : subject.role;
}

function getEmail(subject: AccessSubject) {
  return typeof subject === "string" || subject == null ? null : subject.email?.toLowerCase() ?? null;
}

function hasTenantWideUiAccess(subject: AccessSubject) {
  const role = getRole(subject);
  if (role === "PLATFORM_OWNER") return true;
  if (!isExecutiveRole(role)) return false;
  if (typeof subject === "string" || subject == null) return false;
  return subject.accessScope === "tenant" || subject.accessScope === "platform";
}

export function canAccessModule(subject: AccessSubject, slug: string) {
  const role = getRole(subject);
  if (!role) return false;
  if (slug === "dashboard" || slug === "notifications" || slug === "help") return true;
  if (slug === "login" || slug === "forgot-password" || slug === "onboarding") return true;
  if (slug === "parent-portal") return role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP";
  if (slug === "teacher-portal") return role === "TEACHER";
  if (role === "READ_ONLY_AUDITOR") return readOnlyAuditorModules.has(slug as ModuleSlug);
  if (slug === "corporate-billing") return hasTenantWideUiAccess(subject) || corporateBillingEmails.has(getEmail(subject) ?? "");
  if (executiveOnlyModules.has(slug as ModuleSlug)) return hasTenantWideUiAccess(subject);
  if (hasTenantWideUiAccess(subject)) return true;
  if (role === "AUTHORIZED_PICKUP") return authorizedPickupModules.has(slug as ModuleSlug);
  if (role === "PARENT_GUARDIAN") return parentGuardianModules.has(slug as ModuleSlug);
  if (parentRoles.has(role)) return false;
  if (enrollmentModules.has(slug as ModuleSlug) && enrollmentRoles.has(role)) return true;
  if (schoolAdminModules.has(slug as ModuleSlug) && schoolAdminRoles.has(role)) return true;
  if (classroomModules.has(slug as ModuleSlug) && classroomRoles.has(role)) return true;
  if (billingModules.has(slug as ModuleSlug) && billingRoles.has(role)) return true;
  return false;
}

export function dashboardLensesForRole(subject: AccessSubject) {
  const role = getRole(subject);
  if (role === "READ_ONLY_AUDITOR") return ["regional"] as const;
  if (!hasTenantWideUiAccess(subject)) {
    if (role === "TEACHER") return ["teacher"] as const;
    if (role === "PARENT_GUARDIAN") return ["parent"] as const;
    if (role === "AUTHORIZED_PICKUP") return ["pickup"] as const;
    if (role === "BILLING_ADMIN") return ["billing"] as const;
    return ["director"] as const;
  }
  if (role === "PLATFORM_OWNER") return ["platform", "brand", "regional", "director"] as const;
  if (role === "BRAND_ADMIN") return ["brand", "regional", "director"] as const;
  if (role === "REGIONAL_MANAGER") return ["regional", "director"] as const;
  return ["director"] as const;
}
