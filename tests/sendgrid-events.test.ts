import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  sendGridDeliveryStatus,
  sendGridMessageIdCandidates,
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
