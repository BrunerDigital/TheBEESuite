import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  achFailurePresentation,
  isAchPaymentProcessing,
  isReturnedStripePayment,
  provisionalAchCreditCents,
  returnedPaymentRetryAvailable,
} from "../src/lib/ach-payment-lifecycle";

test("submitted ACH payments provisionally credit the visible family balance", () => {
  const payment = {
    amountCents: 48_00,
    status: "DRAFT",
    provider: "stripe",
    customFields: {
      paymentMethodCategory: "ach",
      stripePaymentIntentStatus: "processing",
      status: "paid_processing",
    },
  };
  assert.equal(isAchPaymentProcessing(payment), true);
  assert.equal(provisionalAchCreditCents([payment]), 48_00);
  assert.equal(provisionalAchCreditCents([payment, { ...payment, status: "PAID" }]), 48_00);
});

test("an abandoned ACH checkout is not provisionally credited", () => {
  assert.equal(isAchPaymentProcessing({
    amountCents: 48_00,
    status: "DRAFT",
    provider: "stripe",
    customFields: { requestedPaymentMethodCategory: "ach", status: "checkout_created" },
  }), false);
});

test("an insufficient-funds ACH result becomes returned and retryable", () => {
  assert.deepEqual(achFailurePresentation({
    customFields: {
      paymentMethodCategory: "ach",
      stripePaymentIntentStatus: "processing",
      status: "paid_processing",
    },
    failureCode: "insufficient_funds",
  }), {
    returned: true,
    retryAvailable: true,
    failureCode: "insufficient_funds",
    customStatus: "payment_returned",
  });
});

test("returned ACH attempts remain visible without being treated as paid", () => {
  const payment = {
    status: "FAILED",
    provider: "stripe",
    customFields: {
      status: "payment_returned",
      stripeFailureCode: "insufficient_funds",
      retryAvailable: true,
    },
  };
  assert.equal(isReturnedStripePayment(payment), true);
  assert.equal(returnedPaymentRetryAvailable(payment), true);
});

test("director payment attempts explain ACH settlement without claiming zero submissions", async () => {
  const source = await readFile("src/components/live-ops-pages.tsx", "utf8");
  assert.match(source, /Paid — processing/);
  assert.match(source, /ACH submitted once; bank settlement pending\./);
  assert.match(source, /No failed retries/);
  assert.match(source, /After settlement/);
});
