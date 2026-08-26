import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

test("child creation serializes by family and reuses an exact repeated submission", () => {
  assert.match(route, /FROM "Family"[\s\S]*?WHERE "id" = \$\{familyId\}[\s\S]*?FOR UPDATE/);
  assert.match(route, /fullName: \{ equals: data\.fullName, mode: "insensitive" \}/);
  assert.match(route, /dateOfBirth: data\.dateOfBirth/);
  assert.match(route, /const exactRepeat = matchingChild\.classroomId === data\.classroomId/);
  assert.match(route, /operationMode = "existing"/);
  assert.match(route, /duplicateCreatePrevented = true/);
  assert.match(route, /status: id \|\| operationMode === "existing" \? 200 : 201/);
  assert.match(route, /notificationEntities\.has\(entity\) && auditMetadata\.duplicateCreatePrevented !== true/);
  assert.match(editor, /The existing child profile was kept and no duplicate was created\./);
});

test("a same-name and birth-date create with changed data is blocked for explicit edit or reenrollment", () => {
  assert.match(route, /action: "operations\.child\.duplicate_create_blocked"/);
  assert.match(route, /code: "CHILD_ALREADY_EXISTS"/);
  assert.match(route, /Open the existing child to update or re-enroll them\./);
  assert.match(route, /existingChildId: createResult\.record\.id/);
  assert.match(route, /\}, \{ status: 409 \}\)/);
});
