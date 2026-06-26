import assert from "node:assert/strict";
import test from "node:test";
import {
  PHOTO_PERMISSION_REVIEW_WARNING,
  buildParentPhotoNotifications,
  resolveTeacherMediaShareState,
  shouldNotifyGuardianOfSharedPhoto,
} from "@/lib/teacher-media";

test("teacher photo sharing goes straight to parents when permission is enabled", () => {
  assert.deepEqual(resolveTeacherMediaShareState({
    requestedParentShare: true,
    photoVideoPermission: true,
  }), {
    sharedWithParents: true,
    status: "shared",
    warning: undefined,
  });
});

test("teacher photo sharing routes restricted children to director review", () => {
  assert.deepEqual(resolveTeacherMediaShareState({
    requestedParentShare: true,
    photoVideoPermission: false,
  }), {
    sharedWithParents: false,
    status: "permission_review",
    warning: PHOTO_PERMISSION_REVIEW_WARNING,
  });
});

test("teacher photos can be saved internally without parent sharing", () => {
  assert.deepEqual(resolveTeacherMediaShareState({
    requestedParentShare: false,
    photoVideoPermission: true,
  }), {
    sharedWithParents: false,
    status: "draft",
    warning: undefined,
  });
});

test("shared teacher photos notify linked active guardians once", () => {
  const notifications = buildParentPhotoNotifications({
    mediaId: "media-1",
    childName: "Bailey Jarret",
    caption: "Painting at centers",
    guardians: [
      { userId: "guardian-user-1", user: { isActive: true }, customFields: null },
      { userId: "guardian-user-1", user: { isActive: true }, customFields: null },
      { userId: "guardian-user-2", user: { isActive: true }, customFields: null },
      { userId: "inactive-user", user: { isActive: false }, customFields: null },
      { userId: null, user: null, customFields: null },
    ],
  });

  assert.deepEqual(notifications, [
    {
      userId: "guardian-user-1",
      title: "New classroom photo",
      body: "Bailey Jarret has a new classroom photo: Painting at centers",
      type: "photos",
      priority: "normal",
      dedupeKey: "child-media:media-1:guardian-user-1",
    },
    {
      userId: "guardian-user-2",
      title: "New classroom photo",
      body: "Bailey Jarret has a new classroom photo: Painting at centers",
      type: "photos",
      priority: "normal",
      dedupeKey: "child-media:media-1:guardian-user-2",
    },
  ]);
});

test("shared teacher photo notifications honor parent photo alert preferences", () => {
  assert.equal(shouldNotifyGuardianOfSharedPhoto({
    userId: "guardian-user-1",
    user: { isActive: true },
    customFields: {
      notificationPreferences: {
        portal: true,
        photos: false,
      },
    },
  }), false);

  assert.equal(shouldNotifyGuardianOfSharedPhoto({
    userId: "guardian-user-2",
    user: { isActive: true },
    customFields: {
      notificationPreferences: {
        portal: false,
        photos: true,
      },
    },
  }), false);

  assert.equal(shouldNotifyGuardianOfSharedPhoto({
    userId: "guardian-user-3",
    user: { isActive: true },
    customFields: {
      notificationPreferences: {
        portal: true,
        photos: true,
      },
    },
  }), true);
});
