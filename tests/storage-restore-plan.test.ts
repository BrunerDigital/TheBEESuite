import assert from "node:assert/strict";
import { test } from "node:test";
import { archivePathForSha256, sha256Hex, type StorageBackupManifest } from "../src/lib/storage-recovery-archive";
import { assertRestorePlanApproved, createStorageRestorePlan, storageProjectRef, validateRestoreTarget } from "../src/lib/storage-restore-plan";

const source = "abcdefghijklmnopqrst";
const target = "tsrqponmlkjihgfedcba";
const bytes = Buffer.from("synthetic restore fixture");
const sha256 = sha256Hex(bytes);
const manifest: StorageBackupManifest = {
  schemaVersion: 1, createdAt: "2026-09-15T00:00:00.000Z", sourceProjectRef: source,
  buckets: ["first", "last"].map((id) => ({
    id, public: false, fileSizeLimit: null, allowedMimeTypes: null,
    objects: [{ path: "fixture.txt", archivePath: archivePathForSha256(sha256), sha256, size: bytes.length, contentType: "text/plain" }],
  })),
  totals: { buckets: 2, objects: 2, bytes: bytes.length * 2 },
};

test("restore accepts only the explicitly selected isolated HTTPS project", () => {
  assert.equal(validateRestoreTarget(`https://${target}.supabase.co`, target, source), target);
  assert.throws(() => validateRestoreTarget(`https://${source}.supabase.co`, source, source), /isolated/);
  assert.throws(() => validateRestoreTarget("https://nqjrlktoewiueiwrubas.supabase.co", "nqjrlktoewiueiwrubas", source), /isolated/);
  assert.throws(() => validateRestoreTarget(`https://${target}.supabase.co`, source, source), /does not match/);
  for (const url of [
    `http://${target}.supabase.co`, `https://${target}.example.com`,
    `https://${target}.supabase.co.evil.test`, `https://secret@${target}.supabase.co`,
    `https://${target}.supabase.co/path`, `https://${target}.supabase.co?token=secret`,
  ]) assert.throws(() => storageProjectRef(url), /HTTPS Supabase project origin/);
});

test("plan checks later buckets for collisions and public access before application", () => {
  assert.throws(() => createStorageRestorePlan(manifest, target, [{ id: "last", public: false, objectPaths: ["fixture.txt"] }], true), /Target object already exists/);
  assert.throws(() => createStorageRestorePlan(manifest, target, [{ id: "last", public: true, objectPaths: [] }], true), /public target/);
  assert.throws(() => createStorageRestorePlan(manifest, target, [{ id: "last", public: false, objectPaths: [] }], false), /bucket already exists/);
});

test("plan fingerprint binds archive, target, existing state and explicit bucket reuse", () => {
  const original = createStorageRestorePlan(manifest, target, [], false);
  assert.equal(original.createBuckets, 2);
  assert.equal(original.objects, 2);
  assert.throws(() => assertRestorePlanApproved(original.fingerprint), /unapproved/);
  assert.doesNotThrow(() => assertRestorePlanApproved(original.fingerprint, original.fingerprint));
  const changed = structuredClone(manifest);
  changed.buckets[0].objects[0].contentType = "application/octet-stream";
  for (const plan of [
    createStorageRestorePlan(changed, target, [], false),
    createStorageRestorePlan(manifest, "bbbbbbbbbbbbbbbbbbbb", [], false),
    createStorageRestorePlan(manifest, target, [], true),
    createStorageRestorePlan(manifest, target, [{ id: "last", public: false, objectPaths: [] }], true),
  ]) assert.throws(() => assertRestorePlanApproved(plan.fingerprint, original.fingerprint), /changed/);
});

test("API listing order does not change the reviewed plan", () => {
  const a = createStorageRestorePlan(manifest, target, [
    { id: "last", public: false, objectPaths: ["z.txt", "a.txt"] },
    { id: "first", public: false, objectPaths: [] },
  ], true);
  const b = createStorageRestorePlan(manifest, target, [
    { id: "first", public: false, objectPaths: [] },
    { id: "last", public: false, objectPaths: ["a.txt", "z.txt"] },
  ], true);
  assert.equal(a.fingerprint, b.fingerprint);
});
