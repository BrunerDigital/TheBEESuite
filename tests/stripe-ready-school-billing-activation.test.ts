import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/activate-stripe-ready-school-billing.ts", import.meta.url), "utf8");

test("billing activation is restricted to live Stripe-ready schools with confirmed payout banks", () => {
  assert.match(source, /readiness\.status === "ready" && payoutBankConfirmed/);
  assert.match(source, /currentInspection\.eligible/);
  assert.match(source, /connected-account binding changed after review/);
  assert.match(source, /confirm-fingerprint/);
});

test("billing activation enables school capabilities without creating financial activity", () => {
  assert.match(source, /livePaymentsEnabled: true/);
  assert.match(source, /tuitionBillingEnabled: true/);
  assert.match(source, /refundsEnabled: true/);
  assert.match(source, /stripeBillingApprovalCustomFieldPatch/);
  assert.match(source, /billingPreviewApprovedAt: activatedAt/);
  assert.match(source, /accountingApprovedAt: activatedAt/);
  assert.match(source, /cutoverApprovedAt: activatedAt/);
  assert.match(source, /childTuitionAssignmentsChanged: false/);
  assert.match(source, /chargesCreated: false/);
  assert.match(source, /refundsCreated: false/);
  assert.doesNotMatch(source, /tx\.child\.(?:update|updateMany|create|delete)/);
  assert.doesNotMatch(source, /tx\.(?:invoice|payment|ledgerEntry)\.(?:update|updateMany|create|delete)/);
});

test("billing activation records a school-scoped audit event", () => {
  assert.match(source, /billing\.stripe_ready_school\.activated/);
  assert.match(source, /resource: "Center"/);
  assert.match(source, /centerId: planned\.centerId/);
  assert.match(source, /user_authorized_all_stripe_ready_schools_for_full_billing_capability/);
});
