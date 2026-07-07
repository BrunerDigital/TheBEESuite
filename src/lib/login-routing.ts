export const DEFAULT_LOGIN_NEXT_PATH = "/dashboard";
export const PARENT_LOGIN_NEXT_PATH = "/parent-portal";
export const TEACHER_LOGIN_NEXT_PATH = "/teacher-portal";
export const CLASSROOM_LOGIN_NEXT_PATH = "/classroom-dashboard";
export const PARENT_LOGIN_ENTRY_PATH = "/parents";
export const TEACHER_LOGIN_ENTRY_PATH = "/teachers";
export const DIRECTOR_LOGIN_ENTRY_PATH = "/directors";
export const EXECUTIVE_LOGIN_ENTRY_PATH = "/executives";
export const GENERAL_LOGIN_ENTRY_PATH = "/login";

export type LoginPortal = "general" | "parents" | "teachers" | "directors" | "executives";

const parentLoginRoles = new Set(["PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]);
const parentAllowedNextPrefixes = ["/parent-portal", "/messages", "/documents", "/notifications", "/help"];
const teacherLoginRoles = new Set(["TEACHER"]);
const teacherAllowedNextPrefixes = ["/teacher-portal", "/classroom-dashboard", "/attendance", "/daily-reports", "/incident-reports", "/messages", "/documents", "/notifications", "/help"];
const classroomLoginRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "READ_ONLY_AUDITOR"]);
const executiveLoginRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "READ_ONLY_AUDITOR"]);
const directorLoginRoles = new Set(["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN"]);
const roleLoginEntryPaths = new Set([
  PARENT_LOGIN_ENTRY_PATH,
  TEACHER_LOGIN_ENTRY_PATH,
  DIRECTOR_LOGIN_ENTRY_PATH,
  EXECUTIVE_LOGIN_ENTRY_PATH,
]);

