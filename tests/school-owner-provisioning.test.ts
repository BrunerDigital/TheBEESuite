import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("owner provisioning API keeps identity and school boundaries closed", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", "tests/helpers/school-owner-route-module-mocks.mjs"], { cwd: process.cwd(), env, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
