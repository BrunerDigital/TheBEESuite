import assert from "node:assert/strict";
import { test } from "node:test";
import { loginHrefForPortal, resolvePortalPostLoginPath } from "../src/lib/login-routing";
import { stripePayoutSetupFlowForCenters, stripePayoutSetupIsComplete } from "../src/lib/stripe-payout-setup-flow";
import { stripeConnectPanelCenterAfterResponse } from "../src/lib/stripe-connect-panel-state";
import { stripeSchoolReadinessFlowFromFields } from "../src/lib/stripe-school-readiness-flow";
import { stripeBillingApprovalCustomFieldPatch, stripeSchoolBillingApproval } from "../src/lib/stripe-billing-approval";

const stripeReady = {
  stripeConnectAccountId: "acct_school",
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripePayoutRequirementFields: [],
};
const bankReady = {
  ...stripeReady,
  stripePayoutBankLast4: "4242",
  stripePayoutBankDefaultConfirmed: true,
  stripePayoutBankStatus: "verified",
};
const approvedAt = "2026-11-20T12:00:00.000Z";
const liveFields = {
  ...bankReady,
  ...stripeBillingApprovalCustomFieldPatch({
    approved: true, approvedAt, approvedBy: "Authorized owner",
    billingPreviewApprovedAt: approvedAt, accountingApprovedAt: approvedAt, cutoverApprovedAt: approvedAt,
  }),
  livePaymentsEnabled: true,
  tuitionBillingEnabled: true,
};

test("payout setup requires a confirmed usable default bank while billing activation stays separate", () => {
  assert.equal(stripePayoutSetupIsComplete(stripeReady), false);
  assert.equal(stripePayoutSetupIsComplete({ ...bankReady, stripePayoutBankDefaultConfirmed: false }), false);
  assert.equal(stripePayoutSetupIsComplete({ ...bankReady, stripePayoutBankLast4: " " }), false);
  assert.equal(stripePayoutSetupIsComplete({ ...bankReady, stripePayoutBankStatus: "errored" }), false);
  assert.equal(stripePayoutSetupIsComplete({ ...bankReady, stripePayoutBankStatus: "verification_failed" }), false);
  assert.equal(stripePayoutSetupIsComplete(bankReady), true);
  assert.equal(stripeSchoolReadinessFlowFromFields({ customFields: bankReady }).stage, "activation_required");
  assert.equal(stripePayoutSetupFlowForCenters([
    { id: "school_a", customFields: bankReady }, { id: "school_b", customFields: stripeReady },
  ]).complete, false);
});

test("choosing a sign-in portal preserves the owner payout destination and role restrictions", () => {
  const destination = "/billing-settings?center=school_a#payout-setup";
  const href = new URL(loginHrefForPortal("directors", destination), "https://thebeesuite.io");
  assert.equal(href.pathname, "/directors");
  assert.equal(href.searchParams.get("next"), destination);
  assert.equal(resolvePortalPostLoginPath({ portal: "directors", requestedNext: href.searchParams.get("next"), role: "CENTER_DIRECTOR" }), destination);
  assert.equal(resolvePortalPostLoginPath({ portal: "directors", requestedNext: href.searchParams.get("next"), role: "PARENT_GUARDIAN" }), "/parent-portal");
  assert.equal(loginHrefForPortal("teachers"), "/teachers?next=%2Fteacher-portal%23teacher-roster");
  assert.equal(new URL(loginHrefForPortal("directors", "https://outside.example"), "https://thebeesuite.io").searchParams.get("next"), "/dashboard");
});

test("an activation response immediately updates the visible flow without recreating approval evidence", () => {
  const center = { id: "school_a", name: "School A", customFields: bankReady };
  const flow = stripeSchoolReadinessFlowFromFields({ customFields: liveFields });
  const updated = stripeConnectPanelCenterAfterResponse(center, { centerId: center.id, flow });
  assert.equal(updated.payoutFlow?.stage, "ready");
  assert.equal((updated.customFields as Record<string, unknown>).livePaymentsEnabled, true);
  assert.equal((updated.customFields as Record<string, unknown>).tuitionBillingEnabled, true);
  assert.equal((updated.customFields as Record<string, unknown>).stripeBillingApprovedAt, undefined);
  assert.equal((center.customFields as Record<string, unknown>).livePaymentsEnabled, undefined);
});

test("checking status refreshes server approval and clears obsolete due requirements", () => {
  const flow = stripeSchoolReadinessFlowFromFields({ customFields: liveFields });
  const center = { id: "school_a", name: "School A", customFields: { ...bankReady, stripeRequirementFields: ["old.requirement"] } };
  const updated = stripeConnectPanelCenterAfterResponse(center, {
    centerId: center.id, flow,
    billingApproval: stripeSchoolBillingApproval({ customFields: liveFields }),
    account: {
      id: "acct_school", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
      requirementFields: [], pendingVerificationFields: [],
    },
    payoutBank: { last4: "4242", defaultForCurrency: true, status: "verified" }, payoutBankCount: 1,
  }, approvedAt);
  assert.equal(updated.payoutFlow?.stage, "ready");
  assert.equal(stripeSchoolReadinessFlowFromFields({ customFields: updated.customFields }).stage, "ready");
  assert.equal((updated.customFields as Record<string, unknown>).stripeBillingApprovedAt, approvedAt);
});

test("a failed bank read clears cached confirmation and cannot leave a ready flow visible", () => {
  const readyFlow = stripeSchoolReadinessFlowFromFields({ customFields: liveFields });
  const center = { id: "school_a", name: "School A", customFields: liveFields, payoutFlow: readyFlow };
  const failed = stripeConnectPanelCenterAfterResponse(center, { centerId: center.id, payoutBankError: "Provider unavailable", flow: readyFlow });
  assert.equal(failed.payoutFlow?.stage, "payout_bank_required");
  assert.equal(failed.payoutFlow?.canAcceptParentPayments, false);
  assert.equal((failed.customFields as Record<string, unknown>).stripePayoutBankDefaultConfirmed, false);
  assert.equal((failed.customFields as Record<string, unknown>).stripeBillingApprovedAt, approvedAt);
  assert.equal(center.payoutFlow.stage, "ready");
  assert.throws(() => stripeConnectPanelCenterAfterResponse(center, { centerId: "school_b", flow: readyFlow }), /wrong school/);
});

test("a removed account clears the old displayed account and its confirmed-bank state", () => {
  const center = { id: "school_a", name: "School A", customFields: liveFields };
  const updated = stripeConnectPanelCenterAfterResponse(center, {
    centerId: center.id, account: null, flow: stripeSchoolReadinessFlowFromFields({ customFields: {} }),
  });
  assert.equal(updated.payoutFlow?.stage, "not_started");
  assert.equal((updated.customFields as Record<string, unknown>).stripeConnectAccountId, null);
  assert.equal((updated.customFields as Record<string, unknown>).stripePayoutBankDefaultConfirmed, false);
});
