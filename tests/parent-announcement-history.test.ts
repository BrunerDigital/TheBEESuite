import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appendEarlierParentAnnouncements, isEarlierParentAnnouncement, isParentAnnouncementPage, parseParentAnnouncementRequest } from "../src/lib/parent-announcement-history";

const item = { id: "notice-010", title: "Fake notice", body: "Fake school information", sendAt: "2026-09-13T14:00:00.000Z" };
const page = { ok: true, familyId: "fake-family", requestCursor: "notice-011", items: [item], nextCursor: null };
test("announcement receipts reject wrong correlation, leaks, invalid dates and unordered or oversized pages", () => {
  assert.equal(isParentAnnouncementPage(page, "fake-family", "notice-011"), true);
  for (const patch of [{ ok: false }, { familyId: "foreign" }, { requestCursor: null }, { nextCursor: "random" }, { secret: true }, { items: [...Array(9)].map((_, i) => ({ ...item, id: `notice-${i}` })) },
    { items: [item, item] }, { items: [{ ...item, centerId: "private" }] }, { items: [{ ...item, id: "notice-011" }] }, { items: [{ ...item, body: null }] },
    ...["bad", "2026-02-31T00:00:00.000Z", "2026-09-13T14:00:00Z", new Date(item.sendAt)].map(sendAt => ({ items: [{ ...item, sendAt }] })),
    { items: [item, { ...item, id: "notice-012" }] }, { items: [{ ...item, sendAt: null }, item] }]) {
    assert.equal(isParentAnnouncementPage({ ...page, ...patch }, "fake-family", "notice-011"), false, JSON.stringify(patch));
  }
  const items = Array.from({ length: 8 }, (_, i) => ({ ...item, id: `notice-${String(10 - i).padStart(3, "0")}` }));
  assert.equal(isParentAnnouncementPage({ ...page, items, nextCursor: "notice-003" }, "fake-family", "notice-011"), true);
  assert.equal(isParentAnnouncementPage({ ...page, items: [{ ...item, sendAt: null }] }, "fake-family", "notice-011"), true);
});
test("announcement tuple ordering puts null dates last and preserves existing rows on append", () => {
  assert.equal(isEarlierParentAnnouncement({ ...item, id: "notice-009" }, item), true);
  assert.equal(isEarlierParentAnnouncement({ ...item, id: "notice-009", sendAt: null }, item), true);
  assert.equal(isEarlierParentAnnouncement(item, { ...item, id: "notice-009", sendAt: null }), false);
  assert.equal(isEarlierParentAnnouncement({ ...item, id: "notice-009", sendAt: null }, { ...item, sendAt: null }), true);
  assert.equal(isEarlierParentAnnouncement({ ...item, id: "notice-009", sendAt: "bad" }, item), false);
  assert.deepEqual(appendEarlierParentAnnouncements([item], [item, { ...item, id: "notice-009" }]).map(row => row.id), ["notice-010", "notice-009"]);
});
test("announcement query parameters are exact and bounded", () => {
  assert.deepEqual(parseParentAnnouncementRequest(new URLSearchParams("familyId=fake-family")), { familyId: "fake-family", cursor: null });
  for (const query of ["", "familyId=", "familyId=../bad", "familyId=fake&cursor=", "familyId=fake&cursor=a&cursor=b", "familyId=fake&familyId=other", "familyId=fake&centerId=other", `familyId=${"a".repeat(192)}`]) assert.equal(parseParentAnnouncementRequest(new URLSearchParams(query)), null);
});
test("SSR announcement continuation shares current-family snapshot and suppresses reviewer and payment-only notices", () => {
  const source = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const announcements = parentHomeRequested \? await readParentAnnouncementRows\(tx, context, null, verifiedAppReviewKind === "parent"\)/);
  assert.match(source, /where: verifiedAppReviewKind === "parent" \|\| parentHistoryEnabled \|\| paymentContinuityAccess/);
  assert.match(source, /announcementHistoryNextCursor=\{parentUpdateSnapshot\?\.announcements\?\.nextCursor \?\? null\}/);
  const ui = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /!paymentContinuityAccess && !previewMode && !demoMode && !appReviewMode/);
  assert.match(ui, /Earlier announcements \(\{announcements.length - 1\} loaded\)/);
});
test("actual announcement history GET enforces current family, scoped cursors, safe DTOs and reviewer suppression", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/parent-announcement-history-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /101 notices/); assert.match(result.stdout, /reserved reviewer/);
});
