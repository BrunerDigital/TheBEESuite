export const PHOTO_PERMISSION_REVIEW_WARNING =
  "Photo saved for director review. It is not visible to parents because photo/video permission is not enabled for this child.";

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
