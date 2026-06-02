export function canCreateFamilyMessage(input: {
  isParentGuardian: boolean;
  canManageOperations: boolean;
  familyId: string | null;
}) {
  if (input.isParentGuardian && !input.familyId) {
    return {
      ok: false as const,
      status: 400,
      error: "Parent messages must be linked to a family.",
    };
  }
  if (!input.familyId && !input.canManageOperations) {
    return {
      ok: false as const,
      status: 403,
      error: "Message creation is not allowed for this role.",
    };
  }
  return { ok: true as const };
}

export function canAcknowledgeIncident(input: { isLinkedGuardian: boolean }) {
  if (!input.isLinkedGuardian) {
    return {
      ok: false as const,
      status: 403,
      error: "Only a linked parent or guardian can acknowledge this incident.",
    };
  }
  return { ok: true as const };
}

export function canAccessFamilyRecord(input: {
  isParentGuardian: boolean;
  isLinkedGuardian: boolean;
  hasCenterAccess: boolean;
}) {
  if (input.isParentGuardian && !input.isLinkedGuardian) {
    return {
      ok: false as const,
      status: 403,
      error: "You do not have access to this family.",
    };
  }
  if (!input.isLinkedGuardian && !input.hasCenterAccess) {
    return {
      ok: false as const,
      status: 403,
      error: "You do not have access to this family.",
    };
  }
  return { ok: true as const };
}

export function validateMediaUploadInput(input: {
  hasUploadedFile: boolean;
  photoUrl: string;
}) {
  if (!input.hasUploadedFile && input.photoUrl) {
    return {
      ok: false as const,
      status: 400,
      error: "Photo URLs are not accepted for new media. Upload a photo file so it can be stored securely.",
    };
  }
  if (!input.hasUploadedFile) {
    return {
      ok: false as const,
      status: 400,
      error: "Child and photo are required.",
    };
  }
  return { ok: true as const };
}

export function validateDailyReportMediaLink(input: {
  dailyReportChildId: string | null;
  childId: string;
}) {
  if (!input.dailyReportChildId) {
    return { ok: false as const, status: 404, error: "Daily report not found." };
  }
  if (input.dailyReportChildId !== input.childId) {
    return {
      ok: false as const,
      status: 403,
      error: "Daily report is not linked to this child.",
    };
  }
  return { ok: true as const };
}
