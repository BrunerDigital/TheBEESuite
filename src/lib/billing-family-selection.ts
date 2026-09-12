type ScopedBillingFamily = { id: string; centerId?: string | null };

export function resolveBillingChildSelection<T extends { id: string }>(children: readonly T[], requestedChildId?: string, isCurrent?: (child: T) => boolean): T | null {
  if (requestedChildId) return children.find((child) => child.id === requestedChildId) ?? null;
  return children.find((child) => isCurrent?.(child)) ?? children[0] ?? null;
}

export const BILLING_TARGET_UNAVAILABLE = "The requested family or school is not available in this billing workspace. No other family has been selected. Choose an authorized school and family to continue.";

/** Exact links never substitute another account. Lists have already been authorized by the server. */
export function resolveBillingFamilySelection<T extends ScopedBillingFamily>({
  families, allowedCenterIds, requestedFamilyId, requestedCenterId, matchesSearch,
}: {
  families: readonly T[];
  allowedCenterIds: readonly string[];
  requestedFamilyId?: string;
  requestedCenterId?: string;
  matchesSearch?: (family: T) => boolean;
}): { family: T | null; familyId: string; centerId: string; error: string | null } {
  const allowed = new Set(allowedCenterIds);
  const centerValid = !requestedCenterId || allowed.has(requestedCenterId);
  const available = centerValid ? families.filter((family) => Boolean(family.centerId && allowed.has(family.centerId)) && (!requestedCenterId || family.centerId === requestedCenterId)) : [];
  const family = requestedFamilyId
    ? available.find((candidate) => candidate.id === requestedFamilyId) ?? null
    : available.find((candidate) => matchesSearch?.(candidate)) ?? available[0] ?? null;
  const unresolved = !centerValid || Boolean(requestedFamilyId && !family);
  return {
    family: unresolved ? null : family,
    familyId: unresolved ? "" : family?.id ?? "",
    centerId: centerValid ? requestedCenterId || family?.centerId || allowedCenterIds[0] || "" : "",
    error: unresolved ? BILLING_TARGET_UNAVAILABLE : null,
  };
}

export function billingSelectionKey(selection?: { familyId?: string; centerId?: string; childId?: string; searchQuery?: string }) {
  return JSON.stringify([selection?.familyId ?? "", selection?.centerId ?? "", selection?.childId ?? "", selection?.searchQuery ?? ""]);
}

export function billingWorkspaceTarget({ families, historicalFamilies, allowedCenterIds, requestedFamilyId, requestedCenterId }: {
  families: readonly ScopedBillingFamily[];
  historicalFamilies: readonly ScopedBillingFamily[];
  allowedCenterIds: readonly string[];
  requestedFamilyId?: string;
  requestedCenterId?: string;
}): "default" | "eligible" | "history" | "unavailable" {
  if (requestedCenterId && !allowedCenterIds.includes(requestedCenterId)) return "unavailable";
  if (!requestedFamilyId) return "default";
  const input = { allowedCenterIds, requestedFamilyId, requestedCenterId };
  if (resolveBillingFamilySelection({ ...input, families }).family) return "eligible";
  return resolveBillingFamilySelection({ ...input, families: historicalFamilies }).family ? "history" : "unavailable";
}

export function exactBillingFamilyHref(family: { id: string; centerId?: string | null }, { invoiceStatus, history = false }: { invoiceStatus?: string; history?: boolean } = {}) {
  const params = new URLSearchParams({ familyId: family.id });
  if (family.centerId) params.set("centerId", family.centerId);
  if (invoiceStatus) params.set("invoiceStatus", invoiceStatus);
  return `/billing-invoices?${params.toString()}#${history ? "family-ledger" : "billing-workbench"}`;
}
