import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("offline payment handlers commit or roll back financial records and audit together", () => {
  const result = spawnSync(process.execPath, ["tests/helpers/offline-payment-atomicity.mjs"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout) as { results: Array<{ name: string; status: string }> };
  assert.equal(report.results.length, 29);
  assert.ok(report.results.every((scenario) => scenario.status === "passed"));
});
