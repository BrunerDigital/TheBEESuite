import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { blockedMessageSenderIds, messagesExcludingBlockedSenders, recipientsAllowingMessageSender, messageNotificationSenderId } from "../src/lib/message-block-policy";
import { permittedMessageRetryRecipients, visibleReceivedMessage } from "../src/lib/message-block-store";

test("blocking preferences accept only explicit safe sender IDs and preserve system messages", () => {
  for (const fields of [null, [], "invalid", { messageBlocks: null }, { messageBlocks: [] }]) assert.deepEqual(blockedMessageSenderIds(fields), []);
  assert.deepEqual(blockedMessageSenderIds({ messageBlocks: { sender: true, other: false, truthy: "true", "bad:id": true } }), ["sender"]);
  assert.deepEqual(messagesExcludingBlockedSenders([]), {});
  assert.deepEqual(messagesExcludingBlockedSenders(["sender"]), { OR: [{ senderId: null }, { senderId: { notIn: ["sender"] } }] });
  assert.equal(messageNotificationSenderId("message-sender:staff-1:message-1:parent-1"), "staff-1");
  assert.equal(messageNotificationSenderId("tuition:staff-1"), null);
});

test("a block suppresses all recipient copies, shared billing addresses and normalized SMS while other families remain unaffected", () => {
  const recipients = [
    { userId: "parent-1", email: "guardian@example.test", phone: "(555) 555-0123" },
    { email: "GUARDIAN@example.test" },
    { phone: "+15555550123" },
    { userId: "parent-2", email: "other@example.test", phone: "+15555550124" },
  ];
  const users = [{ id: "parent-1", email: "login@example.test", customFields: { unrelated: "preserved", messageBlocks: { sender: true } }, guardians: [{ email: "guardian@example.test", phone: "5555550123" }] }];
  assert.deepEqual(recipientsAllowingMessageSender(recipients, users, "sender"), [recipients[3]]);
  assert.deepEqual(recipientsAllowingMessageSender(recipients, users, "different-sender"), recipients);
  assert.deepEqual(recipientsAllowingMessageSender(recipients, [{ ...users[0], customFields: { messageBlocks: {} } }], "sender"), recipients);
});

test("block targets require a received message in the current family, classroom, staff thread and tenant", async () => {
  const viewer = { id: "parent", tenantId: "tenant-1", role: "PARENT_GUARDIAN", centerIds: ["center"], assignedClassroomId: "room", canAccessEveryCenter: false };
  let message: Record<string, unknown> | null = { id: "message", senderId: "sender", sender: { tenantId: "tenant-1" }, assignedToId: null,
    familyId: "family", threadKey: "family:family", family: { centerId: "center", guardians: [{ userId: "parent" }], children: [{ classroomId: "room" }] } };
  let tenantId = "tenant-1";
  const db = { message: { findUnique: async () => message }, center: { findUnique: async () => ({ organization: { tenantId } }) } } as unknown as PrismaClient;
  assert.deepEqual(await visibleReceivedMessage(db, viewer, "message"), { senderId: "sender", centerId: "center" });
  assert.equal(await visibleReceivedMessage(db, { ...viewer, id: "unlinked-parent" }, "message"), null);
  assert.equal(await visibleReceivedMessage(db, { ...viewer, id: "sender" }, "message"), null);
  assert.equal(await visibleReceivedMessage(db, { ...viewer, role: "TEACHER", id: "teacher", assignedClassroomId: "other-room" }, "message"), null);
  assert.deepEqual(await visibleReceivedMessage(db, { ...viewer, role: "TEACHER", id: "teacher" }, "message"), { senderId: "sender", centerId: "center" });
  tenantId = "other-tenant";
  assert.equal(await visibleReceivedMessage(db, viewer, "message"), null);
  tenantId = "tenant-1";
  message = { senderId: "sender", sender: { tenantId }, assignedToId: "teacher", familyId: null, threadKey: "staff:sender:teacher", family: null };
  assert.equal(await visibleReceivedMessage(db, viewer, "message"), null);
  assert.deepEqual(await visibleReceivedMessage(db, { ...viewer, id: "teacher", role: "TEACHER" }, "message"), { senderId: "sender", centerId: null });
  message = null;
  assert.equal(await visibleReceivedMessage(db, viewer, "missing"), null);
});

test("a pending delivery rechecks the current block and fails closed for a deleted message", async () => {
  let exists = true;
  let blocked = true;
  const db = {
    message: { findUnique: async () => exists ? { senderId: "sender", assignedToId: null, family: { guardians: [{ userId: "parent" }] } } : null },
    user: { findMany: async ({ where }: { where: { tenantId: string } }) => {
      assert.equal(where.tenantId, "tenant-1");
      return [{ id: "parent", email: "parent@example.test", customFields: { messageBlocks: { sender: blocked } }, guardians: [{ email: "parent@example.test", phone: "5555550123" }] }];
    } },
  } as unknown as PrismaClient;
  const recipients = [{ email: "parent@example.test" }, { phone: "+15555550123" }, { email: "other@example.test" }];
  assert.deepEqual(await permittedMessageRetryRecipients(db, "tenant-1", "message", [], recipients), [recipients[2]]);
  blocked = false;
  assert.deepEqual(await permittedMessageRetryRecipients(db, "tenant-1", "message", [], recipients), recipients);
  exists = false;
  assert.deepEqual(await permittedMessageRetryRecipients(db, "tenant-1", "message", [], recipients), []);
});

test("actual blocking endpoints reject forged scope and keep reversible changes private", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/message-block-route-mocks.mjs", import.meta.url))], { encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
