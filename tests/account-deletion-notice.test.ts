import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { accountDeletionCompletionDelivery } from "../src/lib/account-deletion-notice";

test("deletion completion queues a durable retryable notice to the original login address", () => {
  const input = { requestId: "request-1", tenantId: "tenant-1", centerId: "center-1", email: "parent@example.test", completedAt: new Date("2026-09-29T15:00:00Z") };
  const delivery = accountDeletionCompletionDelivery(input);
  assert.equal(delivery.status, "pending");
  assert.equal(delivery.attempts, 0);
  assert.equal(delivery.maxAttempts, 5);
  assert.deepEqual(delivery.nextAttemptAt, input.completedAt);
  assert.equal(delivery.tenantId, input.tenantId);
  assert.equal(delivery.centerId, input.centerId);
  assert.equal(delivery.purpose, "notification_email");
  assert.equal(delivery.dedupeKey, accountDeletionCompletionDelivery(input).dedupeKey);
  const payload = delivery.payload as { to: string[]; text: string };
  assert.deepEqual(payload.to, [input.email]);
  assert.match(payload.text, /2026-09-29/);
  assert.match(payload.text, /may retain/);
  assert.doesNotMatch(payload.text, /password|verification code|request-1/);
});

test("invalid or anonymized confirmation destinations fail before deletion execution", () => {
  for (const email of ["", "invalid", "deleted+abc@accounts.invalid", "parent\n@example.test"]) {
    assert.throws(() => accountDeletionCompletionDelivery({ requestId: "request-1", tenantId: "tenant-1", centerId: null, email, completedAt: new Date() }));
  }
});

test("actual deletion completion is queued atomically and duplicate execution never resends", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/account-deletion-notice-route-mocks.mjs", import.meta.url))], { encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
