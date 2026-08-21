import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/preview-centennial-payment-method-reauthorization.ts", "utf8");

test("Centennial reauthorization preview is exact and read only", () => {
  assert.match(source, /cms3g2the000i6a7wdd8pa20s/);
  assert.match(source, /mode: "read_only_preview"/);
  assert.match(source, /stripeConnectSavedMethodNeedsReauthorization/);
  assert.match(source, /!requiresReauthorization/);
  assert.match(source, /requiresReauthorization: true/);
  assert.match(source, /recipientEmailHash/);
  assert.doesNotMatch(source, /prisma\.[a-zA-Z]+\.(?:create|update|upsert|delete)/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /send|notify|invitation/i);
});

test("Centennial preview reports but never changes autopay or consent", () => {
  assert.match(source, /autopayEnabled:/);
  assert.match(source, /select: \{ autopayPlaceholder: true, customFields: true \}/);
  assert.doesNotMatch(source, /data:\s*\{[\s\S]{0,200}autopayPlaceholder/);
  assert.doesNotMatch(source, /parentConsent|autopayConsent|consentConfirmedAt/);
});
