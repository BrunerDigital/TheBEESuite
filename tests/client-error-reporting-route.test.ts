import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("actual client error route suppresses credential reports and preserves safe diagnostics", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/client-error-reporting-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /safe report retains attribution and deduplication/);
});
