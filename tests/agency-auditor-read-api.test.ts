import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(new URL("./helpers/agency-auditor-read-route-module-mocks.mjs", import.meta.url));

test("agency auditor API remains read-only, tenant-scoped, and export-capable", () => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", routeTestHelper], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /auditor can read one authorized school and all authorized schools/i);
  assert.match(result.stdout, /auditor can download every authorized agency export/i);
  assert.match(result.stdout, /all-school exports retain immutable school IDs when school names are duplicated/i);
  assert.match(result.stdout, /wrong-school reads and exports fail before model access/i);
  assert.match(result.stdout, /auditor cannot invoke any agency mutation/i);
  assert.match(result.stdout, /cross-school relationship names are omitted/i);
});
