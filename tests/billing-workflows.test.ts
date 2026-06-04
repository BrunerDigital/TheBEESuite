import assert from "node:assert/strict";
import { test } from "node:test";
import {
  billingDedupeKey,
  normalizeBatchTarget,
  normalizeBillingPeriod,
  parseCurrencyCents,
} from "../src/lib/billing-workflows";

test("billing workflow helpers parse family charge amounts", () => {
  assert.equal(parseCurrencyCents("1,250.50"), 125050);
  assert.equal(parseCurrencyCents("$99.99"), 9999);
  assert.equal(parseCurrencyCents(""), 0);
});

test("billing workflow helpers normalize billing periods and batch targets", () => {
  assert.equal(normalizeBillingPeriod("2026-06", new Date("2026-07-15T12:00:00.000Z")), "2026-06");
  assert.equal(normalizeBillingPeriod("June", new Date("2026-07-15T12:00:00.000Z")), "2026-07");
  assert.equal(normalizeBatchTarget("family"), "family");
  assert.equal(normalizeBatchTarget("anything else"), "child");
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
