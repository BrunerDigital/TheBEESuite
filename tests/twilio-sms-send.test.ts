import assert from "node:assert/strict";
import test from "node:test";
import { sendSms } from "../src/lib/integrations";

test("SMS API requests support Messaging Services, direct senders, callbacks, and provider errors without live sends", async (t) => {
  const keys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"];
  const previous = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }));
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test_token";
  process.env.TWILIO_FROM_NUMBER = "+15555550124";
  process.env.TWILIO_MESSAGING_SERVICE_SID = "MGtest";
  const requests: Array<{ url: string; body: URLSearchParams }> = [];
  let responseStatus = 201;
  let responseBody: Record<string, unknown> = { sid: "SMtest" };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Basic ${Buffer.from("ACtest:test_token").toString("base64")}`);
    requests.push({ url: String(input), body: new URLSearchParams(String(init?.body)) });
    return new Response(JSON.stringify(responseBody), { status: responseStatus });
  });

  const input = { to: "+15555550123", body: "Local test only", statusCallbackUrl: "https://example.test/api/twilio/status" };
  assert.equal((await sendSms(input)).id, "SMtest");
  assert.equal(requests[0]?.url, "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
  assert.equal(requests[0]?.body.get("MessagingServiceSid"), "MGtest");
  assert.equal(requests[0]?.body.has("From"), false);
  assert.equal(requests[0]?.body.get("To"), input.to);
  assert.equal(requests[0]?.body.get("StatusCallback"), input.statusCallbackUrl);

  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  assert.equal((await sendSms(input)).ok, true);
  assert.equal(requests[1]?.body.get("From"), "+15555550124");
  assert.equal(requests[1]?.body.has("MessagingServiceSid"), false);

  responseStatus = 400;
  responseBody = { code: 21610, message: "Recipient opted out." };
  const rejected = await sendSms(input);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.configured, true);
  assert.equal(rejected.providerErrorCode, "21610");
  assert.equal(rejected.retryable, false);

  delete process.env.TWILIO_AUTH_TOKEN;
  const requestCount = requests.length;
  assert.equal((await sendSms(input)).configured, false);
  assert.equal(requests.length, requestCount);
});
