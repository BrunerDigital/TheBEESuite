import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("parent checkout resume actual handler is read-only and fail-closed", () => {
  const result = spawnSync(process.execPath, ["--test", "tests/helpers/parent-checkout-resume-route.mjs"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
