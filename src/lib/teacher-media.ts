import { notificationDedupeKey } from "@/lib/notification-policy";
import { normalizeParentNotificationPreferences } from "@/lib/portal-guardrails";

export const PHOTO_PERMISSION_REVIEW_WARNING =
  "Photo saved for director review. It is not visible to parents because photo/video permission is not enabled for this child.";

export type GuardianPhotoNotificationTarget = {
  userId?: string | null;
  customFields?: unknown;
  user?: { isActive?: boolean | null } | null;
};

export function resolveTeacherMediaShareState(input: {
  requestedParentShare: boolean;
  photoVideoPermission: boolean;
}) {
  if (!input.requestedParentShare) {
    return {
      sharedWithParents: false,
      status: "draft",
      warning: undefined,
    };
  }

  if (input.photoVideoPermission) {
    return {
      sharedWithParents: true,
      status: "shared",
      warning: undefined,
    };
  }

  return {
    sharedWithParents: false,
    status: "permission_review",
    warning: PHOTO_PERMISSION_REVIEW_WARNING,
  };
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function shouldNotifyGuardianOfSharedPhoto(guardian: GuardianPhotoNotificationTarget) {
  if (!guardian.userId || guardian.user?.isActive === false) return false;

  const customFields = objectRecord(guardian.customFields);
  const preferenceFields = objectRecord(customFields?.notificationPreferences);
  const preferences = normalizeParentNotificationPreferences(preferenceFields ?? {});

  return preferences.portal && preferences.photos;
}

export function parentPhotoNotificationCopy(input: {
  childName: string;
  caption?: string | null;
}) {
  const caption = input.caption?.trim();
  return {
    title: "New classroom photo",
    body: caption
      ? `${input.childName} has a new classroom photo: ${caption}`
      : `${input.childName} has a new classroom photo in the parent portal.`,
  };
}

export function buildParentPhotoNotifications(input: {
  mediaId: string;
  childName: string;
  caption?: string | null;
  guardians: GuardianPhotoNotificationTarget[];
}) {
  const copy = parentPhotoNotificationCopy({
    childName: input.childName,
    caption: input.caption,
  });
  const userIds = Array.from(new Set(
    input.guardians
      .filter(shouldNotifyGuardianOfSharedPhoto)
      .map((guardian) => guardian.userId)
      .filter((userId): userId is string => Boolean(userId)),
  ));

  return userIds.map((userId) => ({
    userId,
    title: copy.title,
    body: copy.body,
    type: "photos",
    priority: "normal",
    dedupeKey: notificationDedupeKey(["child-media", input.mediaId, userId]),
  }));
}
