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

test("parent responsibility evidence covers every open account invoice beyond the display page", () => {
  const source = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /const responsibilityInvoices = \[\.\.\.invoices, \.\.\.\(billingAccount\?\.invoices \?\? \[\]\)\];\s+const invoiceChildIds = \[\.\.\.new Set\(responsibilityInvoices\.flatMap/,
  );
});

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

test("an exact family-funded tuition assignment does not request a second responsibility split", () => {
  const invoiceFields = {
    chargeSource: "tuitionPlan",
    childId: "child_granbury",
    sourceId: "plan_parent_copay",
  };
  const child = {
    id: "child_granbury",
    customFields: {
      tuitionFundingType: "family",
      tuitionBillingEnabled: true,
      tuitionPlanId: "plan_parent_copay",
      tuitionNetAmountCents: 4_000,
    },
  };
  assert.equal(invoiceResponsibilityReviewExempt(invoiceFields, 4_000, child), true);
  assert.equal(invoiceResponsibilityReviewExempt({ ...invoiceFields, invoiceWeekCount: 2 }, 8_000, child), true);
  assert.equal(invoiceResponsibilityReviewExempt({ ...invoiceFields, invoiceWeekCount: 4 }, 16_000, child), true);
  assert.equal(invoiceResponsibilityReviewExempt(invoiceFields, 4_001, child), false);
  assert.equal(invoiceResponsibilityReviewExempt(invoiceFields, 4_000, { ...child, id: "another_child" }), false);
  assert.equal(invoiceResponsibilityReviewExempt(invoiceFields, 4_000, { ...child, customFields: { ...child.customFields, tuitionPlanId: "another_plan" } }), false);
  assert.equal(invoiceResponsibilityReviewExempt(invoiceFields, 4_000, {
    ...child,
    customFields: {
      ...child.customFields,
      tuitionBillingEnabled: false,
      tuitionBillingDisabledReason: "enrollment_closed",
    },
  }), true);
  assert.equal(invoiceResponsibilityReviewExempt(invoiceFields, 4_000, {
    ...child,
    customFields: {
      ...child.customFields,
      tuitionBillingEnabled: false,
      tuitionBillingDisabledReason: "director_disabled",
    },
  }), false);
  assert.equal(invoiceResponsibilityReviewExempt({
    ...invoiceFields,
    childId: undefined,
    childIds: ["child_granbury", "child_sibling"],
  }, 7_000, child, {
    id: "child_sibling",
    customFields: { ...child.customFields, tuitionNetAmountCents: 3_000 },
  }), true);
  assert.equal(invoiceResponsibilityReviewExempt({
    ...invoiceFields,
    childId: undefined,
    childIds: ["child_granbury", "child_sibling"],
  }, 7_000, child), false);
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
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "PAID", totalCents: 2_000, customFields: { responsibilitySeparation: separation } },
  ]), true);
  assert.equal(invoiceResponsibilityReviewExempt({ checkoutPurpose: "product_purchase" }), true);
  assert.equal(invoiceResponsibilityReviewExempt({ chargeSource: "tuition" }), false);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "CCDF Copay",
    grossTuitionCents: 1_900,
    netTuitionCents: 1_900,
    tuitionCreditsTotalCents: 0,
  }, 1_900), true);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "Weekly tuition",
    grossTuitionCents: 23_800,
    netTuitionCents: 12_000,
    tuitionCreditsTotalCents: 11_800,
    tuitionCredits: [{ category: "agency_discount", amountCents: 11_800 }],
  }, 12_000), true);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "Weekly tuition",
    grossTuitionCents: 20_000,
    netTuitionCents: 18_000,
    tuitionCreditsTotalCents: 2_000,
    tuitionCredits: [{ category: "employee_discount", amountCents: 2_000 }],
  }, 18_000), false);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "CCDF Copay",
    grossTuitionCents: 2_400,
    netTuitionCents: 2_400,
    tuitionCreditsTotalCents: 0,
    tuitionAdditionalChargesTotalCents: 500,
  }, 2_400), true);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "VPK subsidy weekly tuition",
    grossTuitionCents: 13_000,
    netTuitionCents: 13_000,
    tuitionCreditsTotalCents: 0,
  }, 13_000), false);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "CCDF Copay",
    grossTuitionCents: 20_000,
    netTuitionCents: 1_900,
    tuitionCreditsTotalCents: 0,
  }, 1_900), false);
  assert.equal(invoiceResponsibilityReviewExempt({
    chargeSource: "tuitionPlan",
    tuitionPlanName: "CCDF Copay",
    grossTuitionCents: 1_900,
    netTuitionCents: 1_900,
    tuitionCreditsTotalCents: 0,
  }, 2_500), false);
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "OPEN", totalCents: 8_000, customFields: { checkoutPurpose: "product_purchase" } },
    { status: "OPEN", totalCents: 2_000, customFields: { responsibilitySeparation: separation } },
  ]), true);
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "OPEN", totalCents: 1_900, customFields: { chargeSource: "tuitionPlan", tuitionPlanName: "CCDF Copay", grossTuitionCents: 1_900, netTuitionCents: 1_900, tuitionCreditsTotalCents: 0 } },
  ]), true);
  assert.equal(allOpenInvoicesResponsibilitySeparated([
    { status: "OPEN", totalCents: 8_000, customFields: { checkoutPurpose: "product_purchase" } },
  ]), false);
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

