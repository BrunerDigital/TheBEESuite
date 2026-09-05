import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(
  new URL("./helpers/agency-access-continuity-route-module-mocks.mjs", import.meta.url),
);

test("agency API preserves the billing-role access boundary", () => {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
  };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      "--test",
      routeTestHelper,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnv,
    },
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /all six billing roles reach baseline direct record and same-user reverse actions/i);
  assert.match(result.stdout, /teacher, parent, and pickup roles remain denied/i);
  assert.match(result.stdout, /read-only auditor remains denied for every mutation/i);
  assert.match(result.stdout, /same-user direct correction remains available only before exact-school activation/i);
  assert.match(result.stdout, /baseline direct retry rejects a historical active reference after canonical normalization/i);
  assert.match(result.stdout, /all-location workspace keeps exact-school reads separate and rejects crafted mutations/i);
});
