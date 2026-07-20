import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createClassroomOfflineAction,
  clearClassroomOfflineQueues,
  classifyClassroomReplayStatus,
  decryptClassroomOfflineQueue,
  encryptClassroomOfflineQueue,
  parseClassroomOfflineQueue,
  serializeClassroomOfflineQueue,
} from "../src/lib/classroom-offline-queue";

test("classroom offline action captures endpoint body label and created time", () => {
  const action = createClassroomOfflineAction({
    endpoint: "/api/teacher/attendance",
    body: { childId: "child_1", status: "present", clientActionId: "offline_1" },
    label: "Ava attendance",
    now: new Date("2026-06-05T12:00:00.000Z"),
    randomId: "offline_1",
  });

  assert.deepEqual(action, {
    id: "offline_1",
    endpoint: "/api/teacher/attendance",
    method: "POST",
    body: { childId: "child_1", status: "present", clientActionId: "offline_1" },
    label: "Ava attendance",
    createdAt: "2026-06-05T12:00:00.000Z",
  });
});

test("classroom replay completes successes, retries transient failures, and retains conflicts for review", () => {
  assert.equal(classifyClassroomReplayStatus(200), "complete");
  assert.equal(classifyClassroomReplayStatus(429), "retry");
  assert.equal(classifyClassroomReplayStatus(503), "retry");
  assert.equal(classifyClassroomReplayStatus(409), "review");
  assert.equal(classifyClassroomReplayStatus(403), "review");
});

test("classroom offline queue encrypts payloads and rejects account scope switching", async () => {
  const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const actions = [createClassroomOfflineAction({ endpoint: "/api/teacher/incidents", body: { childId: "child_1", description: "Sensitive" }, label: "Incident", randomId: "action_1" })];
  const envelope = await encryptClassroomOfflineQueue({ actions, key, scopeId: "scope_teacher_a", iv: new Uint8Array(12), now: new Date("2026-07-20T12:00:00.000Z") });

  assert.equal(JSON.stringify(envelope).includes("Sensitive"), false);
  assert.deepEqual(await decryptClassroomOfflineQueue({ envelope, key, scopeId: "scope_teacher_a" }), actions);
  await assert.rejects(() => decryptClassroomOfflineQueue({ envelope, key, scopeId: "scope_teacher_b" }), /another account or classroom/);
});

test("logout cleanup removes legacy and scoped classroom queues only", () => {
  const values = new Map<string, string>([["bee_suite_classroom_offline_queue_v1", "legacy"], ["bee_suite_classroom_offline_queue_v2:scope", "encrypted"], ["bee-suite-theme", "dark"]]);
  const storage = {
    get length() { return values.size; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(clearClassroomOfflineQueues(storage), 2);
  assert.deepEqual(Array.from(values.keys()), ["bee-suite-theme"]);
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
