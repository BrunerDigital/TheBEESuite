import assert from "node:assert/strict";
import { test } from "node:test";
import { stripeSchoolBillingApproval } from "../src/lib/stripe-billing-approval";

test("school billing remains off when Stripe is technically ready but business approval is absent", () => {
  const approval = stripeSchoolBillingApproval({
    centerName: "Kid City USA - Longmont",
    legacyApprovedCenterNames: "Kid City USA - Kokomo",
    customFields: {
      stripeConnectAccountId: "acct_123",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    },
  });
  assert.equal(approval.approved, false);
  assert.match(approval.blockingReason ?? "", /billing preview/i);
});

test("school billing approval requires every human signoff field", () => {
  const approval = stripeSchoolBillingApproval({
    centerName: "Kid City USA - Longmont",
    legacyApprovedCenterNames: "Kid City USA - Kokomo",
    customFields: {
      stripeBillingApproved: true,
      stripeBillingApprovedAt: "2026-07-20T12:00:00.000Z",
      stripeBillingApprovedBy: "Brenden",
      stripeBillingPreviewApprovedAt: "2026-07-20T11:00:00.000Z",
      stripeBillingAccountingApprovedAt: "2026-07-20T11:30:00.000Z",
      stripeBillingApprovalVersion: "2026-07-school-billing-v1",
    },
  });
  assert.equal(approval.approved, false);
});

test("complete per-school approval opens the business gate", () => {
  const approval = stripeSchoolBillingApproval({
    centerName: "Kid City USA - Longmont",
    legacyApprovedCenterNames: "Kid City USA - Kokomo",
    customFields: {
      stripeBillingApproved: true,
      stripeBillingApprovedAt: "2026-07-20T12:00:00.000Z",
      stripeBillingApprovedBy: "Brenden",
      stripeBillingPreviewApprovedAt: "2026-07-20T11:00:00.000Z",
      stripeBillingAccountingApprovedAt: "2026-07-20T11:30:00.000Z",
      stripeBillingCutoverApprovedAt: "2026-07-20T11:45:00.000Z",
      stripeBillingApprovalVersion: "2026-07-school-billing-v1",
    },
  });
  assert.equal(approval.approved, true);
  assert.equal(approval.source, "explicit");
});

test("Kokomo legacy production use stays available without approving another school", () => {
  const kokomo = stripeSchoolBillingApproval({
    centerName: "Kid City USA - Kokomo",
    legacyApprovedCenterNames: "Kid City USA - Kokomo",
    customFields: {},
  });
  const longmont = stripeSchoolBillingApproval({
    centerName: "Kid City USA - Longmont",
    legacyApprovedCenterNames: "Kid City USA - Kokomo",
    customFields: {},
  });
  assert.equal(kokomo.approved, true);
  assert.equal(kokomo.source, "legacy_production");
  assert.equal(longmont.approved, false);
});
