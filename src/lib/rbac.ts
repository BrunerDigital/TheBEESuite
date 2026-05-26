import type { ModuleSlug } from "@/lib/demo-data";

export const executiveRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "READ_ONLY_AUDITOR"]);

type AccessSubject =
  | string
  | null
  | undefined
  | {
      role?: string | null;
      accessScope?: string | null;
      centerIds?: string[] | null;
    };

const enrollmentRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN", "READ_ONLY_AUDITOR"]);
const schoolAdminRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "READ_ONLY_AUDITOR"]);
const classroomRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "TEACHER", "READ_ONLY_AUDITOR"]);
const billingRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN", "READ_ONLY_AUDITOR"]);
const parentRoles = new Set(["PARENT_GUARDIAN"]);

const executiveOnlyModules = new Set<ModuleSlug>([
  "multi-location-dashboard",
  "agency-admin",
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
]);

const classroomModules = new Set<ModuleSlug>([
  "classroom-dashboard",
  "attendance",
  "daily-reports",
  "incident-reports",
  "staff",
  "teacher-portal",
]);

const billingModules = new Set<ModuleSlug>([
  "billing-invoices",
  "payments",
  "billing-settings",
]);

const parentModules = new Set<ModuleSlug>([
  "parent-portal",
  "messages",
  "documents",
  "billing-invoices",
  "payments",
  "notifications",
  "help",
]);

export function isExecutiveRole(role?: string | null) {
  return Boolean(role && executiveRoles.has(role));
}

function getRole(subject: AccessSubject) {
  return typeof subject === "string" || subject == null ? subject : subject.role;
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
  if (executiveOnlyModules.has(slug as ModuleSlug)) return hasTenantWideUiAccess(subject);
  if (hasTenantWideUiAccess(subject)) return true;
  if (parentRoles.has(role)) return parentModules.has(slug as ModuleSlug);
  if (enrollmentModules.has(slug as ModuleSlug)) return enrollmentRoles.has(role);
  if (schoolAdminModules.has(slug as ModuleSlug)) return schoolAdminRoles.has(role);
  if (classroomModules.has(slug as ModuleSlug)) return classroomRoles.has(role);
  if (billingModules.has(slug as ModuleSlug)) return billingRoles.has(role);
  return false;
}

export function dashboardLensesForRole(subject: AccessSubject) {
  const role = getRole(subject);
  if (!hasTenantWideUiAccess(subject)) {
    if (role === "TEACHER") return ["teacher"] as const;
    if (role === "PARENT_GUARDIAN") return ["parent"] as const;
    return ["director"] as const;
  }
  if (role === "PLATFORM_OWNER") return ["platform", "brand", "regional", "director"] as const;
  if (role === "BRAND_ADMIN") return ["brand", "regional", "director"] as const;
  if (role === "REGIONAL_MANAGER" || role === "READ_ONLY_AUDITOR") return ["regional", "director"] as const;
  return ["director"] as const;
}
