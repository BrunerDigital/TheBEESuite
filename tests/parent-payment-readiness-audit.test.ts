import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parent payment readiness audit checks balances, access, and account coverage without N+1 ledger reads", () => {
  const source = readFileSync("scripts/audit-parent-payment-readiness.ts", "utf8");

  assert.match(source, /livePaymentsEnabled === true/);
  assert.match(source, /tuitionBillingEnabled === true/);
  assert.match(source, /stripeSchoolBillingApproval/);
  assert.match(source, /currentlyEnrolledChildWhere/);
  assert.match(source, /parentVisibleBillingBalanceCents/);
  assert.match(source, /positiveBalancesWithoutActiveParentLink/);
  assert.match(source, /currentFamiliesWithoutBillingAccounts/);
  assert.match(source, /currentFamiliesWithoutActiveParentLink/);
  assert.match(source, /latestCreatedLedgerBalanceMismatches/);
  assert.match(source, /loadActiveSupabaseAuthEmails/);
  assert.match(source, /activeAuthUser/);
  assert.match(source, /paymentCenterTenantById/);
  assert.match(source, /nextPage/);
  assert.doesNotMatch(source, /page <= 20/);
  assert.match(source, /activeParentLinksMissingAuth/);
  assert.match(source, /center\.positiveBalancesWithoutOpenInvoice > 0/);
  assert.match(source, /ledgerEntry\.findMany/);
  assert.doesNotMatch(source, /accountIds\.map\([\s\S]{0,120}ledgerEntry\.findFirst/);
});
