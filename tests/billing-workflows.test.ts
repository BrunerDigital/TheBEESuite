import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agencyPaymentDescription,
  normalizeSubsidyVoucher,
  subsidyVoucherLedgerLines,
  billingDedupeKey,
  defaultRecurringBillingPeriod,
  isoWeekBillingPeriod,
  nextWeeklyBillingPeriod,
  normalizeAgencyPaymentMetadata,
  normalizeBillingDay,
  normalizeBillingCadence,
  normalizeBatchTarget,
  normalizeBillingPeriod,
  normalizeRecurringBillingDay,
  normalizeRecurringBillingPeriod,
  recurringDueDateForPeriod,
  parseCurrencyCents,
  shouldCreateRecurringTuitionInvoice,
  utcBillingWeekday,
  planFamilyRefundAllocations,
} from "../src/lib/billing-workflows";

test("family refunds prioritize optional payment references and span payments", () => {
  const result = planFamilyRefundAllocations([
    { id: "newer", refundableCents: 3000 },
    { id: "preferred", refundableCents: 5000 },
  ], 6500, ["preferred"]);
  assert.deepEqual(result.allocations.map((item) => ({ id: item.payment.id, amountCents: item.amountCents })), [
    { id: "preferred", amountCents: 5000 },
    { id: "newer", amountCents: 1500 },
  ]);
  assert.equal(result.remainingCents, 0);
  assert.equal(result.availableCents, 8000);
});

test("family refund allocation reports an amount beyond Stripe refund capacity", () => {
  const result = planFamilyRefundAllocations([{ id: "payment", refundableCents: 2500 }], 4000);
  assert.equal(result.allocations[0]?.amountCents, 2500);
  assert.equal(result.remainingCents, 1500);
});

test("billing workflow helpers parse family charge amounts", () => {
  assert.equal(parseCurrencyCents("1,250.50"), 125050);
  assert.equal(parseCurrencyCents("$99.99"), 9999);
  assert.equal(parseCurrencyCents(""), 0);
});

test("agency payment helpers normalize metadata and descriptions", () => {
  assert.deepEqual(normalizeAgencyPaymentMetadata({
    agencyName: " Early Learning Coalition ",
    authorizationNumber: " AUTH-123 ",
    externalReference: " EFT-9 ",
    coverageStart: "2026-06-01",
    coverageEnd: "invalid",
    notes: " Approved subsidy payment ",
  }), {
    agencyName: "Early Learning Coalition",
    authorizationNumber: "AUTH-123",
    externalReference: "EFT-9",
    coverageStart: "2026-06-01",
    coverageEnd: "",
    notes: "Approved subsidy payment",
  });
  assert.equal(
    agencyPaymentDescription({
      agencyName: "Early Learning Coalition",
      childName: "Ava Bee",
      coverageStart: "2026-06-01",
      coverageEnd: "2026-06-30",
    }),
    "Early Learning Coalition - Ava Bee (2026-06-01 to 2026-06-30)",
  );
});

test("billing workflow helpers normalize billing periods and batch targets", () => {
  assert.equal(normalizeBillingPeriod("2026-06", new Date("2026-07-15T12:00:00.000Z")), "2026-06");
  assert.equal(normalizeBillingPeriod("June", new Date("2026-07-15T12:00:00.000Z")), "2026-07");
  assert.equal(normalizeBatchTarget("family"), "family");
  assert.equal(normalizeBatchTarget("anything else"), "child");
  assert.equal(normalizeBillingDay("0"), 1);
  assert.equal(normalizeBillingDay("31"), 28);
  assert.equal(normalizeBillingDay("15"), 15);
});

