import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  computeCommunicationSmsDeliveryState,
  computeIntegrationDeliveryState,
  nextIntegrationRetryAt,
  staleTimeSensitiveDeliveryReason,
} from "@/lib/integration-deliveries";

test("Twilio submission remains accepted until a delivery callback confirms the outcome", () => {
  const now = new Date("2026-08-25T17:00:00.000Z");
  assert.deepEqual(
    computeCommunicationSmsDeliveryState({
      result: { ok: true, id: "SM123" },
      attempts: 1,
      statusCallbackUrl: "https://thebeesuite.io/api/twilio/status",
      now,
    }),
    { status: "accepted", nextAttemptAt: null, deliveredAt: null },
  );
  assert.deepEqual(
    computeCommunicationSmsDeliveryState({ result: { ok: true, id: "SM123" }, attempts: 1, now }),
    { status: "delivered", nextAttemptAt: null, deliveredAt: now },
  );
});

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

test("stale or out-of-window FTE retries are skipped instead of emailing an old reminder", () => {
  assert.equal(
    staleTimeSensitiveDeliveryReason(
      "fte_reminder_email",
      { weekStart: "2026-06-22" },
      new Date("2026-08-10T14:30:00.000Z"),
    ),
    "The FTE reporting week is no longer current.",
  );
  assert.equal(
    staleTimeSensitiveDeliveryReason(
      "fte_reminder_sms",
      { weekStart: "2026-08-10" },
      new Date("2026-08-10T14:30:00.000Z"),
    ),
    "FTE external reminders are outside the approved Friday evening window.",
  );
  assert.equal(
    staleTimeSensitiveDeliveryReason("parent_invitation_email", {}, new Date("2026-08-10T14:30:00.000Z")),
    null,
  );
});

test("FTE SMS delivery records retain the reporting week needed for safe retries", () => {
  const deliverySource = readFileSync(new URL("../src/lib/integration-deliveries.ts", import.meta.url), "utf8");
  const fteSource = readFileSync(new URL("../src/app/api/cron/fte-reminders/route.ts", import.meta.url), "utf8");
  assert.match(deliverySource, /metadata\?: Record<string, unknown>/);
  assert.match(deliverySource, /dedupeKey: dedupeKey \?\? null,[\s\S]*\.\.\.metadata/);
  assert.match(fteSource, /purpose: "fte_reminder_sms",[\s\S]*metadata: \{[\s\S]*weekStart: weekLabel/);
});
