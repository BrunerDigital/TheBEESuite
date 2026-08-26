import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const parentPage = readFileSync("src/app/[slug]/page.tsx", "utf8");
const messageRoute = readFileSync("src/app/api/communications/messages/route.ts", "utf8");

test("parent daily reports are complete, concise, and visible without expansion", () => {
  assert.match(workspace, /Teacher note:/);
  assert.match(workspace, /report\.activities\?\.map/);
  assert.doesNotMatch(workspace, /report\.activities\?\.slice\(0, 4\)/);
  assert.doesNotMatch(workspace, /group-open:hidden">View day/);
  for (const label of ["Mood:", "meal", "nap", "care log", "activit"]) assert.match(workspace, new RegExp(label));
});

test("parents can choose only teachers from their children's current classrooms", () => {
  assert.match(parentPage, /classroomTeachers=\{classroomTeachers\}/);
  assert.match(parentPage, /sentAt: \{ not: null \}/);
  assert.match(parentPage, /role: UserRole\.TEACHER/);
  assert.match(parentPage, /classroomId: \{ in: parentClassroomIds/);
  assert.match(workspace, /Choose message recipient/);
  assert.match(workspace, /assignedToId: !replyToMessageId/);
  assert.match(messageRoute, /Teacher is not assigned to your child’s current classroom/);
  assert.match(messageRoute, /role: UserRole\.TEACHER/);
});
