import assert from "node:assert/strict";
import test from "node:test";
import { invoiceBelongsToFteWeek } from "../src/lib/fte-billing-period";

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
