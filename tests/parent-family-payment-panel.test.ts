import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parentFamilyPaymentPanelVisible } from "../src/lib/parent-family-payment-panel";

const formerFamily = {
  hasBillingAccount: true,
  paymentContinuityAccess: true,
  balanceCents: 0,
  responsibilityReviewRequired: false,
};

test("a former family can choose a payment amount while its displayed balance is under review", () => {
  // The server masks an unconfirmed positive balance as zero in portal props.
  assert.equal(parentFamilyPaymentPanelVisible({
    ...formerFamily,
    responsibilityReviewRequired: true,
  }), true);
});

test("former families with confirmed zero or credit balances retain no payment panel", () => {
  assert.equal(parentFamilyPaymentPanelVisible(formerFamily), false);
  assert.equal(parentFamilyPaymentPanelVisible({ ...formerFamily, balanceCents: -500 }), false);
});

test("former families with a positive payable balance retain the payment panel", () => {
  assert.equal(parentFamilyPaymentPanelVisible({ ...formerFamily, balanceCents: 500 }), true);
});

test("current families retain the panel for zero, credit, positive, and reviewed balances", () => {
  for (const balanceCents of [-500, 0, 500]) {
    for (const responsibilityReviewRequired of [false, true]) {
      assert.equal(parentFamilyPaymentPanelVisible({
        ...formerFamily,
        paymentContinuityAccess: false,
        balanceCents,
        responsibilityReviewRequired,
      }), true);
    }
  }
});

test("responsibility review does not expose the panel without a billing account", () => {
  for (const paymentContinuityAccess of [false, true]) {
    assert.equal(parentFamilyPaymentPanelVisible({
      ...formerFamily,
      hasBillingAccount: false,
      paymentContinuityAccess,
      responsibilityReviewRequired: true,
    }), false);
  }
});

test("portal uses review-aware visibility without removing pending-payment or amount-entry guards", () => {
  const portal = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
  assert.match(portal, /showFamilyPaymentPanel = parentFamilyPaymentPanelVisible\(\{[\s\S]*?responsibilityReviewRequired: parentBalanceReviewRequired,/);
  assert.match(portal, /showFamilyPaymentPanel && !accountPaymentBlocker/);
  assert.match(portal, /\(parentBalanceReviewRequired \|\| advancePayment \|\| balanceCents <= 0\) && !accountPaymentAmountEntered/);
  assert.match(portal, /if \(accountPaymentBlocker\) return showError\(parentPaymentStatusMessage/);
  assert.match(portal, /if \(accountPaymentAmountRequired\)/);
  assert.match(portal, /if \(checkoutBlocked\)/);
});
