import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  allOpenInvoicesResponsibilitySeparated,
  invoiceResponsibilityReviewExempt,
  invoiceResponsibilitySeparation,
  responsibilitySeparatedBillingAmounts,
  responsibilitySeparationError,
} from "../src/lib/invoice-responsibility-separation";

const separation = {
  status: "separated",
  originalInvoiceTotalCents: 12_000,
  familyResponsibilityCents: 2_000,
  agencyResponsibilityCents: 10_000,
  agencyName: "CCDF",
  authorizationNumber: "AUTH-12",
  coverageStart: null,
  coverageEnd: null,
  separatedAt: "2026-08-18T12:00:00.000Z",
  separatedByUserId: "user_1",
};

test("a reviewed invoice separation preserves exact family, agency, and gross totals", () => {
  assert.deepEqual(invoiceResponsibilitySeparation({ responsibilitySeparation: separation }), separation);
  assert.deepEqual(responsibilitySeparatedBillingAmounts({
    invoiceTotalCents: 2_000,
    customFields: { responsibilitySeparation: separation },
  }), {
    familyResponsibilityCents: 2_000,
    agencyResponsibilityCents: 10_000,
    totalResponsibilityCents: 12_000,
  });
});

test("account review resolves only when every open invoice has an exact separation", () => {
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "OPEN", totalCents: 2_000, customFields: { responsibilitySeparation: separation } },
  ]), true);
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "OPEN", totalCents: 2_000, customFields: { responsibilitySeparation: separation } },
    { status: "OPEN", totalCents: 5_000, customFields: {} },
  ]), false);
  assert.equal(allOpenInvoicesResponsibilitySeparated([]), false);
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "VOID", totalCents: 0, customFields: { responsibilitySeparation: { ...separation, familyResponsibilityCents: 0, agencyResponsibilityCents: 12_000 } } },
  ]), true);
  assert.equal(invoiceResponsibilityReviewExempt({ checkoutPurpose: "product_purchase" }), true);
  assert.equal(invoiceResponsibilityReviewExempt({ chargeSource: "tuition" }), false);
});

test("responsibility separation fails closed on mismatched totals and ambiguous account credit", () => {
  assert.equal(responsibilitySeparationError({
    invoiceTotalCents: 12_000,
    accountBalanceCents: 12_000,
    itemTotalCents: 12_000,
    familyResponsibilityCents: 2_000,
    agencyResponsibilityCents: 9_000,
    agencyName: "CCDF",
  }), "Family and agency responsibility must exactly equal the current invoice total.");
  assert.equal(responsibilitySeparationError({
    invoiceTotalCents: 12_000,
    accountBalanceCents: 5_000,
    itemTotalCents: 12_000,
    familyResponsibilityCents: 2_000,
    agencyResponsibilityCents: 10_000,
    agencyName: "CCDF",
  }), "The account balance is lower than the agency portion. Review existing credits or payments before separating responsibility.");
  assert.equal(invoiceResponsibilitySeparation({
    responsibilitySeparation: { ...separation, familyResponsibilityCents: 3_000 },
  }), null);
});

test("the director split is atomic, audited, and does not change the total account balance", () => {
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const start = route.indexOf("async function separateInvoiceResponsibility");
  const end = route.indexOf("function moneyLabel", start);
  const source = route.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(source, /expectedInvoiceTotalCents/);
  assert.match(source, /expectedAccountBalanceCents/);
  assert.match(source, /responsibilitySeparationError/);
  assert.match(source, /PaymentStatus\.DRAFT, PaymentStatus\.OPEN, PaymentStatus\.PAID, PaymentStatus\.REFUNDED/);
  assert.match(source, /family_responsibility_adjustment/);
  assert.match(source, /type: "agency_receivable"/);
  assert.match(source, /invoiceId: null/);
  assert.match(source, /billing\.invoice\.responsibility_separated/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.doesNotMatch(source, /tx\.billingAccount\.update/);
});

test("all online payment paths stay blocked until responsibility is separated", () => {
  const actions = readFileSync("src/components/invoice-stored-payment-button.tsx", "utf8");
  const checkout = readFileSync("src/app/api/billing/checkout-session/route.ts", "utf8");
  const emailedCheckout = readFileSync("src/app/api/billing/payment-method-request/checkout/route.ts", "utf8");
  const autopay = readFileSync("src/lib/autopay-processing.ts", "utf8");
  const invoiceRoute = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const livePage = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const aiRoute = readFileSync("src/app/api/ai/command/route.ts", "utf8");
  const operationsRoute = readFileSync("src/app/api/operations/records/route.ts", "utf8");

  assert.match(actions, /Separate responsibility/);
  assert.match(actions, /responsibilityReviewRequired/);
  assert.match(actions, /This records an agency receivable; it does not record an agency payment/);
  assert.match(checkout, /Separate family and agency responsibility before opening payment/);
  assert.ok(checkout.indexOf("parentBalanceNeedsResponsibilityReview({") < checkout.indexOf("const stripeSecretConfigured"));
  assert.match(emailedCheckout, /parentBalanceNeedsResponsibilityReview/);
  assert.ok(emailedCheckout.indexOf("parentBalanceNeedsResponsibilityReview({") < emailedCheckout.indexOf("const stripeSecretConfigured"));
  assert.match(autopay, /Automated payment is blocked until the school separates agency and family responsibility/);
  assert.match(autopay, /invoice\.items\.map/);
  assert.match(invoiceRoute, /amount or item description cannot be changed after family and agency responsibility has been separated/);
  assert.match(livePage, /invoice\.status === PaymentStatus\.VOID && \(!separated \|\| separated\.familyResponsibilityCents > 0\)/);
  assert.match(emailedCheckout, /invoice\.items\.map/);
  assert.match(emailedCheckout, /family\.children\.map/);
  assert.match(aiRoute, /invoiceResponsibilitySeparation\(invoice\.customFields\)/);
  assert.match(operationsRoute, /invoiceResponsibilitySeparation\(existingInvoice\.customFields\)/);
  assert.match(invoiceRoute, /A separated invoice cannot be voided because it has a linked agency receivable/);
});
