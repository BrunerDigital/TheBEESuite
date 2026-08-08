import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/apply-oakleaf-director-tuition-reply.ts", import.meta.url), "utf8");

test("Oakleaf director reply apply is school-scoped, fingerprinted, and payment-safe", () => {
  assert.match(source, /CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6"/);
  assert.match(source, /CENTER_NAME = "Kid City USA - Oakleaf"/);
  assert.match(source, /PERIOD = "2026-W33"/);
  assert.match(source, /--confirm-oakleaf-director-reply/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /verifyOakleafStripe/);
  assert.match(source, /stripeConnectReadinessFromSnapshot/);
  assert.match(source, /defaultBank\?\.last4/);
  assert.match(source, /enrollmentStatus: "withdrawn"/);
  assert.match(source, /classroomId: null/);
  assert.match(source, /tuitionBillingEnabled: false/);
  assert.match(source, /amountCents: 6_987/);
  assert.match(source, /amountCents: 9_750/);
  assert.match(source, /createBillingInvoiceForFamily/);
  assert.match(source, /autopaySuppressed: true/);
  assert.match(source, /noPaymentSubmitted: true/);
  assert.match(source, /paymentsSubmitted: 0/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete|upsert)/);
});
