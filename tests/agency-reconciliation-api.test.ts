import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(
  new URL("./helpers/agency-reconciliation-route-module-mocks.mjs", import.meta.url),
);

test("agency API rejects unsupported future accounting dates before any write", () => {
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
  assert.match(result.stdout, /direct remittance rejects a future paid date/i);
  assert.match(result.stdout, /reviewed deposit batch rejects a future paid date/i);
  assert.match(result.stdout, /adjustment request rejects a future effective date/i);
});
