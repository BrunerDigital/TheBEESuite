import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deleteAccountProfilePhotos } from "../src/lib/account-deletion-profile-photos";
import { PROFILE_PHOTO_BUCKET } from "../src/lib/supabase-storage";

function fixture(count = 105) {
  const prefix = "profile-photos/tenant-1/parent-1";
  const objects = Array.from({ length: count }, (_, index) => ({ id: `object-${index}`, name: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}.png` }));
  const removed: string[][] = [];
  let removeFails = false;
  const client = { storage: { from(bucket: string) {
    assert.equal(bucket, PROFILE_PHOTO_BUCKET);
    return {
      async list(folder: string, options: { limit: number; offset: number }) {
        assert.ok(folder === prefix || folder.startsWith(`${prefix}/`));
        const entries = folder === prefix ? [{ id: null, name: "2026" }] : folder === `${prefix}/2026` ? [{ id: null, name: "09" }] : objects;
        return { data: entries.slice(options.offset, options.offset + options.limit), error: null };
      },
      async remove(paths: string[]) { removed.push(paths); return { error: removeFails ? { message: "Fake failure" } : null }; },
    };
  } } } as unknown as SupabaseClient;
  return { client, removed, prefix, failRemoval() { removeFails = true; } };
}

test("account cleanup removes every page of replaced avatars inside only the account prefix", async () => {
  const f = fixture();
  assert.equal(await deleteAccountProfilePhotos({ tenantId: "tenant-1", userId: "parent-1", customFields: {} }, f.client), 105);
  assert.deepEqual(f.removed.map(batch => batch.length), [100, 5]);
  assert.equal(new Set(f.removed.flat()).size, 105);
  assert.ok(f.removed.flat().every(path => path.startsWith(`${f.prefix}/2026/09/`)));
  const empty = fixture(0);
  assert.equal(await deleteAccountProfilePhotos({ tenantId: "tenant-1", userId: "parent-1", customFields: {} }, empty.client), 0);
  assert.deepEqual(empty.removed, []);
});

test("foreign paths and failed storage cleanup cannot confirm account deletion", async () => {
  const f = fixture(1);
  for (const fields of [{ profilePhotoStorageKey: "school-media/photo.png" }, { profilePhotoStorageKey: `${f.prefix}/2026/09/photo.png`, profilePhotoBucket: "foreign-bucket" }]) {
    await assert.rejects(deleteAccountProfilePhotos({ tenantId: "tenant-1", userId: "parent-1", customFields: fields }, f.client));
  }
  await assert.rejects(deleteAccountProfilePhotos({ tenantId: "../tenant-1", userId: "parent-1", customFields: {} }, f.client));
  assert.deepEqual(f.removed, []);
  f.failRemoval();
  await assert.rejects(deleteAccountProfilePhotos({ tenantId: "tenant-1", userId: "parent-1", customFields: {} }, f.client), /incomplete/);
});

test("a late profile upload cannot overwrite deletion or concurrent block preferences", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/profile-photo-deletion-race-mocks.mjs", import.meta.url))], { encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
