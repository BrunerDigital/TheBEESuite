import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/reconcile-stripe-school-software-fees.ts", "utf8");

test("school software fee reconciliation is fail closed and preview only", () => {
  assert.match(source, /mode: "read_only_preview"/);
  assert.match(source, /This reconciliation build is preview-only/);
  assert.match(source, /stop_missing_connected_account/);
  assert.match(source, /stop_account_mapped_to_multiple_centers/);
  assert.match(source, /stop_account_not_ready/);
  assert.match(source, /stop_subscription_configuration_mismatch/);
  assert.match(source, /stop_stripe_read_failed/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
  assert.doesNotMatch(source, /prisma\.[a-zA-Z]+\.(?:create|update|upsert|delete)/);
});

test("school software fees preserve policy and deterministic monthly evidence", () => {
  assert.match(source, /getSchoolSoftwareFeePolicyForCenter/);
  assert.match(source, /school-software-fee:\$\{JULY_REFERENCE_DATE\}:\$\{center\.id\}:\$\{accountId\}/);
  assert.match(source, /availableBalanceCents < policy\.unitAmountCents/);
  assert.match(source, /carry_forward_until_available_balance/);
  assert.match(source, /collect_july_catchup_then_start_august_monthly_collection/);
  assert.match(source, /paymentScope\) === "school_software_fee"/);
  assert.match(source, /item\.reversed === true \? "reversed" : "paid"/);
  assert.match(source, /v1\/invoices\?limit=100&created\[gte\]=\$\{CREATED_SINCE\}&expand\[\]=data\.payments/);
  assert.match(source, /subscriptionInvoiceEvidence/);
  assert.match(source, /item\.amountCents === policy\.unitAmountCents/);
  assert.match(source, /activeSubscriptions\[0\]\.effectiveMonthlyAmountCents === policy\.unitAmountCents/);
  assert.match(source, /exactMonthlyConfiguration/);
});
