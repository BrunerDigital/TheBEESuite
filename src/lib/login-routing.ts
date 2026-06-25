export const DEFAULT_LOGIN_NEXT_PATH = "/dashboard";
export const PARENT_LOGIN_NEXT_PATH = "/parent-portal";

const parentLoginRoles = new Set(["PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]);
const parentAllowedNextPrefixes = ["/parent-portal", "/messages", "/documents", "/notifications", "/help"];

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

export function resolvePostLoginPath({
  requestedNext,
  role,
}: {
  requestedNext?: unknown;
  role?: string | null;
}) {
  const nextPath = safeLoginNextPath(requestedNext);
  if (!isParentLoginRole(role)) return nextPath;
  if (parentAllowedNextPrefixes.some((prefix) => nextPath === prefix || nextPath.startsWith(`${prefix}/`) || nextPath.startsWith(`${prefix}#`))) {
    return nextPath;
  }
  return PARENT_LOGIN_NEXT_PATH;
}
