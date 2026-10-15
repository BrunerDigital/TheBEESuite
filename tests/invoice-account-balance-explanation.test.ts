import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const parent = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
const workbench = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");

test("parent invoice explanation is visible and describes amounts billed without implying gross original charges", () => {
  const paragraph = parent.match(/<p className="([^"]*)">\s*Invoice totals show the amounts billed on each invoice\.\{\" \"\}([\s\S]*?)<\/p>/);
  assert.ok(paragraph, "expected explanation in the rendered parent invoice history");
  assert.doesNotMatch(paragraph[1], /sr-only|hidden/);
  assert.match(paragraph[1], /text-sm/);
  assert.match(paragraph[2], /Your current account balance reflects recorded payments and credits\./);
  assert.doesNotMatch(paragraph[0], /original charge|settled|paid in full/i);
});

test("parent balance-review notice uses the existing masking predicate and does not label masked zero as settled", () => {
  const condition = parent.match(/\{(parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed)\s*\? "During balance review, the family amount due is still being confirmed\."\s*: "Your current account balance reflects recorded payments and credits\."\}/);
  assert.ok(condition, "expected guidance tied to the same review and confirmation state as balance masking");
  const isReviewNotice = new Function("parentBalanceReviewRequired", "parentBalanceVisibilityConfirmed", "return (" + condition[1] + ");");
  assert.equal(isReviewNotice(true, false), true);
  assert.equal(isReviewNotice(true, true), false);
  assert.equal(isReviewNotice(false, false), false);
  assert.equal(isReviewNotice(false, true), false);
  assert.doesNotMatch(condition[0], /do not pay|cannot pay|settled|paid in full|zero balance/i);
});

test("director credit explanation is shown only when invoice totals exceed the net account balance", () => {
  assert.match(workbench, /\{hasHouseholdCreditAgainstInvoices \? \(\s*<p className="mt-3 text-sm text-muted-foreground">\s*Invoice totals show the amounts billed on each invoice\. The current\s*account balance includes recorded payments and credits\./);
  assert.match(workbench, /const hasHouseholdCreditAgainstInvoices = openInvoices\.reduce\(\(sum, invoice\) => sum \+ invoice\.totalCents, 0\) > Math\.max\(0, familyBalanceCents\);/);
});

const notice = workbench.match(/\{([^\n]+) \? \(\s*<p className="rounded-lg border bg-background\/45 p-3 text-sm text-muted-foreground">\s*This is an account payment\./);
assert.ok(notice, "expected account-payment notice");
const noticeVisible = new Function("paymentReviewMethod", "effectivePaymentTarget", "hasHouseholdCreditAgainstInvoices", "return (" + notice[1] + ");");

test("account-payment notice follows every existing credit-aware one-time checkout method", () => {
  for (const method of ["card_checkout", "instant_bank_checkout", "ach_checkout"]) {
    assert.equal(noticeVisible(method, "invoice:example", true), true, method);
  }
});

test("invoice-specific account-payment notice is excluded for autopay, no credit, balance and custom targets", () => {
  assert.equal(noticeVisible("autopay", "invoice:example", true), false);
  assert.equal(noticeVisible("card_checkout", "invoice:example", false), false);
  assert.equal(noticeVisible("card_checkout", "balance", true), false);
  assert.equal(noticeVisible("card_checkout", "custom", true), false);
});

test("review copy discloses invoice preference and possible coverage of other invoices without claiming settlement", () => {
  assert.match(workbench, /This is an account payment\. The selected invoice is prioritized,\s*and the payment may cover other open invoices\. The current account\s*balance already reflects recorded payments and credits\./);
  assert.doesNotMatch(notice[0], /settled|fully paid|paid in full/i);
});

test("existing collection amount cap and displayed confirmation amount remain intact", () => {
  assert.match(workbench, /Math\.min\(selectedPaymentInvoice\?\.totalCents \?\? 0, hasHouseholdCreditAgainstInvoices \? Math\.max\(0, familyBalanceCents\) : Number\.MAX_SAFE_INTEGER\)/);
  assert.match(workbench, /<SummaryMetric label="Amount" value=\{money\(directorPaymentAmountCents\)\}/);
});

test("existing route selection and preferred invoice request remain intact", () => {
  assert.match(workbench, /if \(invoiceId && method === "autopay"\)/);
  assert.match(workbench, /if \(invoiceId && !hasHouseholdCreditAgainstInvoices\)/);
  assert.match(workbench, /fetch\("\/api\/billing\/family-payment"/);
  assert.match(workbench, /amountCents: directorPaymentAmountCents,/);
  assert.match(workbench, /\.\.\.\(invoiceId \? \{ preferredInvoiceId: invoiceId \} : \{\}\)/);
});

