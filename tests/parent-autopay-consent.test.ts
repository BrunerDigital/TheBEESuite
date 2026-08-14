import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parents control autopay consent and directors can only run enabled autopay", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const familyEditor = readFileSync("src/components/family-record-editor.tsx", "utf8");
  const invoiceAction = readFileSync("src/components/invoice-stored-payment-button.tsx", "utf8");
  const paymentMethodRoute = readFileSync("src/app/api/billing/payment-method-session/route.ts", "utf8");
  const autopayRoute = readFileSync("src/app/api/billing/autopay/route.ts", "utf8");
  const autopayProcessor = readFileSync("src/lib/autopay-processing.ts", "utf8");

  assert.match(workbench, /Parents enable or disable autopay from their Parent Portal/);
  assert.doesNotMatch(workbench, /manageFamilyPaymentMethod\("enable_autopay"\)/);
  assert.doesNotMatch(workbench, /manageFamilyPaymentMethod\("disable_autopay"\)/);
  assert.doesNotMatch(workbench, /openPaymentReview\("saved_method"\)/);
  assert.match(workbench, /selectedAutopayStatus !== "enabled"/);
  assert.doesNotMatch(familyEditor, /manageFamilyPaymentMethod\("enable_autopay"\)/);
  assert.doesNotMatch(familyEditor, /manageFamilyPaymentMethod\("disable_autopay"\)/);
  assert.match(familyEditor, /Parents enable or disable autopay from their Parent Portal/);
  assert.match(invoiceAction, /method\.autopayStatus !== "enabled"/);
  assert.match(invoiceAction, /Process authorized autopay/);
  assert.doesNotMatch(invoiceAction, /processStoredMethod: true/);

  assert.match(paymentMethodRoute, /Autopay can only be enabled or disabled by a linked parent or guardian/);
  assert.match(paymentMethodRoute, /\(action === "enable_autopay" \|\| action === "disable_autopay"\) && !parentFacing/);
  assert.match(autopayRoute, /A saved payment method can only be run after the parent enables autopay/);
  assert.match(autopayRoute, /collectionMode: "autopay"/);
  assert.match(autopayRoute, /invoiceId && result\.results\.length === 0/);
  assert.match(workbench, /!first \|\| first\.status === "failed"/);
  assert.match(autopayProcessor, /guardians: \{ select: \{ userId: true \} \}/);
  assert.match(autopayProcessor, /autopayEnabledByUserId/);
  assert.match(autopayProcessor, /consentIsFromLinkedGuardian/);
  assert.match(autopayProcessor, /must re-enable autopay in the Parent Portal/);
});
