import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createClassroomOfflineAction,
  parseClassroomOfflineQueue,
  serializeClassroomOfflineQueue,
} from "../src/lib/classroom-offline-queue";

test("classroom offline action captures endpoint body label and created time", () => {
  const action = createClassroomOfflineAction({
    endpoint: "/api/teacher/attendance",
    body: { childId: "child_1", status: "present" },
    label: "Ava attendance",
    now: new Date("2026-06-05T12:00:00.000Z"),
    randomId: "offline_1",
  });

  assert.deepEqual(action, {
    id: "offline_1",
    endpoint: "/api/teacher/attendance",
    method: "POST",
    body: { childId: "child_1", status: "present" },
    label: "Ava attendance",
    createdAt: "2026-06-05T12:00:00.000Z",
  });
});

test("classroom offline queue parser ignores malformed records", () => {
  const parsed = parseClassroomOfflineQueue(JSON.stringify([
    {
      id: "offline_1",
      endpoint: "/api/teacher/incidents",
      method: "POST",
      body: { childId: "child_1" },
      label: "Incident",
      createdAt: "2026-06-05T12:00:00.000Z",
    },
    { id: "bad", endpoint: "/api/teacher/incidents", method: "GET" },
  ]));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "offline_1");
  assert.deepEqual(parseClassroomOfflineQueue("not-json"), []);
});

test("classroom offline queue serializer caps retained actions", () => {
  const actions = Array.from({ length: 55 }, (_, index) => createClassroomOfflineAction({
    endpoint: "/api/teacher/attendance",
    body: { index },
    label: `Action ${index}`,
    randomId: `offline_${index}`,
    now: new Date("2026-06-05T12:00:00.000Z"),
  }));

  assert.equal(parseClassroomOfflineQueue(serializeClassroomOfflineQueue(actions)).length, 50);
});
