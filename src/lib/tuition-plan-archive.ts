export function archivedTuitionPlanIds(customFields: unknown): string[] {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return [];
  const value = (customFields as Record<string, unknown>).archivedTuitionPlanIds;
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))] : [];
}

export function tuitionPlanIsArchived(customFields: unknown, planId: string): boolean {
  return archivedTuitionPlanIds(customFields).includes(planId);
}

export function tuitionPlanArchiveFields(customFields: unknown, planId: string, archived: boolean): Record<string, unknown> & { archivedTuitionPlanIds: string[] } {
  const fields = customFields && typeof customFields === "object" && !Array.isArray(customFields)
    ? customFields as Record<string, unknown> : {};
  const ids = archivedTuitionPlanIds(fields).filter(id => id !== planId);
  return { ...fields, archivedTuitionPlanIds: archived ? [...ids, planId] : ids };
}

export function archivedTuitionAssignmentAllowed(customFields: unknown, planId: string, existingPlanId: unknown) {
  return !tuitionPlanIsArchived(customFields, planId) || existingPlanId === planId;
}
