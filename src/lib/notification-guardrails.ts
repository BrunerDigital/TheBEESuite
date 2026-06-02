export function notificationTargetGuard(input: {
  targetUserId: string | null;
  actorUserId: string;
  actorTenantId: string;
  actorCenterIds: string[];
  actorHasTenantWideAccess: boolean;
  targetTenantId?: string | null;
  targetCenterIds?: string[];
}) {
  if (!input.targetUserId) {
    if (input.actorHasTenantWideAccess) return { ok: true as const };
    return {
      ok: false as const,
      status: 403,
      error: "Choose a specific user before queuing a notification from a center-scoped account.",
    };
  }

  if (input.targetUserId === input.actorUserId) return { ok: true as const };
  if (!input.targetTenantId || input.targetTenantId !== input.actorTenantId) {
    return {
      ok: false as const,
      status: 403,
      error: "Notification target is outside your tenant.",
    };
  }
  if (input.actorHasTenantWideAccess) return { ok: true as const };

  const visibleCenters = new Set(input.actorCenterIds);
  const targetCenters = input.targetCenterIds ?? [];
  if (targetCenters.some((centerId) => visibleCenters.has(centerId))) return { ok: true as const };

  return {
    ok: false as const,
    status: 403,
    error: "Notification target is outside your center scope.",
  };
}
