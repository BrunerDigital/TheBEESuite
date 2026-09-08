import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(
  new URL("./helpers/agency-idempotent-replay-route-module-mocks.mjs", import.meta.url),
);

test("agency financial request keys are tenant-safe and race-safe", () => {
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
  assert.match(result.stdout, /same-key concurrent P2002 requests converge/i);
  assert.match(result.stdout, /P2034 retries recover only the matching owned record/i);
  assert.match(result.stdout, /cross-user and cross-school idempotency records/i);
  assert.match(result.stdout, /replay remains recoverable after activation or setup state drifts/i);
});
