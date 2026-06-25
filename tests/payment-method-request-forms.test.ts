import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentMethodRequestEmailText,
  buildPaymentMethodRequestFocusedFormUrl,
  buildPaymentMethodRequestFormUrl,
  buildPaymentMethodRequestNotificationBody,
  createPaymentMethodRequestToken,
  extractFirstUrl,
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
  assert.match(email, /instantly verify a bank account/i);
  assert.match(email, /log in to your bank through Stripe Financial Connections/i);
  assert.match(email, /instead of waiting for microdeposits/i);
  assert.match(notification, /verify a bank account instantly/i);
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
  assert.match(email, /pay an open invoice/i);
  assert.match(email, /verify a bank account instantly/i);
  assert.match(email, /debit\/credit card/i);
  assert.match(email, /securely through Stripe/i);
  assert.equal(extractFirstUrl(notification), formUrl);
});
