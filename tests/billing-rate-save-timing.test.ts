import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("combined rate saves are atomic and preserve timing validation", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", fileURLToPath(new URL("./billing-rate-save-timing.test.mjs", import.meta.url))], {
    cwd: process.cwd(), encoding: "utf8", env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