test("responsibility separation remains available while full invoice collection holds explicit agency evidence", () => {
  const actions = readFileSync("src/components/invoice-stored-payment-button.tsx", "utf8");
  const checkout = readFileSync("src/app/api/billing/checkout-session/route.ts", "utf8");
  const emailedCheckout = readFileSync("src/app/api/billing/payment-method-request/checkout/route.ts", "utf8");
  const terminalCheckout = readFileSync("src/app/api/billing/terminal-payment/route.ts", "utf8");
  const autopay = readFileSync("src/lib/autopay-processing.ts", "utf8");
  const invoiceRoute = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const livePage = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const aiRoute = readFileSync("src/app/api/ai/command/route.ts", "utf8");
  const operationsRoute = readFileSync("src/app/api/operations/records/route.ts", "utf8");
  const visibility = readFileSync("src/lib/parent-billing-visibility.ts", "utf8");
  const reminders = readFileSync("src/app/api/cron/tuition-payment-reminders/route.ts", "utf8");

  assert.match(actions, /Separate responsibility/);
  assert.match(actions, /responsibilityReviewRequired/);
  assert.match(actions, /This records an agency receivable; it does not record an agency payment/);
  assert.match(visibility, /paymentCollectionResponsibilityHoldRequired/);
  assert.match(visibility, /input\.enforceCollectionHold === true && parentBalanceNeedsResponsibilityReview/);
  for (const paymentPath of [checkout, emailedCheckout, terminalCheckout, autopay]) {
    assert.match(paymentPath, /enforceCollectionHold:\s*true/);
    assert.match(paymentPath, /paymentCollectionResponsibilityHoldRequired/);
    assert.match(paymentPath, /responsibilityEvidence:\s*\[\s*invoice(?:Fields|\.customFields),\s*invoice\.items\.map/);
  }
  assert.match(reminders, /enforceCollectionHold:\s*true/);
  assert.doesNotMatch(actions, /invoice\.responsibilityReviewRequired\) return "Separate family and agency responsibility before collecting payment/);
  assert.doesNotMatch(actions, /invoice\.responsibilityReviewRequired\) return setError/);
  assert.match(autopay, /invoice\.items\.map/);
  assert.match(invoiceRoute, /amount or item description cannot be changed after family and agency responsibility has been separated/);
  assert.match(livePage, /invoice\.status === PaymentStatus\.VOID && \(!separated \|\| separated\.familyResponsibilityCents > 0\)/);
  assert.match(emailedCheckout, /invoice\.items\.map/);
  assert.match(aiRoute, /invoiceResponsibilitySeparation\(invoice\.customFields\)/);
  assert.match(operationsRoute, /invoiceResponsibilitySeparation\(existingInvoice\.customFields\)/);
  assert.match(invoiceRoute, /A separated invoice cannot be voided because it has a linked agency receivable/);
  assert.match(invoiceRoute, /customFields: \{ tuitionPlanName: plan\.name \}/);
  assert.match(invoiceRoute, /grossTuitionCents: items\.reduce\(\(total, item\) => total \+ item\.amountCents, 0\)/);
  assert.match(invoiceRoute, /netTuitionCents: items\.reduce\(\(total, item\) => total \+ item\.amountCents, 0\)/);
  assert.match(invoiceRoute, /charge\.chargeSource === "tuitionPlan" && !child/);
  assert.match(invoiceRoute, /netTuitionCents: charge\.amountCents/);
});
