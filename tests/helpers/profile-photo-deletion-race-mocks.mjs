import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let deleting = false, active = true, saved, removed, locked;
const tx = {
  async $queryRaw(strings, ...values) { assert.deepEqual(values, ["parent-1", "tenant-1"]); locked = true; return [{ id: "parent-1" }]; },
  user: { async findFirst() { return active ? { customFields: { messageBlocks: { staff: true }, unrelated: "preserved" } } : null; }, async update({ data }) { assert.equal(locked, true); saved = data.customFields; } },
  dataDeletionRequest: { async findFirst({ where }) { assert.equal(where.userId, "parent-1"); assert.ok(where.status.in.includes("executing")); return deleting ? { id: "request-1" } : null; } },
};
mock.module("@/lib/prisma", { namedExports: { prisma: { user: { async findUnique() { return { customFields: {} }; } }, async $transaction(callback) { return callback(tx); } } } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return { id: "parent-1", tenantId: "tenant-1", identityTenantId: "tenant-1", email: "parent@example.test" }; } } });
mock.module("@/lib/audit", { namedExports: { async writeAuditLog() {} } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
mock.module("@/lib/supabase-storage", { namedExports: {
  isSupabaseStorageConfigured() { return true; },
  async uploadProfilePhotoBuffer() { return { bucket: "child-media", storageKey: "owned/photo.png", recordUrl: "supabase://child-media/owned/photo.png", signedUrl: "https://fixture.invalid/photo.png" }; },
  getSupabaseStorageClient() { return { storage: { from(bucket) { assert.equal(bucket, "child-media"); return { async remove(paths) { removed = paths; return { error: null }; } }; } } }; },
} });
const { POST } = await import("../../src/app/api/profile/photo/route.ts");
async function upload() {
  saved = null; removed = []; locked = false;
  const body = new FormData(); body.set("photo", new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));
  return POST(new NextRequest("https://fixture.invalid/api/profile/photo", { method: "POST", body }));
}
test("normal photo save preserves current recipient block settings", async () => {
  deleting = false; active = true; assert.equal((await upload()).status, 200); assert.deepEqual(saved.messageBlocks, { staff: true }); assert.equal(saved.unrelated, "preserved"); assert.deepEqual(removed, []);
});
test("executing deletion or an inactive identity rejects and cleans a late photo upload", async () => {
  for (const state of [{ deleting: true, active: true }, { deleting: false, active: false }]) {
    deleting = state.deleting; active = state.active; assert.equal((await upload()).status, 409); assert.equal(saved, null); assert.deepEqual(removed, ["owned/photo.png"]);
  }
});
