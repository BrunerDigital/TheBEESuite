import { canAccessCenter, canManageBilling, canManageOperations, requiresPasswordResetGate, type CurrentUser } from "./auth";
import { buildSchoolPaymentsReadView, type SchoolPaymentsReadInput } from "./school-payments-readonly";

export type SchoolPaymentsReadAuthority = Pick<SchoolPaymentsReadInput, "scope" | "historyBindings"> & { revision: string };
type Dependencies = {
  currentUser(): Promise<CurrentUser | null>;
  // Trusted server adapters only. Must load the exact Center/tenant/account and
  // independently verified historical bindings for the current existing grants.
  // Runtime adapters remain behind the off-by-default server entry gate.
  loadAuthority(user: CurrentUser, centerId: string): Promise<SchoolPaymentsReadAuthority | null>;
  read(authority: SchoolPaymentsReadAuthority): Promise<Omit<SchoolPaymentsReadInput, "scope" | "historyBindings">>;
};
function authorized(user: CurrentUser | null, centerId: string): user is CurrentUser {
  return Boolean(user && !requiresPasswordResetGate(user) && user.deviceSessionId
    && (canManageBilling(user) || canManageOperations(user)) && canAccessCenter(user, centerId));
}
const authorityKey = (a: SchoolPaymentsReadAuthority) => JSON.stringify([a.revision, a.scope.tenantId, a.scope.centerId, a.scope.accountId,
  a.scope.accountVerified, a.scope.dashboard, a.scope.chargeTopology, a.scope.readCapabilities.paymentStatus, a.scope.readCapabilities.balances, a.scope.readCapabilities.payouts,
  a.historyBindings.map(h => [h.tenantId, h.centerId, h.accountId, h.bindingId, h.source, h.verified]).sort((a, b) => String(a[2]).localeCompare(String(b[2])))]);

// Selected school is the only caller choice. Account/history scope comes from
// current server authority, never posted account IDs, date or bank-last-four.
export async function loadSchoolPaymentsReadonly(centerId: string, deps: Dependencies) {
  const denied = () => ({ ok: false as const, reason: "unavailable_or_forbidden" as const });
  try {
    const user = await deps.currentUser(); if (!authorized(user, centerId)) return denied();
    const authority = await deps.loadAuthority(user, centerId);
    if (!authority || !authority.revision || authority.scope.centerId !== centerId || authority.scope.tenantId !== user.tenantId) return denied();
    // Validate current/history capability envelopes before any provider read.
    buildSchoolPaymentsReadView({ ...authority, payments: [], balances: [], payouts: [], availability: { payments: "unavailable", balances: "unavailable", payouts: "unavailable", history: "unavailable" } });
    const boundary = structuredClone(authority), expected = authorityKey(boundary);
    const actor = [user.id, user.tenantId, user.deviceSessionId, user.sessionVersion];
    const snapshot = await deps.read(structuredClone(boundary));
    const fresh = await deps.currentUser(); if (!authorized(fresh, centerId) || JSON.stringify([fresh.id, fresh.tenantId, fresh.deviceSessionId, fresh.sessionVersion]) !== JSON.stringify(actor)) return denied();
    const latest = await deps.loadAuthority(fresh, centerId);
    if (!latest || authorityKey(latest) !== expected) return denied();
    return { ok: true as const, view: buildSchoolPaymentsReadView({ ...snapshot, scope: boundary.scope, historyBindings: boundary.historyBindings }) };
  } catch { return denied(); }
}
