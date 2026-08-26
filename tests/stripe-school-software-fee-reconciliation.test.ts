import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/reconcile-stripe-school-software-fees.ts", "utf8");

test("school software fee reconciliation is fail closed and preview only", () => {
  assert.match(source, /mode: "read_only_preview"/);
  assert.match(source, /This audit is preview-only/);
  assert.match(source, /school_authorizes_ach_or_card/);
  assert.match(source, /stop_missing_customer_for_saved_payment_method/);
  assert.match(source, /stop_subscription_configuration_mismatch/);
  assert.match(source, /review_pre_september_software_charge/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
  assert.doesNotMatch(source, /prisma\.[a-zA-Z]+\.(?:create|update|upsert|delete)/);
});

test("school software fees preserve policy and deterministic monthly evidence", () => {
  assert.match(source, /getSchoolSoftwareFeePolicyForCenter/);
  assert.match(source, /getSchoolSoftwareBillingStartAt/);
  assert.match(source, /isSchoolSoftwareBillingCenter/);
  assert.match(source, /firstPaidBillingAt/);
  assert.match(source, /paymentScope\) === "school_software_fee"/);
  assert.match(source, /school_software_fee_catchup/);
  assert.match(source, /beforeApprovedStart/);
  assert.match(source, /effectiveMonthlyAmountCents === policy\.unitAmountCents/);
  assert.match(source, /exactMonthlyConfiguration/);
  assert.match(source, /clean\(record\(active\[0\]\.metadata\)\.centerId\) === center\.id/);
  assert.match(source, /subscriptionUse/);
  assert.match(source, /awaitingSchoolAuthorization/);
  assert.match(source, /preStartChargesRequiringReview/);
});
