import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("device session API preserves scope, audit atomicity and retry receipts", () => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/device-session-route-module-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env: childEnv });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /audit failure rolls back the staged revocation/);
  assert.match(result.stdout, /confirmed success and safe retry retain exactly one audit/);
});
