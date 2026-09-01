import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  achFailurePresentation,
  isAchPaymentProcessing,
  isReturnedStripePayment,
  provisionalAchCreditCents,
  returnedPaymentRetryAvailable,
  visibleBalanceAfterProvisionalAchCredit,
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

test("provisional ACH relief preserves existing family credits and clamps positive balances", () => {
  assert.equal(visibleBalanceAfterProvisionalAchCredit(-48_00, 0), -48_00);
  assert.equal(visibleBalanceAfterProvisionalAchCredit(-48_00, 20_00), -48_00);
  assert.equal(visibleBalanceAfterProvisionalAchCredit(2475_00, 2475_00), 0);
  assert.equal(visibleBalanceAfterProvisionalAchCredit(100_00, 150_00), 0);
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

test("an unsubmitted ACH checkout failure is not mislabeled as a bank return", () => {
  assert.deepEqual(achFailurePresentation({
    customFields: {
      requestedPaymentMethodCategory: "ach",
      status: "checkout_pending",
    },
    failureCode: "payment_method_unactivated",
  }), {
    returned: false,
    retryAvailable: false,
    failureCode: "payment_method_unactivated",
    customStatus: null,
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

test("a debit-not-authorized ACH dispute is presented as a returned payment", () => {
  assert.equal(isReturnedStripePayment({
    status: "PAID",
    provider: "stripe",
    customFields: {
      stripeDisputeLedgerActive: true,
      stripeDisputeReason: "debit_not_authorized",
    },
  }), true);
});

test("director payment attempts explain ACH settlement without claiming zero submissions", async () => {
  const source = await readFile("src/components/live-ops-pages.tsx", "utf8");
  assert.match(source, /Paid — processing/);
  assert.match(source, /ACH submitted once; bank settlement pending\./);
  assert.match(source, /No failed retries/);
  assert.match(source, /After settlement/);
});

test("parent paid-processing badges require Stripe-confirmed ACH processing", async () => {
  const source = await readFile("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(source, /function isConfirmedAchPendingPayment/);
  assert.match(source, /status\.endsWith\("_processing"\) && stripeStatus === "processing"/);
  assert.match(source, /isConfirmedAchPendingPayment\(invoice\.pendingPayment\)/);
  assert.match(source, /ACH submission is pending/);
});

test("director ACH settling count uses the complete draft payment scope", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  assert.match(source, /const \[paymentRows, processingAchRows,/);
  assert.match(source, /processingAchRows\.filter\(\(payment\) => isAchPaymentProcessing\(payment\)\)\.length/);
});

test("director payment totals separate returned funds from paid and failed", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  assert.match(source, /const returnedPayments = returnedPaymentRows\.filter\(\(payment\) => isReturnedStripePayment\(payment\)\)/);
  assert.match(source, /paid: Math\.max\(0, paid - returnedPaid\)/);
  assert.match(source, /failed: Math\.max\(0, failed - returnedFailed\)/);
  assert.match(source, /returned: returnedPayments\.length/);
});

test("parent provisional balance uses the complete active ACH set, not the recent-payment cap", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  assert.match(source, /const \[billingAccount, activeParentPaymentRows,/);
  assert.match(source, /provisionalAchCreditCents\(activeParentPaymentRows\)/);
  assert.match(source, /for \(const payment of activeParentPaymentRows\)/);
});
