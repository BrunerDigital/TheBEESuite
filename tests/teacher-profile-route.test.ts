import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("teacher profile updates preserve current authority and commit profile with audit atomically", () => {
  // The isolated fake route exercises production hashing without depending on
  // (or using) any real deployment credential.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NODE_NO_WARNINGS: "1", PIN_HASH_SECRET: "fake-teacher-profile-unit-test-key-not-for-deployment" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/teacher-profile-route-module-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /audit failure rolls back name profile and PIN together/);
});
