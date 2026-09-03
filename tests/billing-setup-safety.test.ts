import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("saving tuition or a payment method never implicitly enables autopay", () => {
  const assignmentRoute = readFileSync("src/app/api/billing/tuition-assignments/route.ts", "utf8");
  const paymentMethodRoute = readFileSync("src/app/api/billing/payment-method-session/route.ts", "utf8");
  const publicPaymentMethodRoute = readFileSync("src/app/api/billing/payment-method-request/session/route.ts", "utf8");
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const paymentMethodManagement = readFileSync("src/lib/payment-method-management.ts", "utf8");

  assert.doesNotMatch(assignmentRoute, /\n\s*autopayEnabled:/);
  assert.doesNotMatch(paymentMethodRoute, /enableAutopay:\s*"true"/);
  assert.doesNotMatch(publicPaymentMethodRoute, /enableAutopay:\s*"true"/);
  assert.match(paymentMethodRoute, /action === "enable_autopay"/);
  assert.match(paymentMethodRoute, /action === "disable_autopay"/);
  assert.match(paymentMethodRoute, /parentInitiatedPaymentMethodReauthorization/);
  assert.match(paymentMethodRoute, /parentFacing &&[\s\S]*billingAccount\.family\.children\.length === 0 &&[\s\S]*action === "setup"/);
  assert.match(paymentMethodRoute, /Saved payment methods and autopay are unavailable for a past family account/);
  assert.match(paymentMethodRoute, /action === "setup" && currentFields\.stripeBankVerificationPending === true/);
  assert.match(publicPaymentMethodRoute, /currentFields\.stripeBankVerificationPending === true/);
  assert.match(paymentMethodRoute, /Bank verification is already pending/);
  assert.match(publicPaymentMethodRoute, /Bank verification is already pending/);
  assert.match(paymentMethodManagement, /const explicitEnable = setupMode === "enable"/);
  assert.match(paymentMethodManagement, /const explicitDisable = setupMode === "disabled"/);
  assert.match(webhook, /const autopayPatch = paymentMethodSetupAutopayOutcome/);
  assert.match(webhook, /const appliedAutopayPatch = setupSucceeded \? autopayPatch : null/);
  assert.match(webhook, /autopayStatus: "pending"/);
  assert.match(webhook, /stripeBankVerificationPending !== true/);
  assert.match(webhook, /event.type === "setup_intent.setup_failed"/);
  assert.match(webhook, /event.type === "setup_intent.setup_failed" \|\| event.type === "setup_intent.canceled"/);
  assert.match(webhook, /const setupCanceled = event.type === "setup_intent.canceled"/);
  assert.match(webhook, /replacement_bank_verification_canceled/);
  assert.match(webhook, /from "BillingAccount"[\s\S]*for update/);
  assert.match(webhook, /hasReservedTerminalSetupIntentEvent/);
  assert.match(webhook, /const refreshedSetupIntent = await retrieveStripeSetupIntent/);
  assert.match(webhook, /Stripe SetupIntent terminal state could not be reconciled during checkout completion/);
  assert.ok(
    (webhook.match(/lockPaymentMethodBillingAccount\(tx, billingAccountId\)/g) ?? []).length >= 3,
  );
  assert.match(webhook, /const setupPending = !setupSucceeded/);
  assert.match(webhook, /Billing account changed while failed bank verification was being recorded/);
  assert.match(webhook, /stripePendingPaymentMethodId/);
  assert.match(webhook, /Verified payment method details could not be retrieved/);
  assert.match(webhook, /setupSucceeded \? \(paymentMethodId \|\| null\) : \(previousPaymentMethodId \|\| null\)/);
  assert.match(paymentMethodRoute, /stripePendingAutopayOutcome: null/);
  assert.match(webhook, /event.type === "setup_intent.succeeded"/);
});

test("director billing labels distinguish invoice creation from charging", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.match(workbench, /Create Batch Invoices/);
  assert.match(workbench, /Batch creates invoices only/);
  assert.match(workbench, /Weekly invoice creation/);
  assert.match(workbench, /Create Invoice Now/);
  assert.doesNotMatch(workbench, />\s*Charge This Child Now\s*</);
});

test("family intake prevents negative or repeated opening balances", () => {
  const route = readFileSync("src/app/api/families/intake/route.ts", "utf8");
  const form = readFileSync("src/components/family-student-intake-form.tsx", "utf8");
  assert.match(route, /startingBalanceCents < 0/);
  assert.match(route, /existingFamilyMatch && startingBalanceCents > 0/);
  assert.match(form, /Prior balance owed at cutover/);
  assert.match(form, /Leave blank or 0/);
});
