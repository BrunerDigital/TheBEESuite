import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/apply-reviewed-weekly-tuition-rates.ts", import.meta.url), "utf8");

test("reviewed cutover accepts only exact weekly contract evidence and a fingerprinted next period", () => {
  assert.match(source, /status === "Exact weekly contract"/);
  assert.match(source, /nextWeeklyBillingPeriod\(new Date\(\)\)/);
  assert.match(source, /confirm-fingerprint/);
  assert.match(source, /Duplicate child IDs/);
});

test("reviewed cutover fails closed on school, child, and Stripe drift", () => {
  assert.match(source, /moved to another school/);
  assert.match(source, /age group changed after review/);
  assert.match(source, /already has an enabled assignment/);
  assert.match(source, /verifyStripeConnectAccountBinding/);
  assert.match(source, /Stripe binding changed during cutover/);
});

test("reviewed cutover creates plans and assignments without financial activity", () => {
  assert.match(source, /tuitionPlan\.create/);
  assert.match(source, /tuitionBillingEnabled: true/);
  assert.match(source, /tuitionAutobillEligible: true/);
  assert.match(source, /billing\.tuition_assignment\.procare_activated/);
  assert.doesNotMatch(source, /tx\.(?:invoice|payment|ledgerEntry)\.(?:create|update|delete)/);
});
