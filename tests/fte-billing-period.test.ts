import assert from "node:assert/strict";
import test from "node:test";
import { invoiceBelongsToFteWeek, invoiceFteWeekWeight } from "../src/lib/fte-billing-period";

const currentWeek = new Date("2026-08-17T00:00:00.000Z");

test("includes weekly tuition in the week it covers even when generated earlier", () => {
  assert.equal(invoiceBelongsToFteWeek({
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    customFields: { billingPeriod: "2026-W34" },
  }, currentWeek), true);
});

test("excludes a prior covered week even when the invoice was created this week", () => {
  assert.equal(invoiceBelongsToFteWeek({
    createdAt: new Date("2026-08-17T12:00:00.000Z"),
    customFields: { billingPeriod: "2026-W33" },
  }, currentWeek), false);
});

test("coverage start period takes precedence for multi-week tuition", () => {
  assert.equal(invoiceBelongsToFteWeek({
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    customFields: { coverageStartsPeriod: "2026-W34", billingPeriod: "2026-W33" },
  }, currentWeek), true);
});

test("manual invoices without a weekly period fall back to creation week", () => {
  assert.equal(invoiceBelongsToFteWeek({
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
    customFields: { billingPeriod: "2026-08" },
  }, currentWeek), true);
  assert.equal(invoiceBelongsToFteWeek({
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    customFields: null,
  }, currentWeek), false);
});


test("monthly tuition is divided by four even when billed earlier in the month", () => {
  const invoice = { createdAt: new Date("2026-09-01T13:15:00Z"), customFields: {
    billingCadence: "monthly", billingPeriod: "2026-09", coverageStartsPeriod: "2026-09",
  } };
  assert.equal(invoiceFteWeekWeight(invoice, new Date("2026-09-14T00:00:00Z")), 0.25);
  assert.equal(Math.round(3023850 * invoiceFteWeekWeight(invoice, new Date("2026-09-14T00:00:00Z"))) / 100, 7559.63);
  assert.equal(invoiceFteWeekWeight(invoice, new Date("2026-08-31T00:00:00Z")), 0);
  assert.equal(invoiceFteWeekWeight(invoice, new Date("2026-10-05T00:00:00Z")), 0);
});

test("monthly coverage takes precedence over billing and creation dates", () => {
  assert.equal(invoiceFteWeekWeight({ createdAt: new Date("2026-09-14T00:00:00Z"), customFields: {
    tuitionPlanCadence: "monthly", coverageStartsPeriod: "2026-08", billingPeriod: "2026-09",
  } }, new Date("2026-09-14T00:00:00Z")), 0);
});

test("weekly and manual invoices retain their existing reporting basis", () => {
  assert.equal(invoiceFteWeekWeight({ createdAt: new Date("2026-08-13T12:00:00Z"),
    customFields: { billingPeriod: "2026-W34" } }, currentWeek), 1);
  assert.equal(invoiceFteWeekWeight({ createdAt: new Date("2026-08-18T12:00:00Z"),
    customFields: { billingPeriod: "2026-08" } }, currentWeek), 1);
});
