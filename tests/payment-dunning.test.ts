import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentStatus } from "@prisma/client";
import {
  PAYMENT_DUNNING_MAX_ATTEMPTS,
  nextPaymentDunningAt,
  paymentDunningCopy,
  paymentDunningDedupeKey,
  paymentDunningSummary,
} from "../src/lib/payment-dunning";

test("payment dunning is ready immediately for a new failed payment", () => {
  const summary = paymentDunningSummary({
    paymentStatus: PaymentStatus.FAILED,
    customFields: { stripeFailureMessage: "Your card was declined." },
    failedAt: new Date("2026-06-04T12:00:00.000Z"),
    relatedInvoiceStatus: PaymentStatus.OPEN,
    now: new Date("2026-06-04T13:00:00.000Z"),
  });

  assert.equal(summary.status, "ready");
  assert.equal(summary.attemptCount, 0);
  assert.equal(summary.nextAttemptAt?.toISOString(), "2026-06-04T12:00:00.000Z");
  assert.equal(summary.failureMessage, "Your card was declined.");
});

test("payment dunning waits until the next scheduled retry date", () => {
  const summary = paymentDunningSummary({
    paymentStatus: PaymentStatus.FAILED,
    customFields: {
      dunningAttemptCount: 1,
      dunningLastAttemptAt: "2026-06-04T15:00:00.000Z",
      dunningNextAttemptAt: "2026-06-06T15:00:00.000Z",
    },
    relatedInvoiceStatus: PaymentStatus.OPEN,
    now: new Date("2026-06-05T15:00:00.000Z"),
  });

  assert.equal(summary.status, "waiting");
  assert.equal(summary.attemptCount, 1);
  assert.equal(summary.nextAttemptAt?.toISOString(), "2026-06-06T15:00:00.000Z");
});

test("payment dunning stops when the invoice is paid or retry attempts are maxed", () => {
  const paid = paymentDunningSummary({
    paymentStatus: PaymentStatus.FAILED,
    customFields: { dunningAttemptCount: 1 },
    relatedInvoiceStatus: PaymentStatus.PAID,
    now: new Date("2026-06-04T15:00:00.000Z"),
  });
  const maxed = paymentDunningSummary({
    paymentStatus: PaymentStatus.FAILED,
    customFields: { dunningAttemptCount: PAYMENT_DUNNING_MAX_ATTEMPTS },
    relatedInvoiceStatus: PaymentStatus.OPEN,
    now: new Date("2026-06-04T15:00:00.000Z"),
  });

  assert.equal(paid.status, "not_needed");
  assert.equal(maxed.status, "maxed");
  assert.equal(maxed.nextAttemptAt, null);
});

test("payment dunning next dates follow the retry cadence", () => {
  const failedAt = new Date("2026-06-04T15:00:00.000Z");

  assert.equal(nextPaymentDunningAt(failedAt, 0)?.toISOString(), "2026-06-04T15:00:00.000Z");
  assert.equal(nextPaymentDunningAt(failedAt, 1)?.toISOString(), "2026-06-06T15:00:00.000Z");
  assert.equal(nextPaymentDunningAt(failedAt, 2)?.toISOString(), "2026-06-09T15:00:00.000Z");
  assert.equal(nextPaymentDunningAt(failedAt, 3)?.toISOString(), "2026-06-14T15:00:00.000Z");
  assert.equal(nextPaymentDunningAt(failedAt, 4), null);
});

test("payment dunning copy and dedupe keys are scoped per payment attempt and recipient", () => {
  const copy = paymentDunningCopy({
    familyName: "Anderson Family",
    centerLabel: "FL | Sarasota",
    invoiceNumber: "INV-100",
    amountCents: 12550,
    attemptNumber: 2,
    nextAttemptAt: new Date("2026-06-09T15:00:00.000Z"),
    failureMessage: "Insufficient funds.",
  });
  const first = paymentDunningDedupeKey({
    paymentId: "pay_1",
    attemptNumber: 2,
    recipient: "staff",
    userId: "user_1",
  });
  const differentAttempt = paymentDunningDedupeKey({
    paymentId: "pay_1",
    attemptNumber: 3,
    recipient: "staff",
    userId: "user_1",
  });

  assert.equal(copy.guardianSubject, "Payment retry needed for invoice INV-100 (attempt 2)");
  assert.match(copy.staffBody, /Anderson Family at FL \| Sarasota has a failed \$125\.50 payment/);
  assert.match(copy.guardianBody, /Please retry the payment from your parent account/);
  assert.notEqual(first, differentAttempt);
});
