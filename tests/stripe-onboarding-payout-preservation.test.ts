import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("opening existing-account onboarding preserves payout schedules, delays and holds", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, [
    "--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/stripe-onboarding-payout-preservation-mocks.mjs", import.meta.url)),
  ], { encoding: "utf8", env });
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
