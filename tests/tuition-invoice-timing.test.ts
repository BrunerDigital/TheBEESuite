import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTuitionInvoiceDelayWeeks, tuitionInvoiceBillingPeriod, weeklyTuitionChargeDateForPeriod } from "../src/lib/billing-workflows";
import { biweeklyCoveragePeriodBeforeRemovingDelay, nextBiweeklyInvoiceDate, resolveTuitionInvoiceDelay } from "../src/lib/tuition-invoice-timing";

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

test("director timing edits preserve omitted legacy delays and reject unsupported choices", () => {
  const existing = { cadence: "biweekly", previousCadence: "biweekly", previousDelay: 1 };
  assert.deepEqual(resolveTuitionInvoiceDelay({ ...existing, requested: undefined }), { ok: true, delayWeeks: 1 });
  assert.deepEqual(resolveTuitionInvoiceDelay({ ...existing, requested: 0 }), { ok: true, delayWeeks: 0 });
  for (const requested of ["1", 2, -1, null, true]) assert.equal(resolveTuitionInvoiceDelay({ ...existing, requested }).ok, false);
  for (const cadence of ["weekly", "four_week", "monthly"]) assert.equal(resolveTuitionInvoiceDelay({ ...existing, cadence, requested: 1 }).ok, false);
});

test("Omar's prepaid-week preview retains the W40 anchor and alternating invoice dates", () => {
  assert.equal(nextBiweeklyInvoiceDate("2026-W40", 0, new Date("2026-10-13T12:00:00Z"))?.toISOString(), "2026-10-22T12:00:00.000Z");
  assert.equal(nextBiweeklyInvoiceDate("2026-W40", 1, new Date("2026-10-13T12:00:00Z"))?.toISOString(), "2026-10-15T12:00:00.000Z");
  assert.equal(nextBiweeklyInvoiceDate("2026-W40", 1, new Date("2026-10-16T12:00:00Z"))?.toISOString(), "2026-10-29T12:00:00.000Z");
  assert.equal(nextBiweeklyInvoiceDate("2027-W02", 1, new Date("2026-10-13T12:00:00Z"))?.toISOString(), "2027-01-14T12:00:00.000Z");
  assert.equal(nextBiweeklyInvoiceDate("2026-W", 1, new Date("2026-10-13T12:00:00Z")), null);
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

test("delay removal reviews coverage from the standard invoice day through the delayed invoice week", () => {
  for (const date of ["2026-10-08", "2026-10-09", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15", "2026-10-18"]) {
    assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date(`${date}T12:00:00Z`)), "2026-W42");
  }
  for (const date of ["2026-10-05", "2026-10-07", "2026-10-19"]) {
    assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date(`${date}T12:00:00Z`)), null);
  }
});

test("delay removal coverage review respects future anchors and ISO year boundaries", () => {
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2027-W02", new Date("2026-10-13T12:00:00Z")), null);
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2026-12-29T12:00:00Z")), "2026-W53");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2027-01-03T12:00:00Z")), "2026-W53");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2027-01-04T12:00:00Z")), null);
});
