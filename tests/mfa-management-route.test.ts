import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("account MFA route enforces identity, origin and session invalidation boundaries", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/mfa-management-route-module-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
