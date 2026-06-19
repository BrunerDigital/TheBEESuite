import assert from "node:assert/strict";
import test from "node:test";
import {
  PHOTO_PERMISSION_REVIEW_WARNING,
  resolveTeacherMediaShareState,
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
