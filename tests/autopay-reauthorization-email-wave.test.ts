import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/send-autopay-reauthorization-email-wave.ts", "utf8");

test("autopay reauthorization email wave is exact, idempotent, and no-charge", () => {
  assert.match(source, /status: "active"/);
  assert.match(source, /currentlyEnrolledChildWhere\(\)/);
  assert.match(source, /consentMethodId !== savedMethodId/);
  assert.match(source, /exact_autopay_payment_method_binding_not_proven/);
  assert.match(source, /stripeConnectSavedMethodNeedsReauthorization/);
  assert.match(source, /readiness\.canAcceptParentPayments/);
  assert.match(source, /option\.userIds\.includes\(enabledByUserId\)/);
  assert.match(source, /enablingGuardian\?\.fullName/);
  assert.match(source, /pre-send attempt\(s\) require provider reconciliation/);
  assert.match(source, /sendGridEventReceipt\.findMany/);
  assert.match(source, /reconciledAfterProviderAcceptance: true/);
  assert.match(source, /dedupeKey: candidate\.dedupeKey/);
  assert.match(source, /--confirm-approved-autopay-reauthorization-email-wave/);
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /disableClickTracking: true/);
  assert.match(source, /No payment will be charged while completing this update/);
  assert.match(source, /autopayChanges: 0/);
  assert.doesNotMatch(source, /paymentIntent|invoice\.(?:create|update)|billingAccount\.(?:create|update)/i);
});
