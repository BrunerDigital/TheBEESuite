import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("cash client validation, retries, and rapid submissions preserve payment identity", () => {
  const result = spawnSync(process.execPath, ["tests/helpers/cash-posting-client-repro.mjs"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout) as { results: Array<{ status: string }> };
  assert.equal(report.results.length, 34);
  assert.ok(report.results.every((scenario) => scenario.status === "passed"));
});
