export type AccessGrantTarget = {
  role: string;
  scopeType: string;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
  centerId?: string | null;
};

export function isSameAccessGrantTarget(existing: AccessGrantTarget, target: AccessGrantTarget) {
  return existing.role === target.role &&
    existing.scopeType === target.scopeType &&
    (existing.brandId ?? null) === (target.brandId ?? null) &&
    (existing.organizationId ?? null) === (target.organizationId ?? null) &&
    (existing.ownerGroupId ?? null) === (target.ownerGroupId ?? null) &&
    (existing.centerId ?? null) === (target.centerId ?? null);
}
