import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = resolve("scripts/sync-local-env.mjs");
function assertPrivateMode(path: string) {
  // Windows reports ACL-backed files through a different mode surface; the
  // POSIX 0600 assertion remains the meaningful portable check.
  if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
}

function sync(local: string, pulled: string) {
  const root = mkdtempSync(join(tmpdir(), "bee-env-sync-"));
  writeFileSync(join(root, ".env.local"), local);
  writeFileSync(join(root, ".env.production.pulled.local"), pulled);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  return { root, result, output: readFileSync(join(root, ".env.local"), "utf8") };
}

test("redacted exports cannot replace usable local credentials", () => {
  const fixture = sync('AUTH_SECRET="local-secret"\nCUSTOM="keep"\n', 'AUTH_SECRET="[REDACTED]"\nAPP_URL="https://example.test"\n');
  try {
    assert.equal(fixture.result.status, 0);
    assert.match(fixture.output, /AUTH_SECRET="local-secret"/);
    assert.match(fixture.output, /CUSTOM="keep"/);
    assert.doesNotMatch(fixture.output, /REDACTED/);
    assertPrivateMode(join(fixture.root, ".env.local"));
    const backup = readdirSync(fixture.root).find((file) => file.includes(".backup-"))!;
    assertPrivateMode(join(fixture.root, backup));
  } finally { rmSync(fixture.root, { recursive: true }); }
});

test("unavailable credentials fail before modifying the local environment", () => {
  const original = 'CUSTOM="keep"\n';
  const fixture = sync(original, 'AUTH_SECRET="<redacted>"\n');
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.equal(fixture.output, original);
    assert.match(fixture.result.stderr, /AUTH_SECRET/);
    assert.equal(readdirSync(fixture.root).some((file) => file.includes(".backup-")), false);
  } finally { rmSync(fixture.root, { recursive: true }); }
});

test("usable rotations replace old values while blank exports preserve them", () => {
  const fixture = sync('AUTH_SECRET="old"\nCRON_SECRET="keep"\n', 'AUTH_SECRET="new"\nCRON_SECRET=""\n');
  try {
    assert.equal(fixture.result.status, 0);
    assert.match(fixture.output, /AUTH_SECRET="new"/);
    assert.match(fixture.output, /CRON_SECRET="keep"/);
  } finally { rmSync(fixture.root, { recursive: true }); }
});
