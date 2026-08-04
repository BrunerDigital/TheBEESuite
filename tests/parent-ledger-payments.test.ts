import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the parent portal places authoritative account activity ahead of invoice history", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const latestActivity = source.indexOf("Latest account activity");
  const accountLedger = source.indexOf("Account ledger");
  const invoices = source.indexOf(">Invoice history<");

  assert.ok(latestActivity >= 0);
  assert.ok(accountLedger > latestActivity);
  assert.ok(invoices > accountLedger);
  assert.match(source, /ledgerEntries\.map\(\(entry\)/);
  assert.doesNotMatch(source, /ledgerEntries\.slice\(/);
  assert.match(source, /Family-responsible charges, credits, payments, and adjustments/i);
  assert.match(source, /Invoice records are listed without agency subsidy amounts\./);
  assert.match(source, /Only your family responsibility is included\./);
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
  assert.match(workspace, /fetch\("\/api\/billing\/family-payment"/);
  assert.match(workspace, /billingAccountId:\s*billingAccount\.id/);
  assert.match(route, /const userIsParentGuardian = isParentGuardian\(user\)/);
  assert.match(route, /guardians:\s*\{ select:\s*\{ userId: true \} \}/);
  assert.match(route, /parentPaymentAmountCents\(/);
  assert.match(route, /parentBalanceNeedsResponsibilityReview\(/);
  assert.match(route, /parent_balance_responsibility_review_required/);
  assert.match(route, /source = parentCheckout \? "parent_portal"/);
  assert.match(route, /activeInvoicePayment/);
  assert.match(route, /invoice checkout is already processing/);
  assert.match(invoiceCheckoutRoute, /userIsParentGuardian && !userCanManageBilling && !productCheckoutBranding/);
  assert.match(invoiceCheckoutRoute, /pay the family balance shown there/);
  assert.match(workspace, /payProductInvoice/);
  assert.match(workspace, /parentBalanceReviewRequired \? "Under review"/);
  assert.match(workspace, /Pay Product by Card/);
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
  assert.match(workspace, /latestAccountLedgerEntry = latestLedgerEntry \?\? ledgerEntries\[0\] \?\? null/);
  assert.match(workspace, /Page \{ledgerPagination\.page\}/);
  assert.match(workspace, /ledgerPage=\$\{ledgerPagination\.page \+ 1\}/);
});
