import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parents control autopay consent and directors can only run enabled autopay", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const paymentMethodRoute = readFileSync("src/app/api/billing/payment-method-session/route.ts", "utf8");
  const autopayRoute = readFileSync("src/app/api/billing/autopay/route.ts", "utf8");

  assert.match(workbench, /Parents enable or disable autopay from their Parent Portal/);
  assert.doesNotMatch(workbench, /manageFamilyPaymentMethod\("enable_autopay"\)/);
  assert.doesNotMatch(workbench, /manageFamilyPaymentMethod\("disable_autopay"\)/);
  assert.doesNotMatch(workbench, /openPaymentReview\("saved_method"\)/);
  assert.match(workbench, /selectedAutopayStatus !== "enabled"/);

  assert.match(paymentMethodRoute, /Autopay can only be enabled or disabled by a linked parent or guardian/);
  assert.match(paymentMethodRoute, /\(action === "enable_autopay" \|\| action === "disable_autopay"\) && !parentFacing/);
  assert.match(autopayRoute, /A saved payment method can only be run after the parent enables autopay/);
  assert.match(autopayRoute, /collectionMode: "autopay"/);
});
