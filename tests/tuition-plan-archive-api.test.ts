import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("actual tuition archive route protects tenant, role, school, origin and audit boundaries", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/tuition-plan-archive-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /foreign tenant fails closed/);
  assert.match(result.stdout, /atomic, audited and idempotent/);
});
