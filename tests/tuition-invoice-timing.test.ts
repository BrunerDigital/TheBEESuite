import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTuitionInvoiceDelayWeeks, tuitionInvoiceBillingPeriod, weeklyTuitionChargeDateForPeriod } from "../src/lib/billing-workflows";

test("only an explicit reviewed biweekly delay changes invoice timing", () => {
  assert.equal(normalizeTuitionInvoiceDelayWeeks(1, "biweekly"), 1);
  for (const value of [undefined, null, "1", -1, 2, NaN, Infinity, true]) {
    assert.equal(normalizeTuitionInvoiceDelayWeeks(value, "biweekly"), 0);
  }
  for (const cadence of ["weekly", "four_week", "monthly"]) {
    assert.equal(normalizeTuitionInvoiceDelayWeeks(1, cadence), 0);
    assert.equal(tuitionInvoiceBillingPeriod(null, new Date("2026-10-15T12:00:00Z"), cadence, 1), tuitionInvoiceBillingPeriod(null, new Date("2026-10-15T12:00:00Z"), cadence));
  }
});

test("delayed dates retain consecutive biweekly coverage across year boundaries", () => {
  for (const period of ["2026-W42", "2026-W44", "2026-W53", "2027-W02"]) {
    const standard = weeklyTuitionChargeDateForPeriod(period);
    const delayed = weeklyTuitionChargeDateForPeriod(period, 1);
    assert.equal(delayed.getTime() - standard.getTime(), 7 * 86400000);
    assert.equal(tuitionInvoiceBillingPeriod(null, delayed, "biweekly", 1), period);
    assert.equal(tuitionInvoiceBillingPeriod(period, standard, "biweekly", 1), period, "an explicit recovery coverage period is not shifted");
  }
});
