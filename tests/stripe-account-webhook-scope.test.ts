import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("account webhooks preserve tenant isolation and concurrent payout settings", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, [
    "--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/stripe-account-webhook-scope-mocks.mjs", import.meta.url)),
  ], { encoding: "utf8", env });
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
