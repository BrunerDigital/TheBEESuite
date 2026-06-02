export function scopedUpdateGuard(input: {
  entity: string;
  expectedScopeId: string | null;
  actualScopeId: string | null | undefined;
  scopeLabel: string;
}) {
  if (input.actualScopeId === undefined) {
    return { ok: false as const, status: 404, error: `${input.entity} not found.` };
  }
  if (input.expectedScopeId !== input.actualScopeId) {
    return {
      ok: false as const,
      status: 403,
      error: `${input.entity} is not linked to the requested ${input.scopeLabel}.`,
    };
  }
  return { ok: true as const };
}

export function classroomFamilyGuard(familyCenterId: string | null, classroomCenterId: string | null) {
  if (familyCenterId && classroomCenterId && familyCenterId !== classroomCenterId) {
    return {
      ok: false as const,
      status: 403,
      error: "Classroom is not linked to this family center.",
    };
  }
  return { ok: true as const };
}

export function staffTenantGuard(actorTenantId: string, existingUserTenantId?: string | null) {
  if (existingUserTenantId && existingUserTenantId !== actorTenantId) {
    return {
      ok: false as const,
      status: 409,
      error: "That email belongs to a different tenant.",
    };
  }
  return { ok: true as const };
}

export function centerScopedAccessGuard(input: {
  centerId?: string | null;
  hasTenantWideAccess: boolean;
  hasCenterAccess: boolean;
  resourceLabel: string;
}) {
  if (!input.centerId && !input.hasTenantWideAccess) {
    return {
      ok: false as const,
      status: 403,
      error: `${input.resourceLabel} is not linked to an accessible center.`,
    };
  }
  if (input.centerId && !input.hasCenterAccess) {
    return {
      ok: false as const,
      status: 403,
      error: `You do not have access to this ${input.resourceLabel.toLowerCase()}.`,
    };
  }
  return { ok: true as const };
}
