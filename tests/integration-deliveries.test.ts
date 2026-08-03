import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  computeIntegrationDeliveryState,
  nextIntegrationRetryAt,
} from "@/lib/integration-deliveries";

test("integration delivery state records skipped, delivered, pending, and failed outcomes", () => {
  const now = new Date("2026-06-02T14:00:00.000Z");

  assert.deepEqual(
    computeIntegrationDeliveryState({
      result: { ok: true, skipped: true },
      attempts: 0,
      now,
    }),
    { status: "skipped", nextAttemptAt: null, deliveredAt: null },
  );

  assert.deepEqual(
    computeIntegrationDeliveryState({
      result: { ok: true },
      attempts: 1,
      now,
    }),
    { status: "delivered", nextAttemptAt: null, deliveredAt: now },
  );

  const pending = computeIntegrationDeliveryState({
    result: { ok: false, error: "Temporary provider failure." },
    attempts: 1,
    maxAttempts: 5,
    now,
  });
  assert.equal(pending.status, "pending");
  assert.equal(pending.deliveredAt, null);
  assert.equal(pending.nextAttemptAt?.toISOString(), "2026-06-02T14:05:00.000Z");

  assert.deepEqual(
    computeIntegrationDeliveryState({
      result: { ok: false, error: "Provider still failed." },
      attempts: 5,
      maxAttempts: 5,
      now,
    }),
    { status: "failed", nextAttemptAt: null, deliveredAt: null },
  );
});

test("integration retry delay backs off and caps at the largest configured delay", () => {
  const now = new Date("2026-06-02T14:00:00.000Z");

  assert.equal(nextIntegrationRetryAt(1, now).toISOString(), "2026-06-02T14:05:00.000Z");
  assert.equal(nextIntegrationRetryAt(2, now).toISOString(), "2026-06-02T14:15:00.000Z");
  assert.equal(nextIntegrationRetryAt(99, now).toISOString(), "2026-06-03T02:00:00.000Z");
});

test("integration retries atomically claim a due delivery before sending", () => {
  const source = readFileSync(new URL("../src/lib/integration-deliveries.ts", import.meta.url), "utf8");
  const retrySource = source.slice(source.indexOf("export async function retryPendingIntegrationDeliveries"));
  assert.match(source, /claimIntegrationDeliveryForRetry[\s\S]*integrationDelivery\.updateMany/);
  assert.match(source, /status: "pending"[\s\S]*attempts[\s\S]*nextAttemptAt/);
  assert.ok(retrySource.indexOf("claimIntegrationDeliveryForRetry") < retrySource.indexOf("sendDelivery("));
  assert.match(retrySource, /status: "claimed_elsewhere"/);
});