test("billing workflow helpers normalize weekly recurring periods and weekdays", () => {
  assert.equal(normalizeBillingCadence("Weekly"), "weekly");
  assert.equal(normalizeBillingCadence("monthly"), "monthly");
  assert.equal(isoWeekBillingPeriod(new Date("2026-06-04T12:00:00.000Z")), "2026-W23");
  assert.equal(normalizeRecurringBillingPeriod("2026-W7", new Date("2026-06-04T12:00:00.000Z"), "weekly"), "2026-W07");
  assert.equal(normalizeRecurringBillingPeriod("2026-06", new Date("2026-07-15T12:00:00.000Z"), "weekly"), "2026-W23");
  assert.equal(normalizeRecurringBillingPeriod("2026-06", new Date("2026-07-15T12:00:00.000Z"), "monthly"), "2026-06");
  assert.equal(nextWeeklyBillingPeriod(new Date("2026-06-19T12:00:00.000Z")), "2026-W26");
  assert.equal(defaultRecurringBillingPeriod(null, new Date("2026-06-19T12:00:00.000Z"), "weekly"), "2026-W26");
  assert.equal(defaultRecurringBillingPeriod("2026-W30", new Date("2026-06-19T12:00:00.000Z"), "weekly"), "2026-W30");
  assert.equal(normalizeRecurringBillingDay("", "weekly"), 5);
  assert.equal(normalizeRecurringBillingDay("9", "weekly"), 7);
  assert.equal(normalizeRecurringBillingDay("31", "monthly"), 28);
  assert.equal(utcBillingWeekday(new Date("2026-06-04T12:00:00.000Z")), 4);
  assert.equal(recurringDueDateForPeriod("2026-W26", 1, "weekly").toISOString(), "2026-06-22T12:00:00.000Z");
  assert.equal(recurringDueDateForPeriod("2026-W26", 5, "weekly").toISOString(), "2026-06-26T12:00:00.000Z");
  assert.equal(recurringDueDateForPeriod("2026-06", 15, "monthly").toISOString(), "2026-06-15T12:00:00.000Z");
});

test("billing dedupe keys are stable across child ordering", () => {
  const left = billingDedupeKey({
    familyId: "family_1",
    chargeSource: "tuitionPlan",
    sourceId: "plan_1",
    billingPeriod: "2026-06",
    batchTarget: "child",
    childIds: ["child_b", "child_a"],
  });
  const right = billingDedupeKey({
    familyId: "family_1",
    chargeSource: "tuitionPlan",
    sourceId: "plan_1",
    billingPeriod: "2026-06",
    batchTarget: "child",
    childIds: ["child_a", "child_b"],
  });

  assert.equal(left, right);
});

test("recurring tuition eligibility waits for start period and billing day", () => {
  assert.equal(shouldCreateRecurringTuitionInvoice({
    enabled: true,
    planId: "plan_1",
    amountCents: 100000,
    startsPeriod: "2026-07",
    billingPeriod: "2026-06",
    billingDay: 1,
    currentDay: 15,
  }), false);

  assert.equal(shouldCreateRecurringTuitionInvoice({
    enabled: true,
    planId: "plan_1",
    amountCents: 100000,
    startsPeriod: "2026-06",
    billingPeriod: "2026-06",
    billingDay: 20,
    currentDay: 15,
  }), false);

  assert.equal(shouldCreateRecurringTuitionInvoice({
    enabled: true,
    planId: "plan_1",
    amountCents: 100000,
    startsPeriod: "2026-06",
    billingPeriod: "2026-06",
    billingDay: 15,
    currentDay: 15,
  }), true);

  assert.equal(shouldCreateRecurringTuitionInvoice({
    enabled: true,
    planId: null,
    amountCents: 100000,
    startsPeriod: "2026-06",
    billingPeriod: "2026-06",
    billingDay: 1,
    currentDay: 15,
  }), false);
});


test("subsidy voucher helper separates agency credit from family copay", () => {
  const voucher = normalizeSubsidyVoucher({
    agencyName: " Early Learning Coalition ",
    authorizationNumber: " AUTH-9 ",
    voucherAmountDollars: "$180.00",
    copayAmountDollars: "25",
    coverageStart: "2026-06-01",
    coverageEnd: "2026-06-07",
    childName: "Avery Bee",
  });

  assert.equal(voucher.subsidyReady, true);
  assert.equal(voucher.voucherAmountCents, 18000);
  assert.equal(voucher.copayAmountCents, 2500);
  assert.deepEqual(subsidyVoucherLedgerLines(voucher), [
    { type: "agency_voucher_credit", amountCents: 18000, description: "Early Learning Coalition - Avery Bee (2026-06-01 to 2026-06-07)" },
    { type: "family_copay_due", amountCents: 2500, description: "Family copay due - Avery Bee" },
  ]);
});
