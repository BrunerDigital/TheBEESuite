export type WorkspaceVisualDomain =
  | "operations"
  | "executive"
  | "enrollment"
  | "classroom"
  | "billing"
  | "compliance"
  | "communication"
  | "family"
  | "kiosk";

const routeDomains: Array<[WorkspaceVisualDomain, readonly string[]]> = [
  ["kiosk", ["/check-in", "/kiosk", "/authorized-pickup"]],
  ["family", ["/parent-portal", "/parent-", "/parents"]],
  ["billing", ["/billing", "/corporate-billing", "/payment", "/tuition", "/stripe", "/terminal"]],
  ["compliance", ["/compliance", "/documents", "/incidents", "/medication", "/licensing", "/audit"]],
  ["classroom", ["/teacher", "/classroom", "/attendance", "/daily-reports", "/lessons"]],
  ["enrollment", ["/crm", "/pipeline", "/tours", "/waitlist", "/registration", "/enrollment", "/campaigns", "/automations"]],
  ["communication", ["/messages", "/notifications", "/announcements"]],
  ["executive", ["/executives", "/multi-location", "/analytics", "/team-permissions", "/data-readiness"]],
  ["operations", ["/center-dashboard", "/fte", "/staff", "/payroll", "/school-setup", "/operations"]],
];

const executiveRoles = new Set([
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "READ_ONLY_AUDITOR",
]);

export function workspaceVisualDomain(pathname: string, role?: string): WorkspaceVisualDomain {
  const normalizedPath = pathname.toLowerCase();

  for (const [domain, prefixes] of routeDomains) {
    if (prefixes.some((prefix) => normalizedPath.includes(prefix))) return domain;
  }

  if (role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP") return "family";
  if (role === "TEACHER") return "classroom";
  if (role === "BILLING_ADMIN") return "billing";
  if (role && executiveRoles.has(role)) return "executive";
  return "operations";
}
