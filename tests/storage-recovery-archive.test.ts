import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archivePathForSha256,
  sha256Hex,
  validateStorageBackupManifest,
  validateStorageObjectPath,
} from "../src/lib/storage-recovery-archive";

const bytes = Buffer.from("The BEE Suite isolated restore fixture\n", "utf8");
const sha256 = sha256Hex(bytes);

function validManifest() {
  return {
    schemaVersion: 1,
    createdAt: "2026-07-20T20:00:00.000Z",
    sourceProjectRef: "abcdefghijklmnopqrst",
    buckets: [
      {
        id: "restore-drill",
        public: false,
        fileSizeLimit: 8_000_000,
        allowedMimeTypes: ["image/*"],
        objects: [
          {
            path: "synthetic/fixture.png",
            archivePath: archivePathForSha256(sha256),
            size: bytes.length,
            sha256,
            contentType: "image/png",
          },
        ],
      },
    ],
    totals: { buckets: 1, objects: 1, bytes: bytes.length },
  };
}

test("hash-addressed archive paths are deterministic", () => {
  assert.equal(sha256, "dc931c5acac34ffbec8521c0790d600ba8f50e723831e40e4319d38d48322506");
  assert.equal(archivePathForSha256(sha256), `objects/dc/${sha256}.blob`);
});

test("manifest validation accepts a private, internally consistent archive", () => {
  assert.deepEqual(validateStorageBackupManifest(validManifest()), validManifest());
});

test("manifest validation rejects path traversal and public buckets", () => {
  assert.throws(() => validateStorageObjectPath("../fixture.png"), /Unsafe Storage object path/);
  const manifest = validManifest();
  manifest.buckets[0].public = true;
  assert.throws(() => validateStorageBackupManifest(manifest), /private buckets only/);
});

test("manifest validation rejects mismatched totals and archive hashes", () => {
  const totals = validManifest();
  totals.totals.objects = 2;
  assert.throws(() => validateStorageBackupManifest(totals), /totals do not match/);

  const path = validManifest();
  path.buckets[0].objects[0].archivePath = `objects/00/${"0".repeat(64)}.blob`;
  assert.throws(() => validateStorageBackupManifest(path), /does not match SHA-256/);
});
