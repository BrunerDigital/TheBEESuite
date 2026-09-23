import assert from "node:assert/strict";
import test from "node:test";
import { passwordUpdateFailure, readPasswordRecoveryRetry, sealPasswordRecoveryRetry } from "@/lib/password-recovery-retry";

test("recovery retry credentials are encrypted, bounded and reject tampering and key changes", () => {
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "synthetic-test-secret";
  try {
    const now = 100_000;
    const value = { accessToken: "private-access", tokenHash: "private-hash", email: "fake@example.invalid" };
    const ticket = sealPasswordRecoveryRetry(value, now);
    assert.doesNotMatch(ticket, /private|example/);
    assert.deepEqual(readPasswordRecoveryRetry(ticket, now), { ...value, expiresAt: now + 600_000 });
    assert.equal(readPasswordRecoveryRetry(ticket, now + 600_000), null);
    assert.equal(readPasswordRecoveryRetry(ticket, now - 1), null);
    const bytes = Buffer.from(ticket, "base64url"); bytes[30] ^= 1;
    assert.equal(readPasswordRecoveryRetry(bytes.toString("base64url"), now), null);
    assert.equal(readPasswordRecoveryRetry("malformed", now), null);
    process.env.AUTH_SECRET = "different-secret";
    assert.equal(readPasswordRecoveryRetry(ticket, now), null);
  } finally { if (original === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = original; }
});

test("provider password rejection has actionable safe copy and never exposes provider text", () => {
  assert.equal(passwordUpdateFailure(422, { code: "weak_password", msg: "private" }).category, "weak_password");
  assert.equal(passwordUpdateFailure(422, { code: "same_password" }).retryable, true);
  assert.equal(passwordUpdateFailure(403, { msg: "private" }).retryable, false);
  assert.equal(passwordUpdateFailure(503, {}).status, 503);
  assert.doesNotMatch(JSON.stringify(passwordUpdateFailure(422, { msg: "private" })), /private/);
});