export function firstSearchParam(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function safeLoginNextPath(value: unknown, fallback = DEFAULT_LOGIN_NEXT_PATH) {
  const path = typeof firstSearchParam(value) === "string" ? firstSearchParam(value) as string : fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return fallback;
  const pathname = path.split("?")[0].split("#")[0];
  if (
    roleLoginEntryPaths.has(pathname) ||
    Array.from(roleLoginEntryPaths).some((entryPath) => pathname.startsWith(`${entryPath}/`))
  ) {
    return fallback;
  }
  return path;
}

export function isParentLoginRole(role?: string | null) {
  return Boolean(role && parentLoginRoles.has(role));
}

export function isTeacherLoginRole(role?: string | null) {
  return Boolean(role && teacherLoginRoles.has(role));
}

function isAllowedNextPath(nextPath: string, allowedPrefixes: string[]) {
  return allowedPrefixes.some((prefix) => nextPath === prefix || nextPath.startsWith(`${prefix}/`) || nextPath.startsWith(`${prefix}#`));
}

function isTeacherPortalPath(nextPath: string) {
  return nextPath === TEACHER_LOGIN_NEXT_PATH || nextPath.startsWith(`${TEACHER_LOGIN_NEXT_PATH}/`) || nextPath.startsWith(`${TEACHER_LOGIN_NEXT_PATH}#`);
}

function isParentPortalPath(nextPath: string) {
  return nextPath === PARENT_LOGIN_NEXT_PATH || nextPath.startsWith(`${PARENT_LOGIN_NEXT_PATH}/`) || nextPath.startsWith(`${PARENT_LOGIN_NEXT_PATH}#`);
}

export function defaultNextPathForLoginPortal(portal: LoginPortal) {
  if (portal === "parents") return PARENT_LOGIN_NEXT_PATH;
  if (portal === "teachers") return TEACHER_LOGIN_NEXT_PATH;
  return DEFAULT_LOGIN_NEXT_PATH;
}

export function homePathForRole(role?: string | null) {
  if (isParentLoginRole(role)) return PARENT_LOGIN_NEXT_PATH;
  if (isTeacherLoginRole(role)) return TEACHER_LOGIN_NEXT_PATH;
  return DEFAULT_LOGIN_NEXT_PATH;
}

export function loginEntryPathForRole(role?: string | null) {
  if (isParentLoginRole(role)) return PARENT_LOGIN_ENTRY_PATH;
  if (isTeacherLoginRole(role)) return TEACHER_LOGIN_ENTRY_PATH;
  if (role && executiveLoginRoles.has(role)) return EXECUTIVE_LOGIN_ENTRY_PATH;
  if (role && directorLoginRoles.has(role)) return DIRECTOR_LOGIN_ENTRY_PATH;
  return GENERAL_LOGIN_ENTRY_PATH;
}

export function loginEntryPathForNextPath(value: unknown) {
  const nextPath = safeLoginNextPath(value);
  if (isParentPortalPath(nextPath)) return PARENT_LOGIN_ENTRY_PATH;
  if (
    isTeacherPortalPath(nextPath) ||
    nextPath.startsWith("/classroom-dashboard") ||
    nextPath.startsWith("/attendance") ||
    nextPath.startsWith("/daily-reports") ||
    nextPath.startsWith("/incident-reports")
  ) {
    return TEACHER_LOGIN_ENTRY_PATH;
  }
  if (
    nextPath.startsWith("/multi-location-dashboard") ||
    nextPath.startsWith("/developer-dashboard") ||
    nextPath.startsWith("/white-label") ||
    nextPath.startsWith("/integrations") ||
    nextPath.startsWith("/corporate-billing")
  ) {
    return EXECUTIVE_LOGIN_ENTRY_PATH;
  }
  if (nextPath.startsWith("/dashboard") || nextPath.startsWith("/crm-leads") || nextPath.startsWith("/check-in")) {
    return DIRECTOR_LOGIN_ENTRY_PATH;
  }
  return GENERAL_LOGIN_ENTRY_PATH;
}

export function loginHrefForNextPath(value: unknown, role?: string | null) {
  const nextPath = safeLoginNextPath(value);
  const entryPath = role ? loginEntryPathForRole(role) : loginEntryPathForNextPath(nextPath);
  return `${entryPath}?next=${encodeURIComponent(nextPath)}`;
}

export function normalizeLoginPortal(value: unknown): LoginPortal {
  const portal = typeof value === "string" ? value.trim().toLowerCase() : "";
  return portal === "parents" || portal === "teachers" || portal === "directors" || portal === "executives"
    ? portal
    : "general";
}

export function resolvePostLoginPath({
  requestedNext,
  role,
}: {
  requestedNext?: unknown;
  role?: string | null;
}) {
  const nextPath = safeLoginNextPath(requestedNext);
  if (isParentLoginRole(role)) {
    if (isAllowedNextPath(nextPath, parentAllowedNextPrefixes)) {
      return nextPath;
    }
    return PARENT_LOGIN_NEXT_PATH;
  }
  if (isTeacherLoginRole(role)) {
    if (isAllowedNextPath(nextPath, teacherAllowedNextPrefixes)) {
      return nextPath;
    }
    return TEACHER_LOGIN_NEXT_PATH;
  }
  if (isParentPortalPath(nextPath) && !(role && executiveLoginRoles.has(role))) {
    return homePathForRole(role);
  }
  if (isTeacherPortalPath(nextPath)) {
    return role && classroomLoginRoles.has(role) ? CLASSROOM_LOGIN_NEXT_PATH : DEFAULT_LOGIN_NEXT_PATH;
  }
  return nextPath;
}

export function resolvePortalPostLoginPath({
  portal,
  requestedNext,
  role,
}: {
  portal?: unknown;
  requestedNext?: unknown;
  role?: string | null;
}) {
  const normalizedPortal = normalizeLoginPortal(portal);
  const nextPath = resolvePostLoginPath({ role, requestedNext });
  if (normalizedPortal === "general") return nextPath;
  if (normalizedPortal === "parents") return isParentLoginRole(role) ? nextPath : homePathForRole(role);
  if (normalizedPortal === "teachers") return isTeacherLoginRole(role) ? nextPath : homePathForRole(role);
  if (normalizedPortal === "executives") return role && executiveLoginRoles.has(role) ? nextPath : homePathForRole(role);
  if (normalizedPortal === "directors") {
    return role && (directorLoginRoles.has(role) || executiveLoginRoles.has(role)) ? nextPath : homePathForRole(role);
  }
  return nextPath;
}
