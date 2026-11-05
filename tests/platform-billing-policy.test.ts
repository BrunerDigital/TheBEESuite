import assert from "node:assert/strict";
import test from "node:test";
import { canAccessModule } from "../src/lib/rbac";
import {
  canManagePlatformBilling, PLATFORM_PAYMENT_SCOPE, platformBillingAmount,
  platformBillingEmail, platformBillingRequestId, platformCheckoutUrl, platformInvoiceUrl, platformObjectMetadata,
} from "../src/lib/platform-billing-policy";
import { platformCheckoutParams } from "../src/lib/platform-billing-stripe";

test("only a platform executive in the platform-wide workspace can manage platform revenue", () => {
  const platform = { role: "PLATFORM_OWNER", accessScope: "platform", workspace: { mode: "all" } };
  assert.equal(canManagePlatformBilling(platform), true);
  assert.equal(canAccessModule(platform, "platform-billing"), true);
  for (const role of ["BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN", "PARENT_GUARDIAN", "TEACHER", "READ_ONLY_AUDITOR", "AUTHORIZED_PICKUP"]) {
    assert.equal(canManagePlatformBilling({ ...platform, role }), false, role);
    assert.equal(canAccessModule({ ...platform, role }, "platform-billing"), false, role);
  }
  for (const value of [null, {}, { ...platform, accessScope: "tenant" }, { ...platform, workspace: { mode: "center" } }, { ...platform, applicationAccess: "fte_only" }, { ...platform, workspace: { mode: "all", readOnlyHistory: true } }]) {
    assert.equal(canManagePlatformBilling(value), false);
  }
  assert.equal(canAccessModule("PLATFORM_OWNER", "platform-billing"), false, "a role string alone is insufficient authority");
});

test("USD amounts are exact cents within the provider's supported range", () => {
  for (const [input, expected] of [["0.50", 50], ["49", 4900], ["79.00", 7900], ["1234.56", 123456], [" 12.3 ", 1230], ["999999.99", 99999999]] as const) {
    assert.equal(platformBillingAmount(input), expected);
  }
  for (const value of [null, 49, "", "0", "0.49", "-1", "1.001", "1e3", "1,000", "$49", "NaN", "Infinity", "1000000", "12.34abc"]) assert.throws(() => platformBillingAmount(value), String(value));
});

test("payer email and request IDs reject ambiguous or malformed inputs", () => {
  assert.equal(platformBillingEmail(" Payer@Example.com "), "payer@example.com");
  assert.throws(() => platformBillingEmail("payer@example.com\nBcc:other@example.com"));
  assert.throws(() => platformBillingEmail("payer"));
  const id = crypto.randomUUID();
  assert.equal(platformBillingRequestId(id.toUpperCase()), id);
  assert.throws(() => platformBillingRequestId("reused"));
});

test("checkout collects the entered amount for the platform and asks the payer to authorize monthly billing", () => {
  const input = { id: "charge", accountId: "account", billerTenantId: "platform", customerId: "cus_payer", kind: "ONE_TIME", description: "Setup services", amountCents: 12345, returnBaseUrl: "https://thebeesuite.io" };
  const single = platformCheckoutParams(input);
  assert.equal(single.mode, "payment");
  assert.equal(single.line_items?.[0].price_data?.unit_amount, 12345);
  assert.equal(single.payment_intent_data?.metadata?.paymentScope, PLATFORM_PAYMENT_SCOPE);
  assert.equal(single.invoice_creation?.enabled, true);
  assert.equal(single.payment_intent_data?.transfer_data, undefined);
  assert.equal(single.payment_intent_data?.application_fee_amount, undefined);
  assert.equal(single.payment_intent_data?.on_behalf_of, undefined);
  assert.equal("payment_method_types" in single, false);
  assert.equal(single.automatic_tax, undefined);
  assert.match(single.success_url!, /platform-payment-return/);
  assert.match(single.integration_identifier!, /^bee_suite_platform_[a-z]{8}$/);
  assert.deepEqual(platformCheckoutParams(input), single, "retries must send identical provider parameters");
  const monthly = platformCheckoutParams({ ...input, kind: "MONTHLY" });
  assert.equal(monthly.mode, "subscription");
  assert.equal(monthly.line_items?.[0].price_data?.recurring?.interval, "month");
  assert.equal(monthly.subscription_data?.metadata?.platformChargeId, "charge");
  const submit = monthly.custom_text?.submit;
  assert.ok(submit && typeof submit !== "string");
  assert.match(submit.message, /authorize.*each month/);
});

test("modern and legacy invoice subscription metadata route to the platform desk", () => {
  const metadata = { paymentScope: PLATFORM_PAYMENT_SCOPE, platformChargeId: "charge" };
  assert.deepEqual(platformObjectMetadata({ metadata }), metadata);
  assert.deepEqual(platformObjectMetadata({ parent: { subscription_details: { metadata } } }), metadata);
  assert.deepEqual(platformObjectMetadata({ subscription_details: { metadata } }), metadata);
  assert.deepEqual(platformObjectMetadata({ metadata: { paymentScope: "school_software_fee" } }), {});
});

test("only secure Stripe checkout and invoice URLs are exposed", () => {
  assert.equal(platformCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test"), true);
  assert.equal(platformInvoiceUrl("https://invoice.stripe.com/i/acct/test"), true);
  for (const url of ["javascript:alert(1)", "http://checkout.stripe.com/c/pay/x", "https://checkout.stripe.com.evil.test/pay", "https://evil.test"]) {
    assert.equal(platformCheckoutUrl(url), false);
    assert.equal(platformInvoiceUrl(url), false);
  }
});
