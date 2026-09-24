import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { archivePathForSha256, sha256Hex } from "../src/lib/storage-recovery-archive";

test("restore CLI previews without writes, rejects changed plans, and verifies an approved apply", async () => {
  const root = await mkdtemp(join(tmpdir(), "bee-restore-cli-"));
  try {
    const bytes = Buffer.from("Synthetic archive, no production data.");
    const sha256 = sha256Hex(bytes);
    const archivePath = archivePathForSha256(sha256);
    await mkdir(dirname(join(root, archivePath)), { recursive: true });
    const objectFile = join(root, archivePath);
    await writeFile(objectFile, bytes);
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1, createdAt: "2026-09-15T00:00:00.000Z", sourceProjectRef: "abcdefghijklmnopqrst",
      buckets: [{ id: "fixture", public: false, fileSizeLimit: null, allowedMimeTypes: null,
        objects: [{ path: "item.txt", archivePath, size: bytes.length, sha256, contentType: "text/plain" }],
      }], totals: { buckets: 1, objects: 1, bytes: bytes.length },
    }));
    const callsPath = join(root, "calls.jsonl");
    const hookPath = join(root, "mock.mjs");
    await writeFile(hookPath, `
import { appendFileSync, writeFileSync } from "node:fs";
const calls = ${JSON.stringify(callsPath)};
const objectFile = ${JSON.stringify(objectFile)};
const bytes = Buffer.from(${JSON.stringify(bytes.toString("base64"))}, "base64");
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  const method = init?.method ?? "GET";
  appendFileSync(calls, JSON.stringify({ method, path: url.pathname }) + "\\n");
  if (url.origin !== "https://tsrqponmlkjihgfedcba.supabase.co") throw new Error("Unexpected network target");
  const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  if (url.pathname === "/storage/v1/bucket" && method === "GET") {
    if (process.env.TAMPER_AFTER_CHECK === "1") writeFileSync(objectFile, "tampered after archive check");
    return json([]);
  }
  if (url.pathname === "/storage/v1/bucket" && method === "POST") return json({ name: "fixture" });
  if (url.pathname === "/storage/v1/object/fixture/item.txt" && method === "POST") return json({ Key: "fixture/item.txt" });
  if (url.pathname === "/storage/v1/object/fixture/item.txt" && method === "GET") return new Response(bytes);
  throw new Error("Unexpected simulated Storage request: " + method + " " + url.pathname);
};
`);
    const base = ["--import", pathToFileURL(hookPath).href, "--import", "tsx", "scripts/supabase-storage-recovery.ts", "restore", "--input", root, "--target-project", "tsrqponmlkjihgfedcba"];
    const run = async (extra: string[] = [], tamper = false) => {
      await writeFile(callsPath, "");
      const result = spawnSync(process.execPath, [...base, ...extra], {
        cwd: resolve("."), encoding: "utf8", timeout: 20_000,
        env: { ...process.env, SUPABASE_RESTORE_URL: "https://tsrqponmlkjihgfedcba.supabase.co", SUPABASE_RESTORE_ADMIN_KEY: "synthetic-key-no-provider-access", TAMPER_AFTER_CHECK: tamper ? "1" : "0" },
      });
      const calls = (await readFile(callsPath, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { method: string; path: string });
      return { result, calls };
    };
    const preview = await run();
    assert.equal(preview.result.status, 0, preview.result.stderr);
    const plan = JSON.parse(preview.result.stdout);
    assert.equal(plan.command, "restore-preview");
    assert.deepEqual(preview.calls, [{ method: "GET", path: "/storage/v1/bucket" }]);
    const rejected = await run(["--apply", "--expected-plan", "0".repeat(64)]);
    assert.equal(rejected.result.status, 1);
    assert.match(rejected.result.stderr, /plan changed or is unapproved/);
    assert.deepEqual(rejected.calls, preview.calls);
    const tampered = await run(["--apply", "--expected-plan", plan.fingerprint], true);
    assert.equal(tampered.result.status, 1);
    assert.match(tampered.result.stderr, /Integrity verification failed/);
    assert.deepEqual(tampered.calls, preview.calls);
    await writeFile(objectFile, bytes);
    const applied = await run(["--apply", "--expected-plan", plan.fingerprint]);
    assert.equal(applied.result.status, 0, applied.result.stderr);
    assert.equal(JSON.parse(applied.result.stdout).command, "restore");
    assert.deepEqual(applied.calls.map((call) => call.method), ["GET", "POST", "POST", "GET"]);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "bee-restore-cli-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("archive verification rejects conflicting duplicate hashes and linked files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bee-verify-cli-"));
  try {
    const bytes = Buffer.from("Synthetic backup bytes.");
    const sha256 = sha256Hex(bytes);
    const archivePath = archivePathForSha256(sha256);
    const objectFile = join(root, archivePath);
    await mkdir(dirname(objectFile), { recursive: true });
    await writeFile(objectFile, bytes);
    const manifest = {
      schemaVersion: 1, createdAt: "2026-09-24T00:00:00.000Z", sourceProjectRef: "abcdefghijklmnopqrst",
      buckets: [{ id: "fixture", public: false, fileSizeLimit: null, allowedMimeTypes: null, objects: [
        { path: "first.txt", archivePath, size: bytes.length, sha256, contentType: "text/plain" },
        { path: "second.txt", archivePath, size: bytes.length + 1, sha256, contentType: "text/plain" },
      ] }], totals: { buckets: 1, objects: 2, bytes: bytes.length * 2 + 1 },
    };
    const manifestFile = join(root, "manifest.json");
    await writeFile(manifestFile, JSON.stringify(manifest));
    const verify = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/supabase-storage-recovery.ts", "verify", "--input", root], {
      cwd: resolve("."), encoding: "utf8", timeout: 20_000,
    });
    const conflicting = verify();
    assert.equal(conflicting.status, 1);
    assert.match(conflicting.stderr, /Integrity verification failed/);

    manifest.buckets[0].objects.pop();
    manifest.totals.objects = 1;
    manifest.totals.bytes = bytes.length;
    await writeFile(manifestFile, JSON.stringify(manifest));
    const linkedTarget = join(root, "outside.blob");
    await writeFile(linkedTarget, bytes);
    await rm(objectFile);
    try {
      await symlink(linkedTarget, objectFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.diagnostic("File symlinks are unavailable on this Windows host.");
        return;
      }
      throw error;
    }
    const linked = verify();
    assert.equal(linked.status, 1);
    assert.match(linked.stderr, /unsafe file or link/);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "bee-verify-cli-")));
    await rm(root, { recursive: true, force: true });
  }
});
