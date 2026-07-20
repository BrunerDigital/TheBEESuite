import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  normalizeSendGridEvent,
  processSendGridEventBatch,
  sendGridDeliveryStatus,
  sendGridBlockedCurrentStatuses,
  sendGridMessageIdCandidates,
  sendGridStateTransition,
  summarizeSendGridDeliveryHealth,
  verifySendGridEventSignature,
} from "@/lib/sendgrid-events";

test("SendGrid event signatures are verified against the unmodified payload", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const payload = JSON.stringify([{ event: "delivered", sg_message_id: "message-1" }]);
  const timestamp = "1784556000";
  const signature = sign("sha256", Buffer.from(timestamp + payload), privateKey).toString("base64");
  const verificationKey = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  assert.equal(verifySendGridEventSignature({ payload, signature, timestamp, verificationKey }), true);
  assert.equal(verifySendGridEventSignature({ payload: `${payload} `, signature, timestamp, verificationKey }), false);
  assert.equal(verifySendGridEventSignature({ payload, signature: null, timestamp, verificationKey }), false);
  assert.equal(verifySendGridEventSignature({ payload, signature: "not-base64", timestamp, verificationKey }), false);
  assert.equal(verifySendGridEventSignature({ payload, signature, timestamp: "1784556001", verificationKey }), false);
});

test("SendGrid batches durably deduplicate replays and skip malformed events", async () => {
  const claimed = new Set<string>();
  const processed: string[] = [];
  const repository = {
    processOnce: async (event: NonNullable<ReturnType<typeof normalizeSendGridEvent>>) => {
      if (claimed.has(event.eventId)) return "duplicate" as const;
      claimed.add(event.eventId);
      processed.push(event.eventType);
      return "processed" as const;
    },
  };
  const batch = [
    { event: "processed", sg_event_id: "evt-1", sg_message_id: "msg-1", timestamp: 1784556000 },
    { event: "deferred", sg_event_id: "evt-2", sg_message_id: "msg-2" },
    { event: "open", sg_event_id: "evt-3", sg_message_id: "msg-3" },
    { event: "bounce", sg_message_id: "msg-4" },
    null,
  ];

  assert.deepEqual(await processSendGridEventBatch(batch, repository), {
    received: 5, processed: 2, duplicates: 0, malformed: 3,
  });
  assert.deepEqual(await processSendGridEventBatch(batch, repository), {
    received: 5, processed: 0, duplicates: 2, malformed: 3,
  });
  assert.deepEqual(processed, ["processed", "deferred"]);
});

test("SendGrid state transitions do not regress final outcomes", () => {
  const accepted = normalizeSendGridEvent({ event: "processed", sg_event_id: "evt-a", sg_message_id: "msg" });
  const delivered = normalizeSendGridEvent({ event: "delivered", sg_event_id: "evt-d", sg_message_id: "msg" });
  const bounced = normalizeSendGridEvent({ event: "bounce", sg_event_id: "evt-b", sg_message_id: "msg" });
  assert.ok(accepted && delivered && bounced);
  assert.equal(sendGridStateTransition("accepted", delivered), "delivered");
  assert.equal(sendGridStateTransition("delivered", accepted), null);
  assert.equal(sendGridStateTransition("failed", delivered), null);
  assert.equal(sendGridStateTransition("delivered", bounced), "failed");
  assert.deepEqual(sendGridBlockedCurrentStatuses(accepted), ["delivered", "failed"]);
  assert.deepEqual(sendGridBlockedCurrentStatuses(delivered), ["failed"]);
  assert.deepEqual(sendGridBlockedCurrentStatuses(bounced), []);
});

test("SendGrid delivery health reports stale, deferred, suppressed, bounced, and follow-up counts", () => {
  const now = new Date("2026-07-20T18:00:00.000Z");
  const summary = summarizeSendGridDeliveryHealth([
    { status: "accepted", createdAt: new Date("2026-07-19T17:00:00.000Z"), lastResult: { event: "processed" } },
    { status: "accepted", createdAt: new Date("2026-07-20T17:00:00.000Z"), lastResult: { event: "deferred" } },
    { status: "failed", createdAt: now, lastResult: { event: "dropped" } },
    { status: "failed", createdAt: now, lastResult: { event: "spamreport" } },
    { status: "failed", createdAt: now, lastResult: { event: "bounce" } },
  ], now);
  assert.deepEqual(summary, { acceptedStale: 1, deferred: 1, suppressed: 2, bounced: 1, needsFollowUp: 4 });
});

test("SendGrid webhook rejects unsigned requests before parsing or persistence", async () => {
  const original = process.env.REQUEST_RESPONSE_LOGGING;
  process.env.REQUEST_RESPONSE_LOGGING = "off";
  try {
    const { POST } = await import("@/app/api/sendgrid/events/route");
    const response = await POST(new Request("https://example.test/api/sendgrid/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }) as never);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "Invalid SendGrid signature." });
  } finally {
    if (original === undefined) delete process.env.REQUEST_RESPONSE_LOGGING;
    else process.env.REQUEST_RESPONSE_LOGGING = original;
  }
});

test("SendGrid delivery events distinguish acceptance from final outcomes", () => {
  assert.equal(sendGridDeliveryStatus("processed"), "accepted");
  assert.equal(sendGridDeliveryStatus("deferred"), "accepted");
  assert.equal(sendGridDeliveryStatus("delivered"), "delivered");
  assert.equal(sendGridDeliveryStatus("bounce"), "failed");
  assert.equal(sendGridDeliveryStatus("dropped"), "failed");
  assert.equal(sendGridDeliveryStatus("spamreport"), "failed");
  assert.equal(sendGridDeliveryStatus("open"), null);
});

test("SendGrid message ids include the provider base id used at submission", () => {
  assert.deepEqual(sendGridMessageIdCandidates("abc123.filter0001.12345"), ["abc123.filter0001.12345", "abc123"]);
  assert.deepEqual(sendGridMessageIdCandidates("abc123"), ["abc123"]);
  assert.deepEqual(sendGridMessageIdCandidates(""), []);
});
