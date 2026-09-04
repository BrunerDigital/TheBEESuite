import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(new URL("./helpers/agency-legacy-reversal-route-module-mocks.mjs", import.meta.url));

test("legacy family-ledger reversals preserve correction access and roll back unsafe evidence", () => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", routeTestHelper], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /pre-PR family mirror remains reversible after an agency rename/i);
  assert.match(result.stdout, /conflicting legacy provenance rolls the whole reversal back/i);
  assert.match(result.stdout, /negative agency-only history rolls the whole reversal back/i);
  assert.match(result.stdout, /same-day morning source reversal stays exact while accounting posts no earlier/i);
  assert.match(result.stdout, /same-day clamped posting honors a closed period and rolls back atomically/i);
});
