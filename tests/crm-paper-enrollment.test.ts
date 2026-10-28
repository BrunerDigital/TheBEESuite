import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("paper enrollment works through the CRM API while preserving authorization and audit", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/crm-paper-enrollment-mocks.mjs", import.meta.url))], {
    cwd: process.cwd(), encoding: "utf8", env,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tests 2/);
});
