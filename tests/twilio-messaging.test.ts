import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseTwilioWebhookParams,
  isTwilioWebhookReceiptUniqueConflict,
  phoneMatchKey,
  twilioBlockedCurrentStatuses,
  twilioDeliveryStatus,
  twilioStateTransition,
  twilioSmsConsentAction,
  uniqueSmsRecipients,
  validateTwilioSignature,
} from "@/lib/twilio-messaging";

function signature(authToken: string, url: string, params: Record<string, string>) {
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => `${accumulator}${key}${params[key]}`, url);
  return createHmac("sha1", authToken).update(payload).digest("base64");
}

test("Twilio signature validation uses sorted form params and rejects tampering", () => {
  const authToken = "test_auth_token";
  const url = "https://thebeesuite.io/api/twilio/inbound";
  const params = {
    From: "+19415551212",
    Body: "Pickup question",
    MessageSid: "SM123",
  };
  const validSignature = signature(authToken, url, params);

  assert.equal(validateTwilioSignature({ authToken, signature: validSignature, url, params }), true);
  assert.equal(
    validateTwilioSignature({
      authToken,
      signature: validSignature,
      url,
      params: { ...params, Body: "Changed" },
    }),
    false,
  );
});

test("SMS phone matching dedupes formatted guardian numbers", () => {
  assert.equal(phoneMatchKey("+1 (941) 555-1212"), "9415551212");
  assert.deepEqual(
    uniqueSmsRecipients(["+1 (941) 555-1212", "941-555-1212", "", null, "+1 941 555 1213"]),
    ["+1 (941) 555-1212", "+1 941 555 1213"],
  );
});

test("Twilio provider statuses collapse to queue states", () => {
  assert.equal(twilioDeliveryStatus("queued"), "pending");
  assert.equal(twilioDeliveryStatus("sent"), "pending");
  assert.equal(twilioDeliveryStatus("delivered"), "delivered");
  assert.equal(twilioDeliveryStatus("undelivered"), "failed");
  assert.equal(twilioDeliveryStatus("failed"), "failed");
});

test("Twilio status callbacks cannot regress or replace terminal outcomes", () => {
  assert.deepEqual(twilioBlockedCurrentStatuses(), ["delivered", "failed"]);
  assert.equal(twilioStateTransition("pending", "delivered"), "delivered");
  assert.equal(twilioStateTransition("pending", "failed"), "failed");
  assert.equal(twilioStateTransition("delivered", "pending"), null);
  assert.equal(twilioStateTransition("failed", "pending"), null);
  assert.equal(twilioStateTransition("delivered", "failed"), null);
  assert.equal(twilioStateTransition("failed", "delivered"), null);
});

test("Twilio inbound retries reserve a durable receipt before app side effects", async () => {
  assert.equal(isTwilioWebhookReceiptUniqueConflict({ code: "P2002", meta: { target: ["provider", "providerMessageId"] } }), true);
  assert.equal(isTwilioWebhookReceiptUniqueConflict({ code: "P2002", meta: { target: ["externalId"] } }), false);
  const source = await readFile(new URL("../src/app/api/twilio/inbound/route.ts", import.meta.url), "utf8");
  const transaction = source.indexOf("prisma.$transaction");
  const receipt = source.indexOf("tx.integrationDelivery.create", transaction);
  const message = source.indexOf("tx.message.create", transaction);
  assert.ok(transaction >= 0 && receipt > transaction && message > receipt);
});

test("Twilio SMS consent keywords require exact opt-in or opt-out commands", () => {
  assert.equal(twilioSmsConsentAction("STOP"), "opt_out");
  assert.equal(twilioSmsConsentAction(" stop. "), "opt_out");
  assert.equal(twilioSmsConsentAction("stopall"), "opt_out");
  assert.equal(twilioSmsConsentAction("unsubscribe"), "opt_out");
  assert.equal(twilioSmsConsentAction("START"), "opt_in");
  assert.equal(twilioSmsConsentAction(" yes! "), "opt_in");
  assert.equal(twilioSmsConsentAction("unstop"), "opt_in");
  assert.equal(twilioSmsConsentAction("please stop by the office"), null);
  assert.equal(twilioSmsConsentAction("stop reminders"), null);
});

test("Twilio webhook parsing accepts form posts and rejects malformed content", async () => {
  const formRequest = new Request("https://thebeesuite.io/api/twilio/inbound", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ MessageSid: "SM123", Body: "Pickup question" }),
  });
  assert.deepEqual(await parseTwilioWebhookParams(formRequest), {
    MessageSid: "SM123",
    Body: "Pickup question",
  });

  const malformedRequest = new Request("https://thebeesuite.io/api/twilio/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(await parseTwilioWebhookParams(malformedRequest), null);
});
