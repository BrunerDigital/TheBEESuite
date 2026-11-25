import { canManageBilling, canManageOperations, requiresPasswordResetGate, type CurrentUser } from "./auth";
import { canAccessModule } from "./rbac";

// Server-only opt-in. No public environment flag, URL parameter or browser state
// can activate this candidate. Enabling it requires a separately reviewed rollout.
export function schoolPaymentsReadonlyEnabled(env: Record<string, string | undefined> = process.env) {
  return env.BEE_SCHOOL_PAYMENTS_READONLY === "enabled";
}

export function canOpenSchoolPaymentsReadonly(user: CurrentUser | null) {
  return Boolean(user && user.deviceSessionId && !requiresPasswordResetGate(user)
    && canAccessModule(user, "payments") && (canManageBilling(user) || canManageOperations(user)));
}

export function schoolPaymentsReadonlyHref(centerId?: string) {
  return `/school-payments${centerId ? `?center=${encodeURIComponent(centerId)}` : ""}`;
}
