import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPasswordResetProviderResponse,
  passwordResetEmailCooldownKey,
  passwordResetIpVolumeKey,
  providerRetryAfterSeconds,
} from "@/lib/password-reset-provider-response";

test("password-reset rate-limit keys are stable and contain no submitted address or client IP", () => {
  const emailKey = passwordResetEmailCooldownKey(" Parent@Example.com ");
  const ipKey = passwordResetIpVolumeKey("203.0.113.10");

  assert.equal(emailKey, passwordResetEmailCooldownKey("parent@example.com"));
  assert.match(emailKey, /^forgot-password:email:[a-f0-9]{24}$/);
  assert.match(ipKey, /^forgot-password:ip:[a-f0-9]{24}$/);
  assert.doesNotMatch(emailKey, /parent|example|@/i);
  assert.doesNotMatch(ipKey, /203|113/);
});

test("accepted password-reset provider responses retain privacy-safe success", () => {
  assert.deepEqual(
    classifyPasswordResetProviderResponse(new Response(null, { status: 200 })),
    { kind: "accepted" },
  );
});

test("provider 429 becomes a generic temporary failure with bounded retry guidance", () => {
  assert.deepEqual(
    classifyPasswordResetProviderResponse(new Response(null, {
      status: 429,
      headers: { "Retry-After": "90" },
    })),
    { kind: "temporary_failure", providerStatus: 429, retryAfterSeconds: 90 },
  );
});

test("provider 5xx responses become generic temporary failures", () => {
  assert.deepEqual(
    classifyPasswordResetProviderResponse(new Response(null, { status: 503 })),
    { kind: "temporary_failure", providerStatus: 503, retryAfterSeconds: 60 },
  );
});

test("non-temporary provider errors preserve the enumeration-safe success path", () => {
  assert.deepEqual(
    classifyPasswordResetProviderResponse(new Response(null, { status: 400 })),
    { kind: "privacy_safe_non_success", providerStatus: 400 },
  );
});

test("provider Retry-After parsing accepts dates and rejects excessive or invalid values", () => {
  assert.equal(providerRetryAfterSeconds("Wed, 21 Oct 2026 07:28:30 GMT", Date.parse("2026-10-21T07:28:00Z")), 30);
  assert.equal(providerRetryAfterSeconds("99999"), 900);
  assert.equal(providerRetryAfterSeconds("not-a-date"), 60);
});
