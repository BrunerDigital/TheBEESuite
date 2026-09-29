import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { blockedMessageSenderIds, messagesExcludingBlockedSenders, recipientsAllowingMessageSender, messageNotificationSenderId } from "../src/lib/message-block-policy";
import { createDirectMessage, createMessageNotification, messageRecipientsAllowed, permittedMessageRetryRecipients, setMessageSenderBlock, visibleReceivedMessage } from "../src/lib/message-block-store";

test("a concurrent recipient block cannot commit between the message preference read and insertion", { timeout: 5000 }, async () => {
  let rowTail = Promise.resolve(), blocked = false;
  const events: string[] = [];
  let readReached!: () => void, finishRead!: () => void;
  const readStarted = new Promise<void>(resolve => { readReached = resolve; });
  const readGate = new Promise<void>(resolve => { finishRead = resolve; });
  const db = { async $transaction(callback: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    let unlock: (() => void) | undefined;
    async function acquire() { if (unlock) return; const previous = rowTail; rowTail = new Promise<void>(resolve => { unlock = resolve; }); await previous; }
    const tx = {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        const query = Prisma.sql(strings, ...values); assert.match(query.text, /ORDER BY "id" FOR UPDATE/);
        assert.deepEqual([...query.values].sort(), ["recipient", "sender"]); await acquire(); return query.values.map(id => ({ id }));
      },
      async $executeRaw() { await acquire(); blocked = true; events.push("block"); return 1; },
      user: { async findFirst({ where }: { where: { id: string } }) {
        if (where.id === "recipient") { readReached(); await readGate; }
        return { role: where.id === "sender" ? "CENTER_DIRECTOR" : "TEACHER", customFields: { messageBlocks: { sender: where.id === "recipient" && blocked } } };
      } },
      message: { async create() { events.push("message"); return { id: "synthetic-message" }; } },
      notification: { async updateMany() {} }, auditLog: { async create() {} },
    } as unknown as Prisma.TransactionClient;
    try { return await callback(tx); } finally { unlock?.(); }
  } } as unknown as PrismaClient;
  const send = createDirectMessage(db, { userId: "sender", identityTenantId: "tenant", senderRole: "CENTER_DIRECTOR", recipientTenantId: "tenant", recipientId: "recipient", recipientRole: "TEACHER", data: { senderId: "sender", assignedToId: "recipient", subject: "Synthetic subject", body: "Synthetic message", channel: "portal" } });
  await readStarted;
  const block = db.$transaction(tx => setMessageSenderBlock(tx, { userId: "recipient", identityTenantId: "tenant", tenantId: "tenant", senderId: "sender", centerId: null, blocked: true }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(blocked, false); finishRead(); await Promise.all([send, block]);
  assert.deepEqual(events, ["message", "block"]);
});

test("a legacy phone-only SMS retry finds formatted staff phones and verifies the complete number", async () => {
  let blocked = true;
  const storedPhone = "(555) 555-0123";
  const db = { message: { findUnique: async () => ({ senderId: "parent", assignedToId: null, family: null }) }, user: {
    findMany: async ({ where }: { where: { AND: [{ OR: unknown[] }, { OR: Array<{ staffProfile?: { phone?: { contains?: string; in?: string[] } } }> }] } }) => {
      assert.deepEqual(where.AND[0].OR, [{ tenantId: "tenant" }, { role: "PLATFORM_OWNER" }]);
      const found = where.AND[1].OR.some(branch => branch.staffProfile?.phone?.contains ? storedPhone.includes(branch.staffProfile.phone.contains) : branch.staffProfile?.phone?.in?.includes(storedPhone));
      return found ? [{ id: "director", email: "director@example.test", customFields: { messageBlocks: { parent: blocked } }, staffProfile: { phone: storedPhone } }] : [];
    },
  } } as unknown as PrismaClient;
  const recipients = [{ phone: "+15555550123" }, { phone: "+15550000123" }];
  assert.deepEqual(await permittedMessageRetryRecipients(db, "tenant", "message", [], recipients), [recipients[1]]);
  blocked = false;
  assert.deepEqual(await permittedMessageRetryRecipients(db, "tenant", "message", [], recipients), recipients);
});

test("blocking and notification insertion share a recipient lock in either commit order", async () => {
  for (const blockFirst of [true, false]) {
    let fields: Record<string, unknown> = {};
    const notifications: Array<{ dedupeKey: string; archivedAt: Date | null }> = [];
    let releaseFirst!: () => void;
    const firstPaused = new Promise<void>(resolve => { releaseFirst = resolve; });
    let locked!: () => void;
    const firstLocked = new Promise<void>(resolve => { locked = resolve; });
    let lockTail = Promise.resolve();
    let first = true;
    const db = { async $transaction(callback: (tx: Prisma.TransactionClient) => Promise<unknown>) {
      const previous = lockTail;
      let unlock!: () => void;
      lockTail = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      const waitOnFirst = async () => { if (first) { first = false; locked(); await firstPaused; } };
      const tx = {
        async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          const query = Prisma.sql(strings, ...values);
          assert.match(query.text, /WHERE "id" = \$1 FOR UPDATE/); assert.deepEqual(query.values, ["recipient"]);
          await waitOnFirst(); return [{ id: "recipient" }];
        },
        async $executeRaw() { fields = { messageBlocks: { sender: true } }; await waitOnFirst(); return 1; },
        user: { async findUnique() { return { isActive: true, customFields: fields }; } },
        notification: {
          async create({ data }: { data: { dedupeKey: string } }) { const row = { ...data, archivedAt: null }; notifications.push(row); return row; },
          async updateMany({ where }: { where: { userId: string; OR: [{ dedupeKey: { startsWith: string } }, unknown] } }) {
            assert.equal(where.userId, "recipient"); assert.deepEqual(where.OR[1], { dedupeKey: null, type: "message", title: "Incoming parent SMS" });
            for (const notification of notifications) if (notification.dedupeKey.startsWith(where.OR[0].dedupeKey.startsWith)) notification.archivedAt = new Date();
          },
        },
        auditLog: { async create() {} },
      } as unknown as Prisma.TransactionClient;
      try { return await callback(tx); } finally { unlock(); }
    } } as unknown as PrismaClient;
    const notify = () => createMessageNotification(db, "sender", { data: { userId: "recipient", title: "Synthetic message", body: "Synthetic content", dedupeKey: "message-sender:sender:message:recipient", type: "message" } });
    const block = () => db.$transaction(tx => setMessageSenderBlock(tx, { userId: "recipient", identityTenantId: "tenant", tenantId: "tenant", senderId: "sender", centerId: null, blocked: true }));
    const firstAction = blockFirst ? block() : notify();
    await firstLocked;
    const secondAction = blockFirst ? notify() : block();
    assert.equal(notifications.length, 0);
    releaseFirst(); await Promise.all([firstAction, secondAction]);
    assert.equal(notifications.filter(notification => !notification.archivedAt).length, 0);
    assert.equal(notifications.length, blockFirst ? 0 : 1);
  }
});

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
    user: { findMany: async ({ where }: { where: { AND: Array<{ OR: unknown[] }> } }) => {
      assert.deepEqual(where.AND[0].OR, [{ tenantId: "tenant-1" }, { role: "PLATFORM_OWNER" }]);
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

test("centerless family blocking resolves a single current school and rejects mixed or foreign classrooms", async () => {
  let children = [{ classroomId: "room", classroom: { centerId: "center" } }];
  let tenantId = "tenant";
  const viewer = { id: "teacher", tenantId: "tenant", role: "TEACHER", centerIds: ["center"], assignedClassroomId: "room", canAccessEveryCenter: false };
  const db = {
    message: { findUnique: async ({ include }: { include: { family: { include: { children: { select: unknown } } } } }) => {
      assert.deepEqual(include.family.include.children.select, { classroomId: true, classroom: { select: { centerId: true } } });
      return { senderId: "parent", assignedToId: null, familyId: "family", threadKey: "family:family", sender: { tenantId }, family: { centerId: null, guardians: [{ userId: "parent" }], children } };
    } },
    center: { findUnique: async () => ({ organization: { tenantId } }) },
  } as unknown as PrismaClient;
  assert.deepEqual(await visibleReceivedMessage(db, viewer, "message"), { senderId: "parent", centerId: "center" });
  assert.deepEqual(await visibleReceivedMessage(db, { ...viewer, role: "CENTER_DIRECTOR", assignedClassroomId: null }, "message"), { senderId: "parent", centerId: "center" });
  assert.equal(await visibleReceivedMessage(db, { ...viewer, assignedClassroomId: "other-room" }, "message"), null);
  tenantId = "foreign-tenant"; assert.equal(await visibleReceivedMessage(db, viewer, "message"), null); tenantId = "tenant";
  children = [...children, { classroomId: "other-room", classroom: { centerId: "other-center" } }];
  assert.equal(await visibleReceivedMessage(db, viewer, "message"), null);
  children = []; assert.equal(await visibleReceivedMessage(db, viewer, "message"), null);
});

test("authorized owner copies respect identity-tenant blocks while foreign ordinary accounts remain outside lookup scope", async () => {
  const recipients = [{ userId: "owner", email: "owner@example.test" }, { userId: "foreign", email: "foreign@example.test" }, { userId: "parent", email: "parent@example.test" }];
  const rows = [
    { id: "owner", tenantId: "platform-tenant", role: "PLATFORM_OWNER", email: recipients[0].email, customFields: { messageBlocks: { sender: true } } },
    { id: "foreign", tenantId: "other-school", role: "TEACHER", email: recipients[1].email, customFields: { messageBlocks: { sender: true } } },
    { id: "parent", tenantId: "school", role: "PARENT_GUARDIAN", email: recipients[2].email, customFields: {} },
  ];
  const db = { message: { findUnique: async () => ({ senderId: "sender", assignedToId: null, family: null }) }, user: {
    findMany: async ({ where }: { where: { AND: Array<{ OR: Array<Record<string, string>> }> } }) => {
      assert.deepEqual(where.AND[0].OR, [{ tenantId: "school" }, { role: "PLATFORM_OWNER" }]);
      return rows.filter(row => where.AND[0].OR.some(branch => Object.entries(branch).every(([key, value]) => row[key as "tenantId" | "role"] === value)));
    },
  } } as unknown as PrismaClient;
  assert.deepEqual(await messageRecipientsAllowed(db, "school", "sender", recipients), recipients.slice(1));
  // Older email payloads lack recipient IDs; exact delivery addresses still find owners.
  const addresses = recipients.map(({ email }) => ({ email }));
  assert.deepEqual(await permittedMessageRetryRecipients(db, "school", "message", [], addresses), addresses.slice(1));
});

test("actual blocking endpoints reject forged scope and keep reversible changes private", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/message-block-route-mocks.mjs", import.meta.url))], { encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("dashboard previews and unread counts both use the viewer's blocked-sender scope", async () => {
  const dashboard = await readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /const messageWhere = \{ \.\.\.messagesExcludingBlockedSenders\(await readBlockedMessageSenderIds\(prisma, user\.id\)\), family: currentFamilyWhere \}/);
  assert.match(dashboard, /prisma\.message\.count\(\{\s*where: \{\s*\.\.\.messageWhere,\s*readAt: null/);
  assert.match(dashboard, /prisma\.message\.findMany\(\{\s*where: messageWhere/);
});
