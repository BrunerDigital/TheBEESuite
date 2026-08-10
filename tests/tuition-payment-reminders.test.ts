import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BEE_SUITE_PARENT_PORTAL_URL,
  DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS,
  isCurrentFamilyBalanceReminderEligible,
  normalizeTuitionPaymentReminderSettings,
  tuitionPaymentReminderCopy,
  tuitionPaymentReminderDecision,
  tuitionPaymentReminderDedupeKey,
  tuitionPaymentReminderSettingsFromCustomFields,
} from "../src/lib/tuition-payment-reminders";

test("tuition balance reminders default to a weekly current-family cadence", () => {
  const settings = normalizeTuitionPaymentReminderSettings(null);

  assert.deepEqual(settings, DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS);
  assert.equal(settings.enabled, true);
  assert.equal(settings.repeatEveryDays, 7);
});

test("legacy invoice cadence resets to the friendly weekly family-level cadence", () => {
  assert.deepEqual(normalizeTuitionPaymentReminderSettings({
    enabled: true,
    invoiceReadyEnabled: true,
    pastDueEnabled: true,
    pastDueRepeatEveryDays: 5,
  }), {
    enabled: true,
    repeatEveryDays: 7,
  });
});

test("tuition balance reminders use one stable cadence bucket", () => {
  const first = tuitionPaymentReminderDecision({ now: new Date("2026-08-10T12:00:00.000Z") });
  const sameWindow = tuitionPaymentReminderDecision({ now: new Date("2026-08-16T23:59:59.000Z") });
  const nextWindow = tuitionPaymentReminderDecision({ now: new Date("2026-08-17T00:00:00.000Z") });

  assert.equal(first?.phase, "balance_available");
  assert.equal(first?.bucket, sameWindow?.bucket);
  assert.notEqual(first?.bucket, nextWindow?.bucket);
});

test("tuition balance reminders stop for autopay and pending payments", () => {
  assert.equal(tuitionPaymentReminderDecision({ hasActiveAutopay: true }), null);
  assert.equal(tuitionPaymentReminderDecision({ hasPendingPayment: true }), null);
  assert.equal(tuitionPaymentReminderDecision({ settings: { enabled: false, repeatEveryDays: 7 } }), null);
});

test("eligibility requires a current classroom child and a payable reviewed balance", () => {
  const ready = {
    balanceCents: 25_000,
    parentVisibleBalanceCents: 25_000,
    responsibilityReviewRequired: false,
    checkoutReady: true,
    billingApproved: true,
  };

  assert.equal(isCurrentFamilyBalanceReminderEligible({
    ...ready,
    children: [{ enrollmentStatus: "active", classroomId: "classroom_1" }],
  }), true);
  assert.equal(isCurrentFamilyBalanceReminderEligible({
    ...ready,
    children: [{ enrollmentStatus: "withdrawn", classroomId: "classroom_1" }],
  }), false);
  assert.equal(isCurrentFamilyBalanceReminderEligible({
    ...ready,
    children: [{ enrollmentStatus: "active", classroomId: null }],
  }), false);
  assert.equal(isCurrentFamilyBalanceReminderEligible({
    ...ready,
    parentVisibleBalanceCents: 0,
    children: [{ enrollmentStatus: "active", classroomId: "classroom_1" }],
  }), false);
  assert.equal(isCurrentFamilyBalanceReminderEligible({
    ...ready,
    responsibilityReviewRequired: true,
    children: [{ enrollmentStatus: "active", classroomId: "classroom_1" }],
  }), false);
});

test("friendly reminder copy uses only the canonical secure parent portal", () => {
  const reminder = tuitionPaymentReminderCopy({
    familyName: "Anderson Family",
    centerName: "FL | Sarasota",
    balanceCents: 37_500,
  });

  assert.equal(reminder.title, "Friendly reminder: your tuition balance is available");
  assert.match(reminder.body, /current tuition balance of \$375\.00/);
  assert.match(reminder.body, /iPhone or iPad/);
  assert.match(reminder.body, /Android/);
  assert.match(reminder.body, /Computer/);
  assert.equal(BEE_SUITE_PARENT_PORTAL_URL, "https://thebeesuite.io/parents");
  assert.doesNotMatch(reminder.body, /http:\/\//);
});

test("settings remain school-scoped and dedupe remains account, cadence, and user scoped", () => {
  const settings = tuitionPaymentReminderSettingsFromCustomFields({
    tuitionPaymentReminderSettings: { enabled: true, repeatEveryDays: 14 },
  });
  const first = tuitionPaymentReminderDedupeKey({
    billingAccountId: "account_1",
    phase: "balance_available",
    bucket: "balance-14d-1",
    userId: "user_1",
  });
  const second = tuitionPaymentReminderDedupeKey({
    billingAccountId: "account_1",
    phase: "balance_available",
    bucket: "balance-14d-1",
    userId: "user_2",
  });

  assert.equal(settings.repeatEveryDays, 14);
  assert.notEqual(first, second);
});
