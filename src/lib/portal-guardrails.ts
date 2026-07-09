export function canCreateFamilyMessage(input: {
  isParentGuardian: boolean;
  canManageOperations: boolean;
  canManageClassroomTasks?: boolean;
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
  if (input.familyId && !input.isParentGuardian && !input.canManageOperations && !input.canManageClassroomTasks) {
    return {
      ok: false as const,
      status: 403,
      error: "Message creation is not allowed for this role.",
    };
  }
  return { ok: true as const };
}

export function canMessageClassroomFamily(input: {
  assignedClassroomId: string | null | undefined;
  familyChildClassroomIds: Array<string | null | undefined>;
}) {
  if (!input.assignedClassroomId) {
    return {
      ok: false as const,
      status: 403,
      error: "Teacher messaging requires an assigned classroom.",
    };
  }
  if (!input.familyChildClassroomIds.includes(input.assignedClassroomId)) {
    return {
      ok: false as const,
      status: 403,
      error: "Family is outside your assigned classroom.",
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

export function canRequestAccountDeletion(input: {
  isParentGuardian: boolean;
  isLinkedGuardian: boolean;
  retentionNoticeAccepted: boolean;
}) {
  if (!input.isParentGuardian) {
    return {
      ok: false as const,
      status: 403,
      error: "Only linked parent accounts can request parent portal account deletion.",
    };
  }
  if (!input.isLinkedGuardian) {
    return {
      ok: false as const,
      status: 403,
      error: "You do not have access to this guardian profile.",
    };
  }
  if (!input.retentionNoticeAccepted) {
    return {
      ok: false as const,
      status: 400,
      error: "Confirm the childcare record retention notice before submitting the request.",
    };
  }
  return { ok: true as const };
}

export function canInviteGuardianToPortal(input: {
  canManageOperations: boolean;
  hasCenterAccess: boolean;
  guardianEmail: string | null | undefined;
  existingUserTenantId?: string | null;
  targetTenantId: string;
  existingUserRole?: string | null;
}) {
  if (!input.canManageOperations) {
    return {
      ok: false as const,
      status: 403,
      error: "Parent portal invitations are not allowed for this role.",
    };
  }
  if (!input.hasCenterAccess) {
    return {
      ok: false as const,
      status: 403,
      error: "Guardian is outside your center scope.",
    };
  }
  if (!input.guardianEmail) {
    return {
      ok: false as const,
      status: 400,
      error: "Guardian needs an email before parent portal access can be created.",
    };
  }
  if (input.existingUserTenantId && input.existingUserTenantId !== input.targetTenantId) {
    return {
      ok: false as const,
      status: 409,
      error: "That guardian email already belongs to another tenant.",
    };
  }
  if (input.existingUserRole && input.existingUserRole !== "PARENT_GUARDIAN") {
    return {
      ok: false as const,
      status: 409,
      error: "That email is already assigned to a non-parent user.",
    };
  }
  return { ok: true as const };
}

export function normalizeParentNotificationPreferences(input: Record<string, unknown>) {
  const bool = (key: string, fallback = true) => {
    const value = input[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true" || value === "1" || value === "on";
    return fallback;
  };

  return {
    portal: bool("portal", true),
    email: bool("email", true),
    sms: bool("sms", false),
    dailyReports: bool("dailyReports", true),
    photos: bool("photos", true),
    billing: bool("billing", true),
    incidents: bool("incidents", true),
    announcements: bool("announcements", true),
  };
}

export function canSubmitDocumentForReview(input: {
  status: string;
  isLinkedGuardian: boolean;
  hasCenterAccess: boolean;
}) {
  if (!input.isLinkedGuardian && !input.hasCenterAccess) {
    return {
      ok: false as const,
      status: 403,
      error: "You do not have access to this document.",
    };
  }
  if (input.status === "APPROVED") {
    return {
      ok: false as const,
      status: 400,
      error: "Approved documents cannot be resubmitted from the parent portal.",
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
