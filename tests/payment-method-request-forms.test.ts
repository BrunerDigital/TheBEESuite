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
  getPaymentMethodRequestAppBaseUrl,
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

test("payment method reauthorization is signed into the request token and uses no-charge copy", () => {
  process.env.AUTH_SECRET = "test-payment-method-request-secret";
  const token = createPaymentMethodRequestToken({
    familyId: "family_1", centerId: "center_1", tenantId: "tenant_1",
    email: "parent@example.com", intent: "payment_method_reauthorization",
    now: new Date("2026-08-12T12:00:00.000Z"),
  });
  const result = validatePaymentMethodRequestToken(token, new Date("2026-08-12T13:00:00.000Z"));
  assert.equal(result.ok ? result.payload.intent : null, "payment_method_reauthorization");
  const email = buildPaymentMethodRequestEmailText({
    recipientLabel: "Alex Parent", familyName: "Johnson Family", centerLabel: "Centennial",
    formUrl: "https://thebeesuite.io/payment-method-form/token", intent: "payment_method_reauthorization",
  });
  assert.match(email, /No payment will be charged today/i);
  assert.match(email, /autopay choice will remain unchanged/i);
  assert.doesNotMatch(email, /pay an open invoice/i);
});

test("bank account request copy separates verification from autopay consent", () => {
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
    "Sarasota via The BEE Suite: secure bank account verification requested",
  );
  assert.match(email, /Sarasota via The BEE Suite is asking/i);
  assert.match(email, /verify a bank account/i);
  assert.match(email, /does not turn on autopay/i);
  assert.match(email, /Connect securely through your bank/i);
  assert.match(email, /instead of waiting for microdeposits/i);
  assert.match(email, /Stripe provides the secure payment form/i);
  assert.match(notification, /Verify a bank account/i);
  assert.match(notification, /does not turn on autopay/i);
  assert.doesNotMatch(notification, /enable autopay/i);
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
    "Sarasota via The BEE Suite: tuition payment options",
  );
  assert.match(email, /pay an open invoice/i);
  assert.match(email, /connect a bank account/i);
  assert.match(email, /debit or credit card/i);
  assert.match(email, /does not turn on autopay/i);
  assert.match(email, /Stripe provides the secure payment form/i);
  assert.match(notification, /Review tuition payment options/i);
  assert.equal(extractFirstUrl(notification), formUrl);
});

test("payment method request app URL keeps emailed links on the secure Bee Suite host", () => {
  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    APP_URL: process.env.APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  try {
    process.env.NEXT_PUBLIC_APP_URL = "https://bad-cert.example.com";
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;

    assert.equal(
      getPaymentMethodRequestAppBaseUrl("https://bad-cert.example.com/api/billing/payment-method-requests"),
      "https://thebeesuite.io",
    );

    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "the-bee-suite-preview-brunerdigitals-projects.vercel.app";

    assert.equal(
      getPaymentMethodRequestAppBaseUrl("https://the-bee-suite-preview-brunerdigitals-projects.vercel.app/api/billing/payment-method-requests"),
      "https://thebeesuite.io",
    );

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    delete process.env.VERCEL_URL;
    Reflect.set(process.env, "NODE_ENV", "test");

    assert.equal(
      getPaymentMethodRequestAppBaseUrl("http://localhost:3000/api/billing/payment-method-requests"),
      "http://localhost:3000",
    );
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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
  assert.match(branding.submitMessage ?? "", /Connect your bank account/i);
  assert.match(branding.submitMessage ?? "", /does not turn on autopay/i);
  assert.match(branding.submitMessage ?? "", /does not store your bank sign-in credentials/i);
  assert.match(branding.afterSubmitMessage ?? "", /return to The BEE Suite/i);
  assert.match(branding.setupDescription ?? "", /Payment method setup for Johnson Family/i);
});
