import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("autopay consent backfill is dry-run-first and fingerprint guarded", () => {
  const source = readFileSync("scripts/backfill-audited-autopay-payment-method-consent.ts", "utf8");
  assert.match(source, /mode: "read_only_preview"/);
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /--acknowledge-existing-parent-autopay-consent/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /billing\.autopay\.enabled/);
  assert.match(source, /stripeDefaultPaymentMethodId/);
  assert.match(source, /enabled_by_user_not_linked_guardian/);
  assert.match(source, /billing\.autopay\.payment_method_consent_backfilled/);
  assert.match(source, /cardCharges: 0/);
  assert.match(source, /externalMessages: 0/);
  assert.match(source, /stripeMutations: 0/);
});
