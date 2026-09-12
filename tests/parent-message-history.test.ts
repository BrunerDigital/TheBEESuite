import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appendEarlierParentMessages, isParentHistoryId, isParentMessagePage, safeMessageDownloadUrl } from "../src/lib/parent-message-history";
import { messageAttachmentView, type StoredMessageAttachment } from "../src/lib/message-attachments";

const item = { id: "message-001", subject: "Fake canonical subject", body: "Fake body", createdAt: "2026-09-12T14:00:00.000Z", sender: { name: "Fake Teacher" }, isFromFamily: false, canReport: true, attachments: [] };
const receipt = { ok: true, familyId: "fake-family", requestCursor: "message-002", items: [item], nextCursor: null };
test("message history receipts require exact family/cursor and complete typed ordered items", () => {
  assert.equal(isParentMessagePage(receipt, "fake-family", "message-002"), true);
  for (const patch of [{ ok: false }, { familyId: "other" }, { requestCursor: "wrong" }, { nextCursor: "arbitrary" }, { items: {} }, { items: [item, item] }, { items: [{ ...item, createdAt: "invalid" }] }, { items: [{ ...item, isFromFamily: "false" }] }, { items: [{ ...item, sender: {} }] }, { items: [{ ...item, id: "../bad" }] }, { items: [{ ...item, attachments: [{}] }] }]) {
    assert.equal(isParentMessagePage({ ...receipt, ...patch }, "fake-family", "message-002"), false, JSON.stringify(patch));
  }
  assert.equal(isParentMessagePage({ ...receipt, items: [item, { ...item, id: "message-003" }] }, "fake-family", "message-002"), false);
  assert.equal(isParentMessagePage({ ...receipt, items: [item, { ...item, id: "message-000", createdAt: "2026-09-13T00:00:00Z" }] }, "fake-family", "message-002"), false);
  for (const id of [null, "", "../fake", "fake/id", " fake ", "a".repeat(192)]) assert.equal(isParentHistoryId(id), false);
});
test("earlier pages deduplicate without changing loaded message order", () => {
  const oldest = { ...item, id: "message-000" };
  assert.deepEqual(appendEarlierParentMessages([item], [item, oldest]), [item, oldest]);
});
test("attachment public views never expose storage fields even when signing is unavailable", () => {
  const stored: StoredMessageAttachment = { id: "fake-file", filename: "fake.txt", size: 10, kind: "file", contentType: "text/plain", bucket: "child-media", storageKey: "private-key", url: "supabase://private/key", uploadedAt: "2026-09-12", uploadedById: "private-uploader" };
  for (const url of [stored.url, "javascript:alert(1)", "httpjavascript:bad", "//files.example.test", "https://user:secret@files.example.test"]) {
    assert.equal(safeMessageDownloadUrl(url), null); assert.equal(messageAttachmentView(stored, url).downloadUrl, null);
  }
  const view = messageAttachmentView(stored, "https://files.example.test/fake");
  assert.deepEqual(Object.keys(view).sort(), ["downloadUrl", "filename", "id", "kind", "size"]); assert.equal(view.downloadUrl, "https://files.example.test/fake");
});
test("parent deep replies use separately authorized database subjects, not URL text", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /where: \{ AND: \[parentMessageWhere, \{ id: parentReplyToMessageId \}\] \}/);
  assert.match(page, /subject: parentReplyTarget.subject/); assert.doesNotMatch(page, /parentReplySubject = firstSearchParam/);
  const ui = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /messageHistory\.messages\s*\.slice\(\)\s*\.reverse\(\)/); assert.doesNotMatch(ui, /messages\s*\.slice\(0, 20\)/);
});
test("actual parent message history route enforces current family, bounded paging and private read-only errors", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/parent-message-history-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /41 equal-timestamp messages/); assert.match(result.stdout, /foreign cursors/);
});

test("actual parent message POST rejects unsafe scope and protects its commit and delivery boundaries", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/parent-message-send-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /moved reply teachers/); assert.match(result.stdout, /unknown commits retain/);
});
