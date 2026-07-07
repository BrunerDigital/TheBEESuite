import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  messageNotificationPreferenceRoles,
  shouldNotifyLeadershipOfFamilyMessage,
  uniqueMessageNotificationUsers,
} from "@/lib/message-notification-recipients";

test("teacher and parent family messages notify leadership for oversight", () => {
  assert.equal(shouldNotifyLeadershipOfFamilyMessage({
    senderIsParent: true,
    senderRole: UserRole.PARENT_GUARDIAN,
  }), true);
  assert.equal(shouldNotifyLeadershipOfFamilyMessage({
    senderIsParent: false,
    senderRole: UserRole.TEACHER,
  }), true);
  assert.equal(shouldNotifyLeadershipOfFamilyMessage({
    senderIsParent: false,
    senderRole: UserRole.CENTER_DIRECTOR,
  }), false);
});

test("message notification users are deduped and exclude the sender", () => {
  assert.deepEqual(uniqueMessageNotificationUsers([
    { id: "director-1", role: UserRole.CENTER_DIRECTOR, email: "director@example.com", phone: null },
    { id: "teacher-1", role: UserRole.TEACHER, email: "teacher@example.com", phone: null },
    { id: "director-1", role: UserRole.CENTER_DIRECTOR, email: "director@example.com", phone: null },
    { id: "sender-1", role: UserRole.TEACHER, email: "sender@example.com", phone: null },
  ], "sender-1"), [
    { id: "director-1", role: UserRole.CENTER_DIRECTOR, email: "director@example.com", phone: null },
    { id: "teacher-1", role: UserRole.TEACHER, email: "teacher@example.com", phone: null },
  ]);
});

test("message notification preference roles include staff recipients and parents", () => {
  assert.deepEqual(messageNotificationPreferenceRoles({
    staffRecipients: [
      { id: "director-1", role: UserRole.CENTER_DIRECTOR, email: "director@example.com", phone: null },
      { id: "teacher-1", role: UserRole.TEACHER, email: "teacher@example.com", phone: null },
      { id: "teacher-2", role: UserRole.TEACHER, email: "teacher2@example.com", phone: null },
    ],
    notifyParents: true,
  }), [UserRole.CENTER_DIRECTOR, UserRole.TEACHER, UserRole.PARENT_GUARDIAN]);
});
