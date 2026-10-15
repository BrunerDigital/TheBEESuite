import assert from "node:assert/strict";
import test from "node:test";
import { addWeeksToBillingPeriod, normalizeTuitionInvoiceDelayWeeks, tuitionInvoiceBillingPeriod, weeklyTuitionChargeDateForPeriod } from "../src/lib/billing-workflows";
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

test("delay removal retains historical gaps after the delayed invoice week expires", () => {
  for (const date of ["2026-10-08", "2026-10-09", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15", "2026-10-18", "2026-10-19", "2026-10-22", "2026-10-26", "2026-10-29", "2026-11-02", "2026-11-05"]) {
    assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date(`${date}T12:00:00Z`), ["2026-W40"]), "2026-W42");
  }
  for (const date of ["2026-10-05", "2026-10-07"]) {
    assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date(`${date}T12:00:00Z`), ["2026-W40"]), null);
  }
});

test("delay removal coverage review respects future anchors and ISO year boundaries", () => {
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2027-W02", new Date("2026-10-13T12:00:00Z")), null);
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2026-12-29T12:00:00Z")), "2026-W53");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2027-01-03T12:00:00Z")), "2026-W53");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2027-01-04T12:00:00Z")), "2026-W53");
});


test("delay removal requires every due anchored cycle and advances only after coverage", () => {
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date("2026-10-19T12:00:00Z"), ["2026-W40", "2026-W42"]), null);
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date("2026-10-22T12:00:00Z"), ["2026-W40", "2026-W42"]), "2026-W44");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date("2026-11-05T12:00:00Z"), ["2026-W40", "2026-W44"]), "2026-W42");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W40", new Date("2026-11-05T12:00:00Z"), ["2026-W42", "2026-W44"]), "2026-W40");
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2026-W53", new Date("2027-01-07T12:00:00Z"), ["2026-W53"]), "2027-W02");
});

test("ancient anchors and duplicate or limited coverage remain bounded and fail closed", () => {
  const covered = Array.from({ length: 200 }, (_, index) => addWeeksToBillingPeriod("2000-W01", index * 2));
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2000-W01", new Date("2026-10-19T12:00:00Z"), covered), addWeeksToBillingPeriod("2000-W01", 400));
  assert.equal(biweeklyCoveragePeriodBeforeRemovingDelay("2000-W01", new Date("2026-10-19T12:00:00Z"), Array(200).fill("2000-W01")), "2000-W03");
});
