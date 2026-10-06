import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { makeStagedSourceManifest, signStagedSourceManifest } from "../src/lib/procare-staged-source";

const scope = { userId: "reviewer", tenantId: "tenant", centerId: "school" };
const secret = "synthetic-test-secret";

async function loadServer(stub: string, entry: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "bee-intake-test-"));
  const filename = path.join(directory, "server.cjs");
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "isolated-dependencies", setup(builder) {
      builder.onResolve({ filter: /^(@\/lib\/(supabase-storage|prisma)|@prisma\/client)$/ }, args => ({ path: args.path, namespace: "isolated-dependencies" }));
      builder.onLoad({ filter: /.*/, namespace: "isolated-dependencies" }, () => ({ contents: stub, loader: "js" }));
    } }],
  });
  await writeFile(filename, result.outputFiles[0].contents);
  return { module: createRequire(import.meta.url)(filename), close: () => rm(directory, { recursive: true, force: true }) };
}

test("staged reports reject missing, changed, or wrong-school bytes before import", async () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secret;
  const bytes = Buffer.from("Account ID,Family Name\n1,Synthetic Family\n");
  const manifest = makeStagedSourceManifest(scope, [{ name: "families.csv", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }]);
  const receipt = signStagedSourceManifest(manifest, secret);
  const control = { mode: "valid", downloads: 0 };
  const globals = globalThis as typeof globalThis & { __beeIntakeMock?: typeof control };
  globals.__beeIntakeMock = control;
  const server = await loadServer(`
    export const ASSET_HUB_BUCKET = "synthetic-private";
    const control = globalThis.__beeIntakeMock;
    export async function requireAssetHubBucket() { if (control.mode === "public") throw Error("private bucket required"); }
    export function getSupabaseStorageClient() { return { storage: { from() { return {
      async info() { return { data: { size: control.mode === "size" ? 1 : ${bytes.length} }, error: null }; },
      async download() { control.downloads++; return { data: control.mode === "missing" ? null : new Blob([control.mode === "hash" ? "x".repeat(${bytes.length}) : ${JSON.stringify(bytes.toString())}]), error: null }; }
    }; } } }; }
  `, "src/lib/procare-staged-source-server.ts");
  try {
    const valid = await server.module.readStagedSourceFiles(receipt, scope);
    assert.equal(await valid.files[0].text(), bytes.toString());
    assert.equal(valid.files[0].name, "families.csv");
    await assert.rejects(server.module.readStagedSourceFiles(receipt, { ...scope, centerId: "other-school" }), /different user or school/);
    await assert.rejects(server.module.readStagedSourceFiles(receipt + "tamper", scope), /could not be verified/);
    assert.equal(control.downloads, 1, "Invalid school/signature cannot access stored bytes");
    control.mode = "public";
    await assert.rejects(server.module.readStagedSourceFiles(receipt, scope), /private bucket required/);
    control.mode = "size";
    await assert.rejects(server.module.readStagedSourceFiles(receipt, scope), /incomplete or its size changed/);
    assert.equal(control.downloads, 1, "Size is checked before download");
    control.mode = "missing";
    await assert.rejects(server.module.readStagedSourceFiles(receipt, scope), /could not be retrieved/);
    control.mode = "hash";
    await assert.rejects(server.module.readStagedSourceFiles(receipt, scope), /changed after upload/);
  } finally {
    delete globals.__beeIntakeMock;
    await server.close();
    if (previous === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous;
  }
});

test("school import lease excludes concurrent commits and stale owners cannot release a newer lease", async () => {
  class DuplicateKey extends Error { code = "P2002"; }
  const buckets = new Map<string, { key: string; count: number; resetAt: Date }>();
  type LeaseRow = { key: string; count: number; resetAt: Date };
  const store = { rateLimitBucket: {
    async create({ data }: { data: LeaseRow }) {
      if (buckets.has(data.key)) throw new DuplicateKey();
      buckets.set(data.key, data);
    },
    async updateMany({ where, data }: { where: { key: string; resetAt: { lte: Date } }; data: { count: number; resetAt: Date } }) {
      const current = buckets.get(where.key);
      if (!current || current.resetAt > where.resetAt.lte) return { count: 0 };
      buckets.set(where.key, { ...current, ...data }); return { count: 1 };
    },
    async deleteMany({ where }: { where: { key: string; count: number } }) {
      if (buckets.get(where.key)?.count === where.count) buckets.delete(where.key);
    },
  } };
  const control = { error: DuplicateKey, store };
  const globals = globalThis as typeof globalThis & { __beeLeaseMock?: typeof control };
  globals.__beeLeaseMock = control;
  const server = await loadServer("export const Prisma = { PrismaClientKnownRequestError: globalThis.__beeLeaseMock.error }; export const prisma = globalThis.__beeLeaseMock.store;", "src/lib/procare-import-lease.ts");
  try {
    const acquire = server.module.acquireProcareImportLease;
    const [first, concurrent] = await Promise.all([acquire("school-a"), acquire("school-a")]);
    assert.equal(typeof first, "function"); assert.equal(concurrent, null);
    const other = await acquire("school-b"); assert.equal(typeof other, "function");
    buckets.get("school-a")!.resetAt = new Date(0);
    const recovered = await acquire("school-a"); assert.equal(typeof recovered, "function");
    await first();
    assert.equal(await acquire("school-a"), null, "Expired owner cannot delete the replacement lease");
    await recovered();
    const retry = await acquire("school-a"); assert.equal(typeof retry, "function");
    await retry(); await other(); assert.equal(buckets.size, 0);
  } finally { delete globals.__beeLeaseMock; await server.close(); }
});
