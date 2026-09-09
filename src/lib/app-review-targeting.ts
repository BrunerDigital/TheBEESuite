import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isCurrentlyEnrolledStatus } from "@/lib/enrollment-status";
import { messageAttachmentsFromMetadata } from "@/lib/message-attachments";

export type AppReviewTargetKind = "parent" | "teacher";

export const APP_REVIEW_DEMO_SOURCE = "bee_suite_demo";
export const APP_REVIEW_PARENT_CONTACT = {
  email: "app-review-parent@thebeesuite.io",
  externalId: "app-review-parent-primary",
  sourceSystem: "bee_suite_app_review",
  seededBy: "scripts/ensure-app-review-parent.ts",
} as const;

export const APP_REVIEW_TEACHER_CONTACT = {
  email: "app-review-teacher@thebeesuite.io",
  externalId: "app-review-teacher-primary",
  sourceSystem: "bee_suite_app_review",
  seededBy: "scripts/ensure-app-review-teacher.ts",
} as const;

export const APP_REVIEW_RESERVED_EMAILS = [
  APP_REVIEW_PARENT_CONTACT.email,
  APP_REVIEW_TEACHER_CONTACT.email,
] as const;

const appReviewRelatedUserSelect = {
  id: true,
  email: true,
  name: true,
  tenantId: true,
  role: true,
  isActive: true,
  customFields: true,
  staffProfile: {
    select: {
      id: true,
      centerId: true,
      classroomId: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
    },
  },
} as const satisfies Prisma.UserSelect;

export const appReviewCenterScopeSelect = {
  id: true,
  organizationId: true,
  ownerGroupId: true,
  name: true,
  crmLocationId: true,
  locationId: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  phone: true,
  email: true,
  status: true,
  sourceSystem: true,
  externalId: true,
  customFields: true,
  licensedCapacity: true,
  timezone: true,
  organization: {
    select: {
      id: true,
      tenantId: true,
      name: true,
      tenant: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true } },
    },
  },
  ownerGroup: {
    select: {
      id: true,
      tenantId: true,
      organizationId: true,
      name: true,
      slug: true,
      ownerType: true,
      status: true,
      customFields: true,
    },
  },
} as const satisfies Prisma.CenterSelect;

export type AppReviewCenterScope = Prisma.CenterGetPayload<{
  select: typeof appReviewCenterScopeSelect;
}>;

