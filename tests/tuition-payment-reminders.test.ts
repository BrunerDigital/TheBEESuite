import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS,
  isTuitionInvoiceLike,
  normalizeTuitionPaymentReminderSettings,
  tuitionPaymentReminderCopy,
  tuitionPaymentReminderDecision,
  tuitionPaymentReminderDedupeKey,
  tuitionPaymentReminderSettingsFromCustomFields,
} from "../src/lib/tuition-payment-reminders";

test("tuition payment reminder settings default to bill-ready plus past-due cadence", () => {
  const settings = normalizeTuitionPaymentReminderSettings(null);

  assert.deepEqual(settings, DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS);
  assert.equal(settings.invoiceReadyEnabled, true);
  assert.equal(settings.pastDueFirstDaysAfter, 3);
  assert.equal(settings.pastDueRepeatEveryDays, 2);
  assert.equal(settings.pastDueMaxDaysAfter, 30);
});

test("tuition payment reminders do not send before an invoice is created", () => {
  const dueDate = new Date("2026-06-22T12:00:00.000Z");
  const invoiceCreatedAt = new Date("2026-06-19T23:00:00.000Z");

  assert.equal(
    tuitionPaymentReminderDecision({
      dueDate,
      invoiceCreatedAt,
      now: new Date("2026-06-18T12:00:00.000Z"),
    }),
    null,
  );
});

test("tuition payment reminders send invoice-ready notices on billing day for non-autopay families", () => {
  const decision = tuitionPaymentReminderDecision({
    dueDate: new Date("2026-06-22T12:00:00.000Z"),
    invoiceCreatedAt: new Date("2026-06-19T23:00:00.000Z"),
    now: new Date("2026-06-19T23:15:00.000Z"),
  });

  assert.equal(decision?.phase, "ready_to_pay");
  assert.equal(decision?.bucket, "ready-2026-06-19");
});

test("tuition payment reminders skip invoice-ready notices for active autopay", () => {
  const decision = tuitionPaymentReminderDecision({
    dueDate: new Date("2026-06-22T12:00:00.000Z"),
    invoiceCreatedAt: new Date("2026-06-19T23:00:00.000Z"),
    hasActiveAutopay: true,
    now: new Date("2026-06-19T23:15:00.000Z"),
  });

  assert.equal(decision, null);
});

test("past-due drop-off reminders start on the next drop-off cadence and repeat", () => {
  const dueDate = new Date("2026-06-19T12:00:00.000Z");
  const invoiceCreatedAt = new Date("2026-06-19T23:00:00.000Z");

  assert.equal(
    tuitionPaymentReminderDecision({
      dueDate,
      invoiceCreatedAt,
      now: new Date("2026-06-21T12:00:00.000Z"),
    }),
    null,
  );
  assert.equal(
    tuitionPaymentReminderDecision({
      dueDate,
      invoiceCreatedAt,
      now: new Date("2026-06-22T12:00:00.000Z"),
    })?.phase,
    "past_due_dropoff",
  );
  assert.equal(
    tuitionPaymentReminderDecision({
      dueDate,
      invoiceCreatedAt,
      now: new Date("2026-06-23T12:00:00.000Z"),
    }),
    null,
  );
  assert.equal(
    tuitionPaymentReminderDecision({
      dueDate,
      invoiceCreatedAt,
      now: new Date("2026-06-24T12:00:00.000Z"),
    })?.phase,
    "past_due_dropoff",
  );
});

test("tuition payment reminder copy uses ready-to-view/pay and drop-off language", () => {
  const ready = tuitionPaymentReminderCopy({
    phase: "ready_to_pay",
    familyName: "Anderson Family",
    centerName: "FL | Sarasota",
    invoiceNumber: "INV-100",
    dueDate: new Date("2026-06-22T12:00:00.000Z"),
    amountCents: 25000,
  });
  const pastDue = tuitionPaymentReminderCopy({
    phase: "past_due_dropoff",
    familyName: "Anderson Family",
    centerName: "FL | Sarasota",
    invoiceNumber: "INV-100",
    dueDate: new Date("2026-06-19T12:00:00.000Z"),
    amountCents: 25000,
    balanceCents: 37500,
  });

  assert.equal(ready.title, "Tuition ready to view/pay: $250.00");
  assert.match(ready.body, /ready to view and pay in the parent portal/);
  assert.equal(pastDue.title, "Past due tuition balance: $375.00");
  assert.match(pastDue.body, /before or at your next drop-off/);
});

test("tuition invoice detection uses recurring tuition metadata and tuition item fallback", () => {
  assert.equal(isTuitionInvoiceLike({ customFields: { chargeSource: "tuitionPlan" } }), true);
  assert.equal(isTuitionInvoiceLike({ customFields: { mode: "recurring" } }), true);
  assert.equal(isTuitionInvoiceLike({ customFields: {}, items: [{ description: "Weekly tuition - Avery" }] }), true);
  assert.equal(isTuitionInvoiceLike({ customFields: { checkoutPurpose: "registration_fee" }, items: [{ description: "Registration fee" }] }), false);
});

test("tuition reminder settings read from center custom fields and dedupe by invoice, bucket, and user", () => {
  const settings = tuitionPaymentReminderSettingsFromCustomFields({
    tuitionPaymentReminderSettings: {
      invoiceReadyEnabled: false,
      pastDueRepeatEveryDays: 7,
    },
  });
  const first = tuitionPaymentReminderDedupeKey({
    invoiceId: "invoice_1",
    phase: "ready_to_pay",
    bucket: "ready-2026-06-19",
    userId: "user_1",
  });
  const second = tuitionPaymentReminderDedupeKey({
    invoiceId: "invoice_1",
    phase: "ready_to_pay",
    bucket: "ready-2026-06-19",
    userId: "user_2",
  });

  assert.equal(settings.invoiceReadyEnabled, false);
  assert.equal(settings.pastDueRepeatEveryDays, 7);
  assert.notEqual(first, second);
});
