import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(new URL("./helpers/agency-scope-readiness-route-module-mocks.mjs", import.meta.url));

test("agency exact-school scope and controlled-readiness checks fail closed", () => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", routeTestHelper], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /createClaim requires every authorization relationship/i);
  assert.match(result.stdout, /commits its audit through the transaction client/i);
  assert.match(result.stdout, /all-locations and stale authorized-school mutation contexts fail closed/i);
  assert.match(result.stdout, /requires complete accounting mappings/i);
  assert.match(result.stdout, /self-requested pending late allocation cannot reverse/i);
});