export const appReviewFamilyScopeSelect = {
  id: true,
  centerId: true,
  name: true,
  address: true,
  billingEmail: true,
  notes: true,
  custodyNotes: true,
  sourceSystem: true,
  externalId: true,
  customFields: true,
  createdAt: true,
  updatedAt: true,
  children: {
    select: {
      id: true,
      familyId: true,
      classroomId: true,
      fullName: true,
      preferredName: true,
      dateOfBirth: true,
      ageGroup: true,
      enrollmentStatus: true,
      startDate: true,
      schedule: true,
      photoVideoPermission: true,
      fieldTripPermission: true,
      napNotes: true,
      feedingNotes: true,
      pottyNotes: true,
      developmentalNotes: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      createdAt: true,
      updatedAt: true,
      classroom: {
        select: {
          id: true,
          centerId: true,
          name: true,
          ageGroup: true,
          capacity: true,
          ratioRule: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
        },
      },
      liveLocation: {
        select: {
          id: true,
          childId: true,
          centerId: true,
          currentClassroomId: true,
          areaName: true,
          status: true,
          reason: true,
          movedAt: true,
          movedById: true,
          currentClassroom: {
            select: {
              id: true,
              centerId: true,
              name: true,
              ageGroup: true,
              sourceSystem: true,
              externalId: true,
              customFields: true,
            },
          },
          movedBy: { select: appReviewRelatedUserSelect },
        },
      },
      allergies: {
        select: { id: true, childId: true, allergen: true, severity: true, actionPlan: true },
      },
      medicalNotes: {
        select: { id: true, childId: true, category: true, note: true, restricted: true, createdAt: true },
      },
      attendance: {
        select: {
          id: true,
          childId: true,
          classroomId: true,
          date: true,
          status: true,
          absenceReason: true,
          sourceSystem: true,
          externalId: true,
          metadata: true,
          clientActionId: true,
        },
      },
      checkLogs: {
        select: {
          id: true,
          childId: true,
          centerId: true,
          classroomId: true,
          guardianId: true,
          type: true,
          occurredAt: true,
          pickupName: true,
          signaturePlaceholder: true,
          verificationStatus: true,
          pinVerified: true,
          notes: true,
          sourceSystem: true,
          externalId: true,
          metadata: true,
        },
      },
      dailyReports: {
        select: {
          id: true,
          childId: true,
          classroomId: true,
          date: true,
          mood: true,
          teacherNote: true,
          suppliesNeeded: true,
          sentAt: true,
          clientActionId: true,
          meals: { select: { id: true, dailyReportId: true, mealType: true, food: true, amount: true } },
          naps: { select: { id: true, dailyReportId: true, startsAt: true, endsAt: true } },
          diapers: { select: { id: true, dailyReportId: true, type: true, occurredAt: true, notes: true } },
          activities: { select: { id: true, dailyReportId: true, title: true, notes: true } },
        },
      },
      incidents: {
        select: {
          id: true,
          childId: true,
          classroomId: true,
          staffMember: true,
          occurredAt: true,
          type: true,
          description: true,
          actionTaken: true,
          parentNotified: true,
          parentAcknowledgedAt: true,
          photoAttachmentPlaceholder: true,
          adminReviewStatus: true,
          followUpTasks: true,
          clientActionId: true,
        },
      },
      documents: {
        select: {
          id: true,
          familyId: true,
          childId: true,
          name: true,
          type: true,
          status: true,
          expiresAt: true,
          storageKey: true,
          restricted: true,
          createdAt: true,
        },
      },
      media: {
        select: {
          id: true,
          childId: true,
          classroomId: true,
          uploadedById: true,
          dailyReportId: true,
          url: true,
          storageKey: true,
          caption: true,
          mediaType: true,
          status: true,
          sharedWithParents: true,
          takenAt: true,
          createdAt: true,
          uploadedBy: { select: appReviewRelatedUserSelect },
        },
      },
    },
  },
  guardians: {
    select: {
      id: true,
      familyId: true,
      userId: true,
      fullName: true,
      email: true,
      phone: true,
      employer: true,
      relation: true,
      preferredCommunication: true,
      isBillingContact: true,
      sourceSystem: true,
      externalId: true,
      checkInPinHash: true,
      checkInPinSetAt: true,
      checkInPinSetById: true,
      customFields: true,
      user: {
        select: appReviewRelatedUserSelect,
      },
    },
  },
  pickups: {
    select: {
      id: true,
      familyId: true,
      userId: true,
      fullName: true,
      phone: true,
      relation: true,
      verificationNotes: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      user: {
        select: appReviewRelatedUserSelect,
      },
    },
  },
  emergencyContacts: {
    select: {
      id: true,
      familyId: true,
      fullName: true,
      phone: true,
      relation: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
    },
  },
  billingAccount: {
    select: {
      id: true,
      familyId: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      balanceCents: true,
      autopayPlaceholder: true,
      ledgerSyncedAt: true,
      invoices: {
        select: {
          id: true,
          billingAccountId: true,
          number: true,
          status: true,
          dueDate: true,
          totalCents: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          createdAt: true,
          items: { select: { id: true, invoiceId: true, productId: true, description: true, amountCents: true } },
        },
      },
      payments: {
        select: {
          id: true,
          billingAccountId: true,
          amountCents: true,
          status: true,
          provider: true,
          externalIdPlaceholder: true,
          customFields: true,
          paidAt: true,
        },
      },
      ledgerEntries: {
        select: {
          id: true,
          billingAccountId: true,
          invoiceId: true,
          paymentId: true,
          type: true,
          description: true,
          amountCents: true,
          balanceAfterCents: true,
          effectiveAt: true,
          createdAt: true,
          sourceSystem: true,
          externalId: true,
          metadata: true,
        },
      },
    },
  },
  messages: {
    select: {
      id: true,
      familyId: true,
      senderId: true,
      assignedToId: true,
      templateId: true,
      replyToMessageId: true,
      threadKey: true,
      subject: true,
      body: true,
      channel: true,
      priority: true,
      sentiment: true,
      metadata: true,
      readAt: true,
      createdAt: true,
      sender: { select: appReviewRelatedUserSelect },
      assignedTo: { select: appReviewRelatedUserSelect },
    },
  },
  documents: {
    select: {
      id: true,
      familyId: true,
      childId: true,
      name: true,
      type: true,
      status: true,
      expiresAt: true,
      storageKey: true,
      restricted: true,
      createdAt: true,
    },
  },
  dataDeletionRequests: {
    select: {
      id: true,
      tenantId: true,
      centerId: true,
      familyId: true,
      guardianId: true,
      userId: true,
      requestType: true,
      status: true,
      source: true,
      requesterEmail: true,
      requesterName: true,
      details: true,
      retentionNoticeAccepted: true,
      schoolReviewRequired: true,
      verifiedAt: true,
      dueAt: true,
      completedAt: true,
      deniedAt: true,
      cancelledAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const satisfies Prisma.FamilySelect;

export type AppReviewFamilyScope = Prisma.FamilyGetPayload<{
  select: typeof appReviewFamilyScopeSelect;
}>;

export const appReviewClassroomRosterSelect = {
  id: true,
  centerId: true,
  name: true,
  ageGroup: true,
  capacity: true,
  ratioRule: true,
  sourceSystem: true,
  externalId: true,
  customFields: true,
  children: {
    select: {
      id: true,
      familyId: true,
      classroomId: true,
      enrollmentStatus: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      family: { select: appReviewFamilyScopeSelect },
    },
  },
  staff: {
    select: {
      id: true,
      userId: true,
      centerId: true,
      classroomId: true,
      title: true,
      phone: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      user: { select: appReviewRelatedUserSelect },
    },
  },
} as const satisfies Prisma.ClassroomSelect;

export type AppReviewClassroomRoster = Prisma.ClassroomGetPayload<{
  select: typeof appReviewClassroomRosterSelect;
}>;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isDemoRecord(sourceSystem: string | null, customFields: unknown) {
  return sourceSystem === APP_REVIEW_DEMO_SOURCE && jsonRecord(customFields).demoWorkspace === true;
}

function isAllowedReviewUser(
  user: AppReviewFamilyScope["guardians"][number]["user"],
  tenantId: string,
) {
  if (!user) return false;
  const fields = jsonRecord(user.customFields);
  const email = user.email.trim().toLowerCase();
  const expected = user.role === "PARENT_GUARDIAN"
    ? APP_REVIEW_PARENT_CONTACT
    : user.role === "TEACHER"
      ? APP_REVIEW_TEACHER_CONTACT
      : null;
  return Boolean(expected)
    && user.tenantId === tenantId
    && email === expected?.email
    && fields.appReview === true
    && fields.seededBy === expected?.seededBy;
}

export function appReviewIdentityKind(user: {
  email: string;
  role: string;
  customFields: unknown;
}): AppReviewTargetKind | null {
  const fields = jsonRecord(user.customFields);
  const email = user.email.trim().toLowerCase();
  if (
    user.role === "PARENT_GUARDIAN"
    && email === APP_REVIEW_PARENT_CONTACT.email
    && fields.appReview === true
    && fields.seededBy === APP_REVIEW_PARENT_CONTACT.seededBy
  ) return "parent";
  if (
    user.role === "TEACHER"
    && email === APP_REVIEW_TEACHER_CONTACT.email
    && fields.appReview === true
    && fields.seededBy === APP_REVIEW_TEACHER_CONTACT.seededBy
  ) return "teacher";
  return null;
}

export function appReviewTeacherStaffMarkerIsValid(staff: {
  sourceSystem: string | null;
  externalId: string | null;
  customFields: unknown;
}) {
  const staffFields = jsonRecord(staff.customFields);
  return staff.sourceSystem === APP_REVIEW_TEACHER_CONTACT.sourceSystem
    && staff.externalId === APP_REVIEW_TEACHER_CONTACT.externalId
    && staffFields.appReview === true
    && staffFields.seededBy === APP_REVIEW_TEACHER_CONTACT.seededBy
    && !staffFields.staffKioskPinHash
    && !staffFields.staffKioskPinSetAt
    && !staffFields.staffKioskPinSetById
    && !staffFields.timeClock;
}

export function appReviewReservedIdentityKind(email: string): AppReviewTargetKind | null {
  const normalized = email.trim().toLowerCase();
  if (normalized === APP_REVIEW_PARENT_CONTACT.email) return "parent";
  if (normalized === APP_REVIEW_TEACHER_CONTACT.email) return "teacher";
  return null;
}

export function appReviewFamilyContainsReservedIdentity(family: {
  billingEmail?: string | null;
  guardians?: ReadonlyArray<{
    email?: string | null;
    user?: { email?: string | null } | null;
  }>;
}) {
  return Boolean(
    (family.billingEmail && appReviewReservedIdentityKind(family.billingEmail))
    || family.guardians?.some((guardian) => (
      Boolean(guardian.email && appReviewReservedIdentityKind(guardian.email))
      || Boolean(guardian.user?.email && appReviewReservedIdentityKind(guardian.user.email))
    )),
  );
}

function isSyntheticStaffUser(
  user: AppReviewFamilyScope["guardians"][number]["user"],
  tenantId: string,
) {
  if (!user || user.tenantId !== tenantId) return false;
  if (user.role === "TEACHER" && isAllowedReviewUser(user, tenantId)) return true;
  return Boolean(
    user.staffProfile
    && user.staffProfile.sourceSystem === APP_REVIEW_DEMO_SOURCE
    && user.staffProfile.externalId
    && jsonRecord(user.staffProfile.customFields).demoWorkspace === true,
  );
}

function isAllowedReviewTeacherStaff(
  staff: AppReviewClassroomRoster["staff"][number],
  tenantId: string,
) {
  return appReviewTeacherStaffMarkerIsValid(staff)
    && staff.user.role === "TEACHER"
    && isAllowedReviewUser(staff.user, tenantId)
    && staff.user.staffProfile?.id === staff.id
    && staff.user.staffProfile.centerId === staff.centerId
    && staff.user.staffProfile.classroomId === staff.classroomId
    && staff.user.staffProfile.sourceSystem === APP_REVIEW_TEACHER_CONTACT.sourceSystem
    && staff.user.staffProfile.externalId === APP_REVIEW_TEACHER_CONTACT.externalId;
}

const providerIdentifierPattern = /(?:^|[^a-z0-9])(?:acct|cus|pm|pi|seti|cs_(?:live|test)|ch|src|tok|sk_live|rk_live)_[a-z0-9_]+/i;

function scopeStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(scopeStrings);
  if (!value || typeof value !== "object") return [];
  if (value instanceof Date) return [value.toISOString()];
  return Object.values(value as Record<string, unknown>).flatMap(scopeStrings);
}

export function appReviewScopeContainsLiveProviderIdentifier(value: unknown) {
  return scopeStrings(value).some((item) => providerIdentifierPattern.test(item));
}

function hasUnsafeExternalUrl(value: unknown) {
  return scopeStrings(value).some((item) => {
    if (!/^https?:\/\//i.test(item)) return false;
    try {
      const hostname = new URL(item).hostname.toLowerCase();
      return hostname !== "placehold.co"
        && hostname !== "thebeesuite.io"
        && !hostname.endsWith(".thebeesuite.io");
    } catch {
      return true;
    }
  });
}

function isSyntheticQaUser(
  user: AppReviewFamilyScope["guardians"][number]["user"],
  tenantId: string,
  role: "PARENT_GUARDIAN" | "AUTHORIZED_PICKUP",
) {
  if (!user) return false;
  const fields = jsonRecord(user.customFields);
  return user.tenantId === tenantId
    && user.role === role
    && user.email.trim().toLowerCase().endsWith("@synthetic.thebeesuite.io")
    && fields.syntheticTest === true;
}

function isDemoRelationshipUser(
  user: AppReviewFamilyScope["guardians"][number]["user"],
  tenantId: string,
  role: "PARENT_GUARDIAN" | "AUTHORIZED_PICKUP",
) {
  if (!user) return false;
  const email = user.email.trim().toLowerCase();
  return user.tenantId === tenantId
    && user.role === role
    && (email.endsWith("@example.com") || isSyntheticQaUser(user, tenantId, role));
}

function isAllowedReviewGuardian(
  guardian: AppReviewFamilyScope["guardians"][number],
  tenantId: string,
) {
  const guardianFields = jsonRecord(guardian.customFields);
  const userFields = jsonRecord(guardian.user?.customFields);
  return guardian.sourceSystem === APP_REVIEW_PARENT_CONTACT.sourceSystem
    && guardian.externalId === APP_REVIEW_PARENT_CONTACT.externalId
    && guardianFields.appReview === true
    && guardianFields.seededBy === APP_REVIEW_PARENT_CONTACT.seededBy
    && guardian.user?.email.trim().toLowerCase() === APP_REVIEW_PARENT_CONTACT.email
    && guardian.user.tenantId === tenantId
    && guardian.user.role === "PARENT_GUARDIAN"
    && guardian.checkInPinHash === null
    && guardian.checkInPinSetAt === null
    && guardian.checkInPinSetById === null
    && userFields.appReview === true
    && userFields.seededBy === APP_REVIEW_PARENT_CONTACT.seededBy;
}

function isAllowedGuardian(
  guardian: AppReviewFamilyScope["guardians"][number],
  tenantId: string,
) {
  if (isAllowedReviewGuardian(guardian, tenantId)) return true;
  if (
    guardian.sourceSystem === APP_REVIEW_DEMO_SOURCE
    && guardian.externalId?.startsWith("demo-guardian-")
    && isDemoRecord(guardian.sourceSystem, guardian.customFields)
  ) {
    return !guardian.user || isDemoRelationshipUser(guardian.user, tenantId, "PARENT_GUARDIAN");
  }
  return jsonRecord(guardian.customFields).syntheticTest === true
    && isSyntheticQaUser(guardian.user, tenantId, "PARENT_GUARDIAN");
}

function isAllowedPickup(
  pickup: AppReviewFamilyScope["pickups"][number],
  tenantId: string,
) {
  if (
    pickup.sourceSystem === APP_REVIEW_DEMO_SOURCE
    && pickup.externalId?.startsWith("pickup-")
  ) {
    return !pickup.user || isDemoRelationshipUser(pickup.user, tenantId, "AUTHORIZED_PICKUP");
  }
  return jsonRecord(pickup.customFields).syntheticTest === true
    && isSyntheticQaUser(pickup.user, tenantId, "AUTHORIZED_PICKUP");
}

export function appReviewFamilyScopeViolation(input: {
  family: AppReviewFamilyScope;
  centerId: string;
  tenantId: string;
  requireMockFinancials?: boolean;
}) {
  const { family, centerId, tenantId } = input;
  if (
    family.centerId !== centerId
    || !family.externalId
    || !isDemoRecord(family.sourceSystem, family.customFields)
  ) {
    return "family is not marked as synthetic demo data in the exact review center";
  }
  if (family.children.length === 0) return "family has no reviewable demo children";
  const hasCurrentChild = family.children.some((child) => isCurrentlyEnrolledStatus(child.enrollmentStatus));
  const hasOutstandingMockBilling = Boolean(
    family.billingAccount
    && family.billingAccount.balanceCents > 0
    && family.billingAccount.invoices.some((invoice) => invoice.status === "OPEN"),
  );
  if (!hasCurrentChild && !hasOutstandingMockBilling) {
    return "family is not reachable through the current-or-outstanding Parent portal scope";
  }
  if (appReviewScopeContainsLiveProviderIdentifier(family) || hasUnsafeExternalUrl({
    family: {
      customFields: family.customFields,
      children: family.children.map((child) => child.customFields),
      guardians: family.guardians.map((guardian) => guardian.customFields),
      pickups: family.pickups.map((pickup) => pickup.customFields),
      emergencyContacts: family.emergencyContacts.map((contact) => contact.customFields),
      billingAccount: family.billingAccount,
      messages: family.messages.map((message) => message.metadata),
      dataDeletionRequests: family.dataDeletionRequests.map((request) => request.metadata),
    },
  })) {
    return "family scope contains a live provider identifier or unapproved external URL";
  }

  for (const child of family.children) {
    if (!child.externalId || child.familyId !== family.id || !isDemoRecord(child.sourceSystem, child.customFields)) {
      return "family contains a child that is not marked as synthetic demo data";
    }
    if (child.classroom && (
      child.classroom.centerId !== centerId
      || !isDemoRecord(child.classroom.sourceSystem, child.classroom.customFields)
    )) {
      return "family contains a child assigned to a non-demo or cross-center classroom";
    }
    if (child.liveLocation && (
      child.liveLocation.childId !== child.id
      ||
      child.liveLocation.centerId !== centerId
      || Boolean(child.liveLocation.currentClassroom && (
        child.liveLocation.currentClassroom.centerId !== centerId
        || !isDemoRecord(
          child.liveLocation.currentClassroom.sourceSystem,
          child.liveLocation.currentClassroom.customFields,
        )
      ))
    )) {
      return "family contains a child with a non-demo or cross-center live location";
    }
    if (child.liveLocation?.movedBy && !isSyntheticStaffUser(child.liveLocation.movedBy, tenantId)) {
      return "family contains a live-location actor without verified synthetic provenance";
    }
    if (child.attendance.some((record) => (
      record.childId !== child.id
      || record.sourceSystem !== APP_REVIEW_DEMO_SOURCE
      || !record.externalId
      || jsonRecord(record.metadata).demoWorkspace !== true
    ))) {
      return "family contains an attendance record without verified synthetic provenance";
    }
    if (child.checkLogs.some((log) => (
      log.childId !== child.id
      || log.centerId !== centerId
      || log.sourceSystem !== APP_REVIEW_DEMO_SOURCE
      || !log.externalId
      || jsonRecord(log.metadata).demoWorkspace !== true
    ))) {
      return "family contains a check-in record without verified synthetic provenance";
    }
    if (child.dailyReports.some((report) => (
      report.childId !== child.id
      || Boolean(report.classroomId && report.classroomId !== child.classroomId)
      || report.meals.some((item) => item.dailyReportId !== report.id)
      || report.naps.some((item) => item.dailyReportId !== report.id)
      || report.diapers.some((item) => item.dailyReportId !== report.id)
      || report.activities.some((item) => item.dailyReportId !== report.id)
    ))) {
      return "family contains a daily report outside the synthetic child and classroom graph";
    }
    if (child.incidents.some((incident) => (
      incident.childId !== child.id
      || Boolean(incident.classroomId && incident.classroomId !== child.classroomId)
    ))) {
      return "family contains an incident outside the synthetic child and classroom graph";
    }
    if (child.documents.some((document) => (
      document.childId !== child.id
      || document.familyId !== null
      || !document.storageKey?.startsWith(`demo-docs/${child.id}/`)
    ))) {
      return "family contains a child document outside the dedicated demo storage namespace";
    }
    if (child.media.some((media) => (
      media.childId !== child.id
      || Boolean(media.classroomId && media.classroomId !== child.classroomId)
      || !media.storageKey?.startsWith(`demo-media/${child.id}/`)
      || !(
        media.url.startsWith("https://placehold.co/")
        || (
          media.url.startsWith("supabase://")
          && Boolean(media.storageKey && media.url.endsWith(`/${media.storageKey}`))
        )
      )
      || Boolean(media.uploadedBy && !isSyntheticStaffUser(media.uploadedBy, tenantId))
    ))) {
      return "family contains child media outside the synthetic actor or demo storage boundary";
    }
  }

  if (family.guardians.some((guardian) => !isAllowedGuardian(guardian, tenantId))) {
    return "family contains a guardian without verified synthetic or App Review provenance";
  }
  if (family.pickups.some((pickup) => !isAllowedPickup(pickup, tenantId))) {
    return "family contains an authorized pickup without verified synthetic provenance";
  }
  if (family.emergencyContacts.some((contact) => (
    !(contact.sourceSystem === APP_REVIEW_DEMO_SOURCE
      && contact.externalId?.startsWith("emergency-")
      && isDemoRecord(contact.sourceSystem, contact.customFields))
    && jsonRecord(contact.customFields).syntheticTest !== true
  ))) {
    return "family contains an emergency contact without verified synthetic provenance";
  }
  if (family.guardians.some((guardian) => guardian.familyId !== family.id)) {
    return "family contains a cross-family guardian relationship";
  }
  if (family.pickups.some((pickup) => pickup.familyId !== family.id)) {
    return "family contains a cross-family authorized-pickup relationship";
  }
  if (family.emergencyContacts.some((contact) => contact.familyId !== family.id)) {
    return "family contains a cross-family emergency-contact relationship";
  }
  if (family.documents.some((document) => (
    document.familyId !== family.id
    || document.childId !== null
    || !document.storageKey?.startsWith(`demo-docs/${family.id}/`)
  ))) {
    return "family contains a family document outside the dedicated demo storage namespace";
  }
  if (family.messages.some((message) => {
    if (message.familyId !== family.id) return true;
    const senderIsSafe = message.sender
      ? isSyntheticStaffUser(message.sender, tenantId)
        || (message.sender.role === "PARENT_GUARDIAN" && isAllowedReviewUser(message.sender, tenantId))
        || (message.sender.role === "PARENT_GUARDIAN" && isDemoRelationshipUser(message.sender, tenantId, "PARENT_GUARDIAN"))
        || (message.sender.role === "AUTHORIZED_PICKUP" && isDemoRelationshipUser(message.sender, tenantId, "AUTHORIZED_PICKUP"))
      : jsonRecord(message.metadata).demoWorkspace === true;
    if (!senderIsSafe) return true;
    if (message.assignedTo && !isSyntheticStaffUser(message.assignedTo, tenantId)) return true;
    const rawAttachments = Array.isArray(jsonRecord(message.metadata).attachments)
      ? jsonRecord(message.metadata).attachments as unknown[]
      : [];
    const attachments = messageAttachmentsFromMetadata(message.metadata);
    return rawAttachments.length !== attachments.length
      || attachments.some((attachment) => (
        !attachment.storageKey.startsWith("demo-messages/")
        && !attachment.storageKey.startsWith("demo-media/")
      ));
  })) {
    return "family contains a message or attachment without verified synthetic provenance";
  }
  const familyGuardianIds = new Set(family.guardians.map((guardian) => guardian.id));
  const familyGuardianUserIds = new Set(
    family.guardians
      .map((guardian) => guardian.userId)
      .filter((userId): userId is string => Boolean(userId)),
  );
  if (family.dataDeletionRequests.some((request) => (
    request.tenantId !== tenantId
    || request.centerId !== centerId
    || request.familyId !== family.id
    || !request.guardianId
    || !familyGuardianIds.has(request.guardianId)
    || !request.userId
    || !familyGuardianUserIds.has(request.userId)
    || request.source !== "parent_portal"
    || Boolean(request.requesterEmail && (
      request.requesterEmail.trim().toLowerCase() !== APP_REVIEW_PARENT_CONTACT.email
      && !request.requesterEmail.trim().toLowerCase().endsWith("@example.com")
      && !request.requesterEmail.trim().toLowerCase().endsWith("@synthetic.thebeesuite.io")
    ))
  ))) {
    return "family contains an account-deletion request without verified synthetic provenance";
  }
  if (input.requireMockFinancials === false) return null;
  const account = family.billingAccount;
  if (account && (
    account.familyId !== family.id
    || account.sourceSystem !== APP_REVIEW_DEMO_SOURCE
    || account.externalId !== `demo-billing-${family.id}`
    || jsonRecord(account.customFields).demoWorkspace !== true
    || account.autopayPlaceholder
  )) {
    return "family billing account is not isolated mock demo data";
  }
  if (account?.invoices.some((invoice) => (
    invoice.billingAccountId !== account.id
    || invoice.sourceSystem !== APP_REVIEW_DEMO_SOURCE
    || !invoice.externalId?.startsWith("DEMO-")
    || invoice.number !== invoice.externalId
    || jsonRecord(invoice.customFields).demoWorkspace !== true
    || invoice.items.some((item) => item.invoiceId !== invoice.id)
  ))) {
    return "family contains an invoice that is not isolated mock demo data";
  }
  if (account?.payments.some((payment) => (
    payment.billingAccountId !== account.id
    || payment.provider !== "stripe_mock"
    || !payment.externalIdPlaceholder?.startsWith("demo-payment-DEMO-")
    || jsonRecord(payment.customFields).demoWorkspace !== true
  ))) {
    return "family contains a payment that is not isolated mock demo data";
  }
  if (account?.ledgerEntries.some((entry) => (
    entry.billingAccountId !== account.id
    || entry.sourceSystem !== APP_REVIEW_DEMO_SOURCE
    || !entry.externalId?.startsWith("ledger-DEMO-")
    || jsonRecord(entry.metadata).demoWorkspace !== true
  ))) {
    return "family contains a ledger entry that is not isolated mock demo data";
  }
  return null;
}

export function appReviewClassroomScopeViolation(input: {
  classroom: AppReviewClassroomRoster;
  centerId: string;
  tenantId: string;
}) {
  const { classroom, centerId, tenantId } = input;
  if (
    classroom.centerId !== centerId
    || !classroom.externalId
    || !isDemoRecord(classroom.sourceSystem, classroom.customFields)
  ) {
    return "classroom is not marked as synthetic demo data in the exact review center";
  }
  if (classroom.children.length === 0) return "classroom has no reviewable demo children";
  if (!classroom.children.some((child) => (
    child.classroomId === classroom.id && isCurrentlyEnrolledStatus(child.enrollmentStatus)
  ))) {
    return "classroom has no currently enrolled reviewable demo child";
  }

  for (const child of classroom.children) {
    if (
      child.classroomId !== classroom.id
      || !child.externalId
      || !isDemoRecord(child.sourceSystem, child.customFields)
    ) {
      return "classroom roster contains a child that is not marked as synthetic demo data";
    }
    const familyViolation = appReviewFamilyScopeViolation({
      family: child.family,
      centerId,
      tenantId,
      requireMockFinancials: false,
    });
    if (familyViolation) return `classroom roster ${familyViolation}`;
  }
  if (classroom.staff.some((staff) => {
    if (staff.centerId !== centerId || staff.classroomId !== classroom.id) return true;
    if (isAllowedReviewTeacherStaff(staff, tenantId)) return false;
    return staff.sourceSystem !== APP_REVIEW_DEMO_SOURCE
      || !staff.externalId
      || jsonRecord(staff.customFields).demoWorkspace !== true
      || !isSyntheticStaffUser(staff.user, tenantId);
  })) {
    return "classroom contains staff without verified synthetic provenance";
  }
  return null;
}

export function appReviewCenterScopeViolation(input: {
  center: AppReviewCenterScope;
  tenantId: string;
}) {
  const { center, tenantId } = input;
  if (
    center.organization.tenantId !== tenantId
    || center.organization.tenant.id !== tenantId
    || (Boolean(center.ownerGroup?.tenantId) && center.ownerGroup?.tenantId !== tenantId)
    || (Boolean(center.ownerGroup?.organizationId) && center.ownerGroup?.organizationId !== center.organizationId)
  ) return "center is linked outside the exact review tenant or organization";
  if (
    center.sourceSystem !== APP_REVIEW_DEMO_SOURCE
    || center.externalId !== "demo-center-little-harbor"
    || jsonRecord(center.customFields).demoWorkspace !== true
    || center.organization.tenant.slug !== "bee-suite-isolated-demo"
    || ["closed", "archived", "inactive"].includes(center.status.toLowerCase())
  ) return "center is not the active isolated synthetic review workspace";
  if (appReviewScopeContainsLiveProviderIdentifier(center)) {
    return "center scope contains a live provider identifier";
  }
  return null;
}

function canonicalScopeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalScopeValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalScopeValue(item)]),
  );
}

export function appReviewScopeDigest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalScopeValue(value)))
    .digest("hex");
}

export function appReviewFamilyScopeDigest(family: AppReviewFamilyScope) {
  return appReviewScopeDigest(family);
}

export function appReviewClassroomScopeDigest(classroom: AppReviewClassroomRoster) {
  return appReviewScopeDigest(classroom);
}

export function buildAppReviewTargetFingerprint(
  kind: AppReviewTargetKind,
  fields: Record<string, string>,
) {
  const normalized = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(`Cannot fingerprint an empty App Review target field: ${key}.`);
      }
      return [key, trimmed] as const;
    });

  if (normalized.length === 0) {
    throw new Error("Cannot fingerprint an empty App Review target.");
  }

  return createHash("sha256")
    .update(JSON.stringify({ kind, fields: normalized }))
    .digest("hex");
}

export function assertAppReviewTargetFingerprint(input: {
  expected: string;
  provided: string;
  environmentVariable: string;
}) {
  if (!input.provided.trim() || input.provided.trim().toLowerCase() !== input.expected) {
    throw new Error(
      `Set ${input.environmentVariable} to the exact fingerprint returned by a fresh --preflight run for this target.`,
    );
  }
}
