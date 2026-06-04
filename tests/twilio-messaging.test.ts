import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  phoneMatchKey,
  twilioDeliveryStatus,
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
