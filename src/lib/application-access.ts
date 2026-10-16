/** Administrator-controlled application restriction. Never derive it from provider
 * user_metadata, session claims, request bodies, or client-visible role labels. */
export type ApplicationAccess =
  | { mode: "unrestricted" }
  | { mode: "blocked" }
  | { mode: "fte_only"; centerIds: readonly string[] };

export type ApplicationAccessPurpose = "fte_reporting" | "workspace_selection" | "account_security";

export function readApplicationAccess(customFields: unknown, role: string): ApplicationAccess {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)
      || !Object.hasOwn(customFields, "applicationAccess")) return { mode: "unrestricted" };
  const value = (customFields as Record<string, unknown>).applicationAccess;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { mode: "blocked" };
  const rule = value as Record<string, unknown>;
  if (role !== "CENTER_DIRECTOR" || rule.version !== 1 || rule.mode !== "fte_only"
      || !Array.isArray(rule.centerIds) || rule.centerIds.length < 1 || rule.centerIds.length > 100
      || Object.keys(rule).some((key) => !["version", "mode", "centerIds"].includes(key))) return { mode: "blocked" };
  if (rule.centerIds.some((id) => typeof id !== "string" || !id || id.length > 200 || /\s/.test(id))) return { mode: "blocked" };
  const centerIds = rule.centerIds as string[];
  if (new Set(centerIds).size !== centerIds.length) return { mode: "blocked" };
  return { mode: "fte_only", centerIds: [...centerIds] };
}

export function applicationAccessPurposeAllowed(access: ApplicationAccess, purpose?: ApplicationAccessPurpose) {
  if (access.mode === "unrestricted") return true;
  return access.mode === "fte_only" && (purpose === "fte_reporting" || purpose === "workspace_selection" || purpose === "account_security");
}

type ScopeGrant = {
  tenantId: string;
  scopeType: string;
  role?: string;
  centerId: string | null;
  brandId?: string | null;
  ownerGroupId?: string | null;
  organizationId?: string | null;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export function restrictedFteCenterIds(access: Extract<ApplicationAccess, { mode: "fte_only" }>, tenantId: string, grants: readonly ScopeGrant[], now: Date) {
  const at = now.getTime();
  if (!Number.isFinite(at)) return [];
  const activeDate = (value: Date | null | undefined, start: boolean) => value == null
    || (value instanceof Date && Number.isFinite(value.getTime()) && (start ? value.getTime() <= at : value.getTime() >= at));
  const granted = new Set(grants.filter((grant) => grant.isActive === true && grant.tenantId === tenantId
    && grant.scopeType === "CENTER" && grant.role === "CENTER_DIRECTOR" && grant.centerId
    && !grant.brandId && !grant.ownerGroupId && !grant.organizationId
    && activeDate(grant.startsAt, true) && activeDate(grant.endsAt, false)).map((grant) => grant.centerId));
  return access.centerIds.filter((id) => granted.has(id));
}

export function isFteOnlyUser(subject: unknown): subject is { applicationAccess: "fte_only" } {
  return Boolean(subject && typeof subject === "object" && (subject as { applicationAccess?: unknown }).applicationAccess === "fte_only");
}

/** An exact account-security return is allowed; all other user-controlled next
 * URLs collapse to the FTE landing page, including encoded/open redirects. */
export function restrictedFteNextPath(requested: unknown) {
  return requested === "/account/security" ? "/account/security" : "/fte-reports";
}
