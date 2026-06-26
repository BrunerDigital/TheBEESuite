import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentMethodRequestCheckoutBranding,
  buildPaymentMethodRequestEmailText,
  buildPaymentMethodRequestEmailSubject,
  buildPaymentMethodRequestFocusedFormUrl,
  buildPaymentMethodRequestFormUrl,
  buildPaymentMethodRequestNotificationBody,
  buildPublicPaymentBrandAssetUrl,
  createPaymentMethodRequestToken,
  extractFirstUrl,
  paymentMethodRequestBrandSender,
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "../src/lib/payment-method-request-forms";

test("payment method request tokens validate family, center, tenant, and email", () => {
  process.env.AUTH_SECRET = "test-payment-method-request-secret";
  const now = new Date("2026-06-19T12:00:00.000Z");
  const token = createPaymentMethodRequestToken({
    familyId: "family_1",
    centerId: "center_1",
    tenantId: "tenant_1",
    email: "Parent@Example.com",
    now,
  });

  const result = validatePaymentMethodRequestToken(token, new Date("2026-06-20T12:00:00.000Z"));
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.payload.familyId : "", "family_1");
  assert.equal(result.ok ? result.payload.centerId : "", "center_1");
  assert.equal(result.ok ? result.payload.tenantId : "", "tenant_1");
  assert.equal(result.ok ? result.payload.email : "", "parent@example.com");
});

test("instant bank request copy focuses parents on bank login verification", () => {
  const formUrl = buildPaymentMethodRequestFocusedFormUrl("https://thebeesuite.io/", "token_123", "instant_bank_verification");
  const email = buildPaymentMethodRequestEmailText({
    recipientLabel: "Alex Parent",
    familyName: "Johnson Family",
    centerLabel: "Sarasota",
    formUrl,
    intent: "instant_bank_verification",
  });
  const notification = buildPaymentMethodRequestNotificationBody({
    familyName: "Johnson Family",
    formUrl,
    intent: "instant_bank_verification",
  });

  assert.equal(formUrl, "https://thebeesuite.io/payment-method-form/token_123?focus=instant-bank");
  assert.equal(paymentMethodRequestBrandSender("Sarasota"), "Sarasota via The BEE Suite");
  assert.equal(
    buildPaymentMethodRequestEmailSubject({ centerLabel: "Sarasota", intent: "instant_bank_verification" }),
    "Sarasota via The BEE Suite: secure bank verification requested",
  );
  assert.match(email, /Sarasota via The BEE Suite is asking/i);
  assert.match(email, /verify a bank account/i);
  assert.match(email, /branded The BEE Suite link/i);
  assert.match(email, /instead of waiting for microdeposits/i);
  assert.match(email, /Stripe may appear only as the regulated payment processor/i);
  assert.match(notification, /branded The BEE Suite bank verification form/i);
  assert.equal(extractFirstUrl(notification), formUrl);
});

test("payment method request tokens expire", () => {
  process.env.AUTH_SECRET = "test-payment-method-request-secret";
  const token = createPaymentMethodRequestToken({
    familyId: "family_1",
    centerId: "center_1",
    tenantId: "tenant_1",
    email: "parent@example.com",
    now: new Date("2026-06-01T12:00:00.000Z"),
    ttlDays: 1,
  });

  const result = validatePaymentMethodRequestToken(token, new Date("2026-06-03T12:00:00.000Z"));
  assert.equal(result.ok, false);
  assert.match(result.error, /expired/i);
});

test("payment method request recipients are deduped to saved family emails", () => {
  const recipients = paymentMethodRequestRecipientOptions({
    billingEmail: "Parent@Example.com",
    guardians: [
      { id: "guardian_1", fullName: "Alex Parent", email: "parent@example.com", userId: "user_1" },
      { id: "guardian_2", fullName: "Bailey Parent", email: "bailey@example.com", userId: null },
      { id: "guardian_3", fullName: "No Email", email: null, userId: null },
    ],
  });

  assert.deepEqual(recipients.map((recipient) => recipient.email).sort(), ["bailey@example.com", "parent@example.com"]);
  assert.deepEqual(recipients.find((recipient) => recipient.email === "parent@example.com")?.guardianIds, ["guardian_1"]);
  assert.deepEqual(recipients.find((recipient) => recipient.email === "parent@example.com")?.userIds, ["user_1"]);
});

test("payment method request copy links to the branded form", () => {
  const formUrl = buildPaymentMethodRequestFormUrl("https://thebeesuite.io/", "token_123");
  const email = buildPaymentMethodRequestEmailText({
    recipientLabel: "Alex Parent",
    familyName: "Johnson Family",
    centerLabel: "Sarasota",
    formUrl,
  });
  const notification = buildPaymentMethodRequestNotificationBody({ familyName: "Johnson Family", formUrl });

  assert.equal(formUrl, "https://thebeesuite.io/payment-method-form/token_123");
  assert.equal(
    buildPaymentMethodRequestEmailSubject({ centerLabel: "Sarasota" }),
    "Sarasota via The BEE Suite: secure tuition payment steps",
  );
  assert.match(email, /pay an open invoice/i);
  assert.match(email, /verify a bank account instantly/i);
  assert.match(email, /debit\/credit card/i);
  assert.match(email, /branded The BEE Suite link/i);
  assert.match(email, /Stripe may appear only as the regulated payment processor/i);
  assert.match(notification, /branded The BEE Suite payment form/i);
  assert.equal(extractFirstUrl(notification), formUrl);
});

test("payment method request checkout branding uses public Bee Suite assets and school copy", () => {
  const logoUrl = buildPublicPaymentBrandAssetUrl("https://thebeesuite.io/", "/brand/the-bee-suite/app-icon-dark.png");
  const localLogoUrl = buildPublicPaymentBrandAssetUrl("http://localhost:3000", "/brand/the-bee-suite/app-icon-dark.png");
  const branding = buildPaymentMethodRequestCheckoutBranding({
    centerLabel: "Sarasota",
    familyName: "Johnson Family",
    intent: "instant_bank_verification",
    logoUrl,
    iconUrl: "https://thebeesuite.io/brand/the-bee-suite/favicon-dark.png",
  });

  assert.equal(logoUrl, "https://thebeesuite.io/brand/the-bee-suite/app-icon-dark.png");
  assert.equal(localLogoUrl, null);
  assert.equal(branding.displayName, "Sarasota via The BEE Suite");
  assert.equal(branding.logoUrl, logoUrl);
  assert.match(branding.submitMessage ?? "", /The BEE Suite does not store your bank login/i);
  assert.match(branding.afterSubmitMessage ?? "", /return to The BEE Suite/i);
  assert.match(branding.setupDescription ?? "", /payment profile setup for Johnson Family/i);
});
