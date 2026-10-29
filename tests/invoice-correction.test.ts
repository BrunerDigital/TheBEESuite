import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("invoice corrections settle verified net payments and preserve authorization, audit and retry boundaries", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/invoice-correction-mocks.mjs", import.meta.url))], {
    cwd: process.cwd(), encoding: "utf8", env,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /220 paid minus 170 refund then revised 50/);
  assert.match(result.stdout, /tests 14/);
});
