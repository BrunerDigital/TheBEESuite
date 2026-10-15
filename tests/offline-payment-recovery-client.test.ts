import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("offline payment recovery preserves identity and requires explicit receipt review", () => {
  const result = spawnSync(process.execPath, ["tests/helpers/offline-payment-recovery-client.mjs"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout) as { results: Array<{ status: string }> };
  assert.equal(report.results.length, 12);
  assert.ok(report.results.every((scenario) => scenario.status === "passed"));
});
