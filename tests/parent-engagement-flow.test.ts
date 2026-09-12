import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const parentPage = readFileSync("src/app/[slug]/page.tsx", "utf8");
const messageRoute = readFileSync("src/app/api/communications/messages/route.ts", "utf8");
const parentRecipients = readFileSync("src/lib/parent-message-recipients.ts", "utf8");

test("parent reports keep key notes visible and disclose complete care details without truncation", () => {
  const start = workspace.indexOf('{activeView === "updates" ? (');
  const end = workspace.indexOf('{activeView === "family"', start);
  assert.ok(start >= 0 && end > start, "The Updates section must be present");
  const updates = workspace.slice(start, end);
  assert.match(updates, /Teacher note:/);
  assert.match(updates, /report\.activities\?\.map/);
  assert.doesNotMatch(updates, /report\.activities\?\.slice\(0, 4\)/);
  assert.ok(updates.indexOf("Teacher note:") < updates.indexOf("<details"));
  assert.ok(updates.indexOf("Please bring:") < updates.indexOf("<details"));
  assert.ok(updates.indexOf("Check-in:") < updates.indexOf("<details"));
  assert.match(updates, /<summary[^>]*>Meals, naps, care &amp; activities<\/summary>/);
  assert.doesNotMatch(updates, /<details[^>]*\bopen\b|<CollapsiblePanel|group-open:hidden/);
  for (const label of ["Mood:", "meal", "nap", "care log", "activit"]) assert.match(updates, new RegExp(label));
});

test("parents can choose only teachers from their children's current classrooms", () => {
  assert.match(parentPage, /classroomTeachers=\{paymentContinuityAccess \? \[\] : classroomTeachers\}/);
  assert.match(parentPage, /sentAt: \{ not: null \}/);
  assert.match(parentPage, /role: UserRole\.TEACHER/);
  assert.match(parentPage, /classroomId: \{ in: parentClassroomIds/);
  assert.match(workspace, /Choose message recipient/);
  assert.match(workspace, /assignedToId: !replyToMessageId/);
  assert.match(messageRoute, /Teacher is not assigned to your child’s current classroom/);
  assert.match(messageRoute, /currentParentMessageTeacherWhere\(/);
  assert.match(parentRecipients, /role: UserRole\.TEACHER/);
  assert.match(parentRecipients, /child\.classroom\?\.centerId === centerId/);
  assert.match(parentRecipients, /currentlyEnrolledChildWhere\(\)/);
});
