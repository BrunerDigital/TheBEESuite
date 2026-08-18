import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the parent portal places authoritative account activity ahead of invoice history", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const latestActivity = source.indexOf("Latest account activity");
  const accountLedger = source.indexOf("Account Activity");
  const invoices = source.indexOf("Invoice history");

  assert.ok(latestActivity >= 0);
  assert.ok(accountLedger > latestActivity);
  assert.ok(invoices > accountLedger);
  assert.match(source, /ledgerEntries\.map\(\(entry\)/);
  assert.doesNotMatch(source, /ledgerEntries\.slice\(/);
  assert.match(source, /Charges, credits, payments, and adjustments included in your\s+family balance/i);
  assert.match(source, /Review invoice dates and payment status/);
  assert.match(source, /This is the amount currently due from your family/);
  assert.doesNotMatch(source, /balanceAfterCents/);
  assert.doesNotMatch(source, /latestAccountLedgerEntry\.amountCents|money\(entry\.amountCents\)/);
});

test("parent invoice data and checkout do not expose or charge agency responsibility", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const route = readFileSync("src/app/api/billing/family-payment/route.ts", "utf8");
  const invoiceCheckoutRoute = readFileSync("src/app/api/billing/checkout-session/route.ts", "utf8");
  const parentPortal = page.slice(page.indexOf('if (slug === "parent-portal")'), page.indexOf('if (slug === "center-dashboard")'));
  const parentInvoiceData = parentPortal.slice(parentPortal.indexOf("const parentInvoices"), parentPortal.indexOf("const stripeConfigured"));

  assert.ok(parentInvoiceData);
  assert.doesNotMatch(parentInvoiceData, /totalCents/);
  assert.doesNotMatch(workspace, /invoice\.totalCents|checkoutOptions/);
  assert.match(workspace, /parentPortalRequest\(\s*"\/api\/billing\/family-payment"/);
  assert.match(workspace, /billingAccountId:\s*billingAccount\.id/);
  assert.match(route, /const userIsParentGuardian = isParentGuardian\(user\)/);
  assert.match(route, /guardians:\s*\{ select:\s*\{ userId: true \} \}/);
  assert.match(route, /parentPaymentAmountCents\(/);
  assert.match(route, /paymentCollectionResponsibilityHoldRequired\(/);
  assert.doesNotMatch(route, /enforceCollectionHold:\s*true/);
  assert.match(route, /parent_account_payment_responsibility_review_required/);
  assert.match(route, /requestedAmountCents,\s*responsibilityReviewRequired/);
  assert.match(route, /source = parentCheckout \? "parent_portal"/);
  assert.match(page, /balanceCents:\s*parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed \? 0 : parentBalanceCents/);
  assert.match(page, /hasConfirmedFamilyResponsibility\(/);
  const visibilityCall = page.slice(
    page.indexOf("hasConfirmedFamilyResponsibility("),
    page.indexOf("hasConfirmedFamilyResponsibility(") + 300,
  );
  assert.match(visibilityCall, /billingAccount\.customFields/);
  assert.doesNotMatch(visibilityCall, /family\?\.customFields|family\?\.children/);
  assert.match(route, /activeInvoicePayment/);
  assert.match(route, /invoice checkout is already processing/);
  assert.match(invoiceCheckoutRoute, /userIsParentGuardian && !userCanManageBilling && !productCheckoutBranding/);
  assert.match(invoiceCheckoutRoute, /pay the family balance shown there/);
  assert.match(invoiceCheckoutRoute, /enforceCollectionHold:\s*true/);
  assert.match(invoiceCheckoutRoute, /responsibilityEvidence:\s*\[\s*invoice\.customFields,\s*invoice\.items\.map/);
  assert.match(workspace, /payProductInvoice/);
  assert.match(workspace, /parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed[\s\S]{0,80}\? "Being confirmed"/);
  assert.match(workspace, /Amount to pay/);
  assert.match(workspace, /amountCents: accountPaymentRequestCents/);
  assert.doesNotMatch(workspace, /Payment is blocked until the school separates agency and family responsibility/);
  assert.match(workspace, /Pay invoice by card/);
});

test("a positive family balance remains payable when no open invoice exists", () => {
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(
    workspace,
    /const showFamilyPaymentPanel\s*=\s*parentBalanceReviewRequired[\s\S]*balanceCents > 0 && openInvoices\.length === 0/,
  );
  assert.match(
    workspace,
    /if \(!nextOpenInvoice && balanceCents <= 0 && !parentBalanceReviewRequired\)/,
  );
  assert.match(workspace, /available for\s+secure account payment/);
});

test("automated payment holds invoice-level agency evidence without treating account markers as a hold", () => {
  const source = readFileSync("src/lib/autopay-processing.ts", "utf8");
  const visibility = readFileSync("src/lib/parent-billing-visibility.ts", "utf8");
  const holdIndex = source.indexOf("paymentCollectionResponsibilityHoldRequired({");
  const creditIndex = source.indexOf("allocateAccountCreditToInvoice({", holdIndex);
  const stripeIndex = source.indexOf("createStripeOffSessionPaymentIntent", holdIndex);

  assert.ok(holdIndex > 0);
  assert.ok(creditIndex > holdIndex);
  assert.ok(stripeIndex > holdIndex);
  assert.match(source, /responsibilityEvidence:\s*\[\s*invoiceFields,\s*invoice\.items\.map/);
  assert.match(source, /enforceCollectionHold:\s*true/);
  assert.match(visibility, /input\.enforceCollectionHold === true/);
});

test("a changed ProCare balance invalidates prior family-responsibility confirmation", () => {
  const source = readFileSync("src/app/api/imports/procare/route.ts", "utf8");

  assert.match(source, /select: \{ balanceCents: true, customFields: true \}/);
  assert.match(source, /existingBillingAccount\?\.balanceCents === balanceCents[\s\S]*withoutConfirmedFamilyResponsibility/);
  assert.match(source, /customFields: mergeCustomFields\(existingBillingFields, importedBillingFields\)/);
});

test("director billing keeps agency amounts and payment controls", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const operations = readFileSync("src/components/live-ops-pages.tsx", "utf8");

  assert.match(workbench, /agencyAmountDollars/);
  assert.match(workbench, /Post Agency Payment/);
  assert.match(operations, /Agency payments/);
});

test("the parent portal query paginates the family ledger with a stable bounded window", () => {
  const source = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const parentPortal = source.slice(source.indexOf('if (slug === "parent-portal")'), source.indexOf('if (slug === "center-dashboard")'));
  const ledgerSelection = parentPortal.match(/ledgerEntries:\s*\{[\s\S]*?select:\s*\{[^}]*effectiveAt[^}]*\}/)?.[0] ?? "";

  assert.ok(ledgerSelection);
  assert.match(source, /const PARENT_LEDGER_PAGE_SIZE = 50/);
  assert.match(ledgerSelection, /orderBy:\s*\[\{ effectiveAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(ledgerSelection, /skip:\s*\(requestedLedgerPage - 1\) \* PARENT_LEDGER_PAGE_SIZE/);
  assert.match(ledgerSelection, /take:\s*PARENT_LEDGER_PAGE_SIZE \+ 1/);
  assert.match(ledgerSelection, /where:\s*parentVisibleLedgerWhere/);
  assert.match(parentPortal, /ledgerEntries\.slice\(0, PARENT_LEDGER_PAGE_SIZE\)/);
  assert.match(parentPortal, /hasNext:\s*\(billingAccount\?\.ledgerEntries\.length \?\? 0\) > PARENT_LEDGER_PAGE_SIZE/);
  assert.match(parentPortal, /parentVisibleBillingBalanceCents/);
  assert.match(parentPortal, /NOT:\s*\{ provider: AGENCY_LEDGER_SOURCE_SYSTEM \}/);
});

test("the parent portal keeps latest activity accurate while browsing older ledger pages", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(page, /prisma\.ledgerEntry\.findFirst\([\s\S]*?billingAccount:\s*\{ familyId \}/);
  assert.match(page, /latestLedgerEntry=\{latestLedgerEntry\}/);
  assert.match(workspace, /latestAccountLedgerEntry =\s+latestLedgerEntry \?\? ledgerEntries\[0\] \?\? null/);
  assert.match(workspace, /Page \{ledgerPagination\.page\}/);
  assert.match(workspace, /ledgerPage=\$\{ledgerPagination\.page \+ 1\}/);
});


test("parent account payments support custom partial amounts for split-payment workflows", () => {
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const visibility = readFileSync("src/lib/parent-billing-visibility.ts", "utf8");

  assert.match(workspace, /Amount to pay\s+\{parentBalanceReviewRequired \? "" : " \(optional\)"\}/);
  assert.match(workspace, /split the balance across payment methods/);
  assert.match(workspace, /amountCents: accountPaymentRequestCents/);
  assert.match(workspace, /accountPaymentAmountEntered/);
  assert.match(workspace, /accountPaymentAmountInvalid/);
  assert.match(workspace, /accountPaymentAmountExceedsBalance/);
  assert.match(visibility, /responsibilityReviewRequired && requestedAmountCents <= 0/);
  assert.match(visibility, /requestedAmountCents > 0[\s\S]*Math\.min\(requestedAmountCents, maximumParentPaymentCents\)/);
});

test("Stripe family-balance application atomically claims a draft payment", () => {
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const application = readFileSync("src/lib/stripe-payment-application.ts", "utf8");

  assert.match(webhook, /payment\.updateMany\(\{[\s\S]*status: PaymentStatus\.DRAFT/);
  assert.match(webhook, /claimedPayment\.count !== 1/);
  assert.match(webhook, /ignoredReason = "payment_already_applied"/);
  for (const source of [webhook, application]) {
    assert.match(source, /accountBalanceAfterCents/);
    assert.match(source, /accountBalanceAfterCents:\s*updatedAccount\.balanceCents/);
    assert.match(source, /openInvoiceTotalCents - Math\.max\(0, input\.accountBalanceAfterCents/);
    assert.match(source, /remainingCents = Math\.min\(openInvoiceTotalCents, invoiceSettlementBudgetCents\)/);
  }
});
