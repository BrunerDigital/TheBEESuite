import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("parent tuition cycle changes honor the linked school's policy", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const fixture = fileURLToPath(new URL("./helpers/parent-tuition-cadence-route-mocks.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks", "--import", "tsx", "--test", fixture,
  ], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
