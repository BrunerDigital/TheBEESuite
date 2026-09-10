import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("reauthorization links cannot be mistaken for payment completion", () => {
  const form = source("src/components/payment-method-request-form.tsx");
  const checkout = source("src/app/api/billing/payment-method-request/checkout/route.ts");

  assert.match(form, /nextOpenInvoice && !reauthorization/);
  assert.match(form, /Payment received — method update still required/);
  assert.match(form, /This reauthorization link will not start a tuition payment/);
  assert.match(checkout, /payload\.intent === "payment_method_reauthorization"/);
  assert.match(checkout, /code: "payment_method_reauthorization_required"/);
  assert.match(checkout, /No payment was started/);
});

test("current parents must replace a prior-account saved method before checkout", () => {
  const route = source("src/app/api/billing/family-payment/route.ts");
  const portal = source("src/components/parent-portal-workspace.tsx");

  assert.match(route, /activeConnectedAccountId,[\s\S]*centerCustomFields: center\.customFields/);
  assert.match(route, /billingAccount\.family\._count\.children > 0[\s\S]*savedPaymentMethod\.paymentMethodReauthorizationRequired/);
  assert.match(route, /code: "payment_method_reauthorization_required"/);
  assert.match(route, /No payment was started/);
  assert.match(portal, /paymentMethodReauthorizationRequired && canReplaceSavedPaymentMethod/);
  assert.match(portal, /Replace the old-account payment method before paying/);
  assert.match(portal, /prevents this warning from returning/);
});
