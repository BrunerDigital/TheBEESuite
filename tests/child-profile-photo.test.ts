import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchesProfilePhotoSignature, mergeProfilePhotoCustomFields, removeProfilePhotoCustomFields, validateProfilePhotoFile } from "@/lib/profile-photo";

test("student profile photos use validated private storage metadata and support removal", () => {
  assert.deepEqual(validateProfilePhotoFile({ size: 500_000, contentType: "image/jpeg" }), { ok: true });
  assert.equal(validateProfilePhotoFile({ size: 500_000, contentType: "image/svg+xml" }).ok, false);
  assert.equal(matchesProfilePhotoSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(matchesProfilePhotoSignature(new TextEncoder().encode("not an image"), "image/jpeg"), false);
  const merged = mergeProfilePhotoCustomFields({ retained: true }, { url: "supabase://child-media/private/key", bucket: "child-media", storageKey: "private/key", contentType: "image/jpeg", uploadedAt: "2026-08-25T00:00:00.000Z" });
  assert.equal((merged as Record<string, unknown>).retained, true);
  const removed = removeProfilePhotoCustomFields(merged);
  assert.equal((removed as Record<string, unknown>).retained, true);
  assert.equal("profilePhoto" in removed, false);
});

test("student profile photo route is school scoped, audited, signed, replaceable, and removable", () => {
  const route = readFileSync("src/app/api/children/[id]/profile-photo/route.ts", "utf8");
  assert.match(route, /canManageOperations/);
  assert.match(route, /centerScopedAccessGuard/);
  assert.match(route, /uploadChildMediaBuffer/);
  assert.match(route, /child\.profile_photo\.replaced/);
  assert.match(route, /child\.profile_photo\.removed/);
  assert.match(route, /deleteChildMediaObject/);
  assert.match(route, /currentAuthorizedChild\(tx/);
  assert.match(route, /mergeProfilePhotoCustomFields\(current\.child\.customFields/);
  assert.match(route, /removeProfilePhotoCustomFields\(current\.child\.customFields/);
  assert.match(route, /tx\.auditLog\.create/);
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /createChildMediaSignedUrl/);
  assert.match(page, /profilePhotoUrl: parentChildProfilePhotoUrls/);
  assert.match(page, /profilePhotoUrl: teacherChildProfilePhotoUrls/);
  const teacher = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  assert.match(teacher, /src=\{child\.profilePhotoUrl\}/);
});
