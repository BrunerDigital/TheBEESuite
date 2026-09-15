import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
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
    await writeFile(join(root, archivePath), bytes);
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1, createdAt: "2026-09-15T00:00:00.000Z", sourceProjectRef: "abcdefghijklmnopqrst",
      buckets: [{ id: "fixture", public: false, fileSizeLimit: null, allowedMimeTypes: null,
        objects: [{ path: "item.txt", archivePath, size: bytes.length, sha256, contentType: "text/plain" }],
      }], totals: { buckets: 1, objects: 1, bytes: bytes.length },
    }));
    const callsPath = join(root, "calls.jsonl");
    const hookPath = join(root, "mock.mjs");
    await writeFile(hookPath, `
import { appendFileSync } from "node:fs";
const calls = ${JSON.stringify(callsPath)};
const bytes = Buffer.from(${JSON.stringify(bytes.toString("base64"))}, "base64");
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  const method = init?.method ?? "GET";
  appendFileSync(calls, JSON.stringify({ method, path: url.pathname }) + "\\n");
  if (url.origin !== "https://tsrqponmlkjihgfedcba.supabase.co") throw new Error("Unexpected network target");
  const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  if (url.pathname === "/storage/v1/bucket" && method === "GET") return json([]);
  if (url.pathname === "/storage/v1/bucket" && method === "POST") return json({ name: "fixture" });
  if (url.pathname === "/storage/v1/object/fixture/item.txt" && method === "POST") return json({ Key: "fixture/item.txt" });
  if (url.pathname === "/storage/v1/object/fixture/item.txt" && method === "GET") return new Response(bytes);
  throw new Error("Unexpected simulated Storage request: " + method + " " + url.pathname);
};
`);
    const base = ["--import", pathToFileURL(hookPath).href, "--import", "tsx", "scripts/supabase-storage-recovery.ts", "restore", "--input", root, "--target-project", "tsrqponmlkjihgfedcba"];
    const run = async (extra: string[] = []) => {
      await writeFile(callsPath, "");
      const result = spawnSync(process.execPath, [...base, ...extra], {
        cwd: resolve("."), encoding: "utf8", timeout: 20_000,
        env: { ...process.env, SUPABASE_RESTORE_URL: "https://tsrqponmlkjihgfedcba.supabase.co", SUPABASE_RESTORE_ADMIN_KEY: "synthetic-key-no-provider-access" },
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
    const applied = await run(["--apply", "--expected-plan", plan.fingerprint]);
    assert.equal(applied.result.status, 0, applied.result.stderr);
    assert.equal(JSON.parse(applied.result.stdout).command, "restore");
    assert.deepEqual(applied.calls.map((call) => call.method), ["GET", "POST", "POST", "GET"]);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "bee-restore-cli-")));
    await rm(root, { recursive: true, force: true });
  }
});
