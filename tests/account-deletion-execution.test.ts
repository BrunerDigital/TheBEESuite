import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accountDeletionApprovalPhrase,
  accountDeletionExecutionPhrase,
  accountDeletionFingerprint,
  canExecuteAccountDeletion,
} from "../src/lib/account-deletion-policy";

test("account deletion uses stable request-specific approval and execution phrases", () => {
  const input = { id: "request-1", tenantId: "tenant-1", userId: "user-1", createdAt: "2026-09-08T12:00:00.000Z" };
  const fingerprint = accountDeletionFingerprint(input);
  assert.equal(fingerprint.length, 10);
  assert.equal(accountDeletionFingerprint(input), fingerprint);
  assert.equal(accountDeletionApprovalPhrase(fingerprint), `APPROVE ${fingerprint}`);
  assert.equal(accountDeletionExecutionPhrase(fingerprint), `DELETE LOGIN ${fingerprint}`);
});

test("account deletion execution fails closed for roles, statuses, and self-deletion", () => {
  const allowed = {
    status: "approved",
    targetRole: "PARENT_GUARDIAN",
    targetUserId: "parent-1",
    actorUserId: "owner-1",
    retentionNoticeAccepted: true,
    schoolReviewRequired: true,
  };
  assert.equal(canExecuteAccountDeletion(allowed), true);
  assert.equal(canExecuteAccountDeletion({ ...allowed, status: "verified" }), false);
  assert.equal(canExecuteAccountDeletion({ ...allowed, targetRole: "PLATFORM_OWNER" }), false);
  assert.equal(canExecuteAccountDeletion({ ...allowed, targetUserId: "owner-1" }), false);
  assert.equal(canExecuteAccountDeletion({ ...allowed, retentionNoticeAccepted: false }), false);
  assert.equal(canExecuteAccountDeletion({ ...allowed, status: "executing", updatedAt: "2026-09-08T11:30:00.000Z", now: "2026-09-08T12:00:00.000Z" }), true);
  assert.equal(canExecuteAccountDeletion({ ...allowed, status: "executing", updatedAt: "2026-09-08T11:55:00.000Z", now: "2026-09-08T12:00:00.000Z" }), false);
});

test("account deletion executor removes auth access while retaining historical records", async () => {
  const route = await readFile(new URL("../src/app/api/privacy/deletion-requests/[id]/review/route.ts", import.meta.url), "utf8");
  const requestRoute = await readFile(new URL("../src/app/api/privacy/deletion-requests/route.ts", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const queue = await readFile(new URL("../src/components/privacy-deletion-queue.tsx", import.meta.url), "utf8");
  assert.match(route, /actor\.role !== UserRole\.PLATFORM_OWNER/);
  assert.match(route, /findUnique\(\{\s*where: \{ id \}/);
  assert.match(route, /target\.tenantId !== deletionRequest\.tenantId/);
  assert.match(route, /deletionRequest\.center\?\.organization\.tenantId !== deletionRequest\.tenantId/);
  assert.match(route, /tenantId: deletionRequest\.tenantId/g);
  assert.doesNotMatch(route, /tenantId: actor\.tenantId/);
  assert.match(requestRoute, /where: \{ id: guardianId, userId: user\.id \}/);
  assert.match(requestRoute, /organization: \{ tenantId: user\.tenantId \}/);
  assert.match(requestRoute, /guardian\.userId === user\.id && Boolean\(familyCenter\)/);
  assert.match(dashboard, /const privacyDeletionRequests = user\.role === UserRole\.PLATFORM_OWNER[\s\S]*?where: \{\s*status:/);
  assert.doesNotMatch(dashboard, /privacyDeletionRequests[\s\S]{0,220}tenantId: user\.tenantId/);
  assert.match(dashboard, /"approved",\s*"executing",\s*"partially_completed"/);
  assert.match(route, /deleteSupabaseAuthUserByEmail/);
  assert.match(route, /userAccessGrant\.updateMany/);
  assert.match(route, /deviceSession\.updateMany/);
  assert.match(route, /webPushSubscription\.updateMany/);
  assert.match(route, /guardian\.updateMany/);
  assert.match(route, /sessionVersion: \{ increment: 1 \}/);
  assert.match(route, /status: "executing"/);
  assert.match(route, /claimed\.count !== 1/);
  assert.match(route, /provider_delete_failed/);
  assert.match(route, /provider_deleted_local_cleanup_pending/);
  assert.match(route, /privacy\.account_deletion\.local_cleanup_failed/);
  assert.match(route, /provider_delete_failed/);
  assert.match(route, /provider_deleted_local_cleanup_pending/);
  assert.match(route, /privacy\.account_deletion\.local_cleanup_failed/);
  assert.match(route, /retainedRecords: \["childcare", "safety", "billing", "payment", "audit"\]/);
  assert.match(queue, /"approved", "executing", "partially_completed"/);
  assert.doesNotMatch(route, /family\.delete|child\.delete|invoice\.delete|payment\.delete|auditLog\.delete/);
});
