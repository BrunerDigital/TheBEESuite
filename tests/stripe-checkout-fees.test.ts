import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getStripeCheckoutAmounts,
  shouldWaiveStripePaymentOperationsFee,
} from "../src/lib/integrations";

const managedEnvKeys = [
  "STRIPE_PAYMENT_OPS_FEE_BPS",
  "STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS",
  "STRIPE_PAYMENT_OPS_FEE_MAX_CENTS",
  "STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS",
  "STRIPE_PAYMENT_OPS_FEE_WAIVED_BRAND_SLUGS",
  "STRIPE_PAYMENT_OPS_FEE_WAIVED_NAMES",
  "STRIPE_PARENT_SURCHARGE_BPS",
  "STRIPE_PARENT_SURCHARGE_FIXED_CENTS",
  "STRIPE_PARENT_SURCHARGE_MAX_CENTS",
  "STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED",
  "STRIPE_CARD_PROCESSING_RECOVERY_BPS",
  "STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS",
  "STRIPE_CARD_PROCESSING_RECOVERY_GROSS_UP",
  "STRIPE_CARD_PROCESSING_RECOVERY_MAX_CENTS",
  "STRIPE_ACH_PROCESSING_RECOVERY_BPS",
  "STRIPE_ACH_PROCESSING_RECOVERY_FIXED_CENTS",
  "STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS",
  "STRIPE_LINK_BANK_PROCESSING_RECOVERY_BPS",
  "STRIPE_LINK_BANK_PROCESSING_RECOVERY_FIXED_CENTS",
  "STRIPE_LINK_BANK_PROCESSING_RECOVERY_MAX_CENTS",
  "STRIPE_APPLICATION_FEE_BPS",
  "STRIPE_APPLICATION_FEE_FIXED_CENTS",
] as const;

const originalEnv = Object.fromEntries(managedEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of managedEnvKeys) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

test("tuition checkout defaults retain the school-paid 1.5 percent BEE Suite feature fee", () => {
  for (const key of managedEnvKeys) delete process.env[key];

  const amounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "ach" });

  assert.equal(amounts.invoiceAmountCents, 100_000);
  assert.equal(amounts.beeSuitePaymentOperationsFeeAmountCents, 1_500);
  assert.equal(amounts.parentProcessingRecoveryAmountCents, 0);
  assert.equal(amounts.checkoutTotalCents, 100_000);
  assert.equal(amounts.applicationFeeAmountCents, 1_500);
});

test("card checkout adds parent-paid card recovery in addition to the school-paid tuition feature fee", () => {
  for (const key of managedEnvKeys) delete process.env[key];
  process.env.STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED = "true";
  process.env.STRIPE_CARD_PROCESSING_RECOVERY_GROSS_UP = "false";

  const amounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "card" });

  assert.equal(amounts.invoiceAmountCents, 100_000);
  assert.equal(amounts.beeSuitePaymentOperationsFeeAmountCents, 1_500);
  assert.equal(amounts.parentProcessingRecoveryAmountCents, 2_930);
  assert.equal(amounts.checkoutTotalCents, 102_930);
  assert.equal(amounts.applicationFeeAmountCents, 4_430);
});

test("instant bank checkout ignores legacy link-bank recovery defaults", () => {
  for (const key of managedEnvKeys) delete process.env[key];
  process.env.STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED = "true";
  process.env.STRIPE_LINK_BANK_PROCESSING_RECOVERY_BPS = "390";
  process.env.STRIPE_LINK_BANK_PROCESSING_RECOVERY_FIXED_CENTS = "30";

  const amounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "link_bank" });

  assert.equal(amounts.invoiceAmountCents, 100_000);
  assert.equal(amounts.parentProcessingRecoveryAmountCents, 0);
  assert.equal(amounts.checkoutTotalCents, 100_000);
  assert.equal(amounts.applicationFeeAmountCents, 1_500);
});

test("ACH and instant bank ignore legacy ACH, link-bank, and default parent recovery settings", () => {
  for (const key of managedEnvKeys) delete process.env[key];
  process.env.STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED = "true";
  process.env.STRIPE_PARENT_SURCHARGE_BPS = "390";
  process.env.STRIPE_PARENT_SURCHARGE_FIXED_CENTS = "30";
  process.env.STRIPE_ACH_PROCESSING_RECOVERY_BPS = "80";
  process.env.STRIPE_ACH_PROCESSING_RECOVERY_FIXED_CENTS = "0";
  process.env.STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS = "500";
  process.env.STRIPE_LINK_BANK_PROCESSING_RECOVERY_BPS = "260";
  process.env.STRIPE_LINK_BANK_PROCESSING_RECOVERY_FIXED_CENTS = "30";

  const achAmounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "ach" });
  const instantBankAmounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "link_bank" });
  const defaultAmounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "default" });

  assert.equal(achAmounts.parentProcessingRecoveryAmountCents, 0);
  assert.equal(instantBankAmounts.parentProcessingRecoveryAmountCents, 0);
  assert.equal(defaultAmounts.parentProcessingRecoveryAmountCents, 3_930);
});

test("parent-paid processing recovery remains blocked until legal approval gate is enabled", () => {
  for (const key of managedEnvKeys) delete process.env[key];
  process.env.STRIPE_CARD_PROCESSING_RECOVERY_BPS = "290";
  process.env.STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS = "30";

  const amounts = getStripeCheckoutAmounts(100_000, { paymentMethodCategory: "card" });

  assert.equal(amounts.parentProcessingRecoveryAmountCents, 0);
  assert.equal(amounts.checkoutTotalCents, 100_000);
  assert.equal(amounts.applicationFeeAmountCents, 1_500);
});

test("Kid City is not waived unless a waiver env var explicitly includes it", () => {
  for (const key of managedEnvKeys) delete process.env[key];

  assert.equal(shouldWaiveStripePaymentOperationsFee({ tenantSlug: "kid-city-usa", tenantName: "Kid City USA" }), false);

  process.env.STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS = "kid-city-usa";
  assert.equal(shouldWaiveStripePaymentOperationsFee({ tenantSlug: "kid-city-usa", tenantName: "Kid City USA" }), true);
});
