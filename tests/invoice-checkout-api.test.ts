import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("actual invoice Checkout routes enforce authorization before details and provider mutations", () => {
  // Exercise the production signing requirement with an isolated, ephemeral
  // fixture key; never depend on a developer or deployment's real credential.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NODE_NO_WARNINGS: "1",
    PAYMENT_METHOD_REQUEST_TOKEN_SECRET: randomBytes(32).toString("hex") }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test",
    fileURLToPath(new URL("./helpers/invoice-checkout-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /foreign invoice stops before full detail/);
  assert.match(result.stdout, /reserved identities stop before shared Checkout/);
  assert.match(result.stdout, /both routes preserve canonical customer and distinct return destinations/);
});
