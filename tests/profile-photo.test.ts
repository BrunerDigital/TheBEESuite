import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PROFILE_PHOTO_URL,
  MANAGEMENT_PROFILE_PHOTO_ROLES,
  contentTypeForProfilePhotoFile,
  mergeProfilePhotoCustomFields,
  readProfilePhotoFields,
  readProfilePhotoStorageKey,
  usesManagementProfilePhoto,
  validateProfilePhotoFile,
} from "../src/lib/profile-photo";

test("profile photo content type falls back from filename extension", () => {
  assert.equal(contentTypeForProfilePhotoFile({ name: "avatar.png" }), "image/png");
  assert.equal(contentTypeForProfilePhotoFile({ name: "avatar.webp" }), "image/webp");
  assert.equal(contentTypeForProfilePhotoFile({ name: "avatar.jpeg" }), "image/jpeg");
});

test("profile photo validation allows only small common image formats", () => {
  assert.deepEqual(validateProfilePhotoFile({ size: 1024, contentType: "image/png" }), { ok: true });
  assert.equal(validateProfilePhotoFile({ size: 1024, contentType: "image/gif" }).ok, false);
  assert.equal(validateProfilePhotoFile({ size: 6 * 1024 * 1024, contentType: "image/png" }).ok, false);
});

test("profile photo fields preserve existing custom metadata", () => {
  const merged = mergeProfilePhotoCustomFields(
    { favoriteColor: "yellow" },
    {
      url: "supabase://child-media/profile-photos/user/photo.png",
      bucket: "child-media",
      storageKey: "profile-photos/user/photo.png",
      contentType: "image/png",
      uploadedAt: "2026-06-19T00:00:00.000Z",
    },
  );

  assert.equal((merged as Record<string, unknown>).favoriteColor, "yellow");
  assert.equal(readProfilePhotoStorageKey(merged), "profile-photos/user/photo.png");
  assert.equal(readProfilePhotoFields(merged).bucket, "child-media");
});

test("default profile photo uses the supplied Mr. Bee artwork", () => {
  assert.equal(DEFAULT_PROFILE_PHOTO_URL, "/brand/the-bee-suite/mr-bee-profile.png");
});

test("management profile photo roles cover admins, executives, and directors", () => {
  assert.deepEqual(MANAGEMENT_PROFILE_PHOTO_ROLES, [
    "PLATFORM_OWNER",
    "BRAND_ADMIN",
    "REGIONAL_MANAGER",
    "CENTER_DIRECTOR",
    "ASSISTANT_DIRECTOR",
    "BILLING_ADMIN",
  ]);
  assert.equal(usesManagementProfilePhoto("CENTER_DIRECTOR"), true);
  assert.equal(usesManagementProfilePhoto("TEACHER"), false);
});
