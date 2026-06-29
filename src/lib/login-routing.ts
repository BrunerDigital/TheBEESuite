export const DEFAULT_LOGIN_NEXT_PATH = "/dashboard";
export const PARENT_LOGIN_NEXT_PATH = "/parent-portal";
export const TEACHER_LOGIN_NEXT_PATH = "/teacher-portal";
export const CLASSROOM_LOGIN_NEXT_PATH = "/classroom-dashboard";

const parentLoginRoles = new Set(["PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]);
const parentAllowedNextPrefixes = ["/parent-portal", "/messages", "/documents", "/notifications", "/help"];
const teacherLoginRoles = new Set(["TEACHER"]);
const teacherAllowedNextPrefixes = ["/teacher-portal", "/classroom-dashboard", "/attendance", "/daily-reports", "/incident-reports", "/messages", "/documents", "/notifications", "/help"];
const classroomLoginRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "READ_ONLY_AUDITOR"]);

export function firstSearchParam(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function safeLoginNextPath(value: unknown, fallback = DEFAULT_LOGIN_NEXT_PATH) {
  const path = typeof firstSearchParam(value) === "string" ? firstSearchParam(value) as string : fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return fallback;
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
  if (isTeacherPortalPath(nextPath)) {
    return role && classroomLoginRoles.has(role) ? CLASSROOM_LOGIN_NEXT_PATH : DEFAULT_LOGIN_NEXT_PATH;
  }
  return nextPath;
}
