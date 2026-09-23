import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("password recovery diagnostics preserve provider failures and existing route behavior", () => {
  const env = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/password-reset-diagnostics-mocks.mjs", import.meta.url))],
  { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
