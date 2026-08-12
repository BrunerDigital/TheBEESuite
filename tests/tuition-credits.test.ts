import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeTuitionCredits,
  totalTuitionCreditsCents,
  tuitionInvoiceItems,
  normalizeTuitionAdditionalCharges,
  totalTuitionAdditionalChargesCents,
} from "../src/lib/tuition-credits";

test("tuition credits keep only the five bookkeeping categories in display order", () => {
  const credits = normalizeTuitionCredits([
    { category: "hero_discount", amountCents: 1500 },
    { category: "employee_discount", amountCents: 2000 },
    { category: "not_approved", amountCents: 9999 },
    { category: "employee_discount", amountCents: 500 },
    { category: "family_discount", amountCents: -100 },
  ]);

  assert.deepEqual(credits, [
    { category: "employee_discount", amountCents: 2500 },
    { category: "hero_discount", amountCents: 1500 },
  ]);
  assert.equal(totalTuitionCreditsCents(credits), 4000);
});

test("weekly invoice items preserve gross tuition and itemize categorized credits", () => {
  const items = tuitionInvoiceItems({
    description: "Weekly tuition - Avery Bee",
    grossAmountCents: 30_000,
    additionalCharges: [
      { description: "Parent fee - Avery Bee", amountCents: 2_500 },
      { description: "Gap tuition - Avery Bee", amountCents: 12_000 },
    ],
    credits: [
      { category: "employee_discount", amountCents: 5_000 },
      { category: "family_discount", amountCents: 2_500 },
    ],
  });

  assert.deepEqual(items, [
    { description: "Weekly tuition - Avery Bee", amountCents: 30_000, ledgerType: "tuition_charge" },
    {
      description: "Parent fee - Avery Bee",
      amountCents: 2_500,
      ledgerType: "tuition_charge",
      tuitionChargeLine: true,
    },
    {
      description: "Gap tuition - Avery Bee",
      amountCents: 12_000,
      ledgerType: "tuition_charge",
      tuitionChargeLine: true,
    },
    {
      description: "Employee discount - Weekly tuition - Avery Bee",
      amountCents: -5_000,
      ledgerType: "tuition_credit",
      creditCategory: "employee_discount",
    },
    {
      description: "Family discount - Weekly tuition - Avery Bee",
      amountCents: -2_500,
      ledgerType: "tuition_credit",
      creditCategory: "family_discount",
    },
  ]);
  assert.equal(items.reduce((total, item) => total + item.amountCents, 0), 37_000);
});

test("additional tuition charges normalize as separate positive audit lines", () => {
  const charges = normalizeTuitionAdditionalCharges([
    { description: " Parent fee ", amountCents: 2500.4 },
    { description: "Gap tuition", amountCents: 12000 },
    { description: "", amountCents: 9999 },
    { description: "Bad amount", amountCents: -1 },
  ]);

  assert.deepEqual(charges, [
    { description: "Parent fee", amountCents: 2500 },
    { description: "Gap tuition", amountCents: 12000 },
  ]);
  assert.equal(totalTuitionAdditionalChargesCents(charges), 14_500);
});

test("director assignment, recurring invoices, and ledger persist credit detail", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const creditPolicy = readFileSync("src/lib/tuition-credits.ts", "utf8");
  const assignmentRoute = readFileSync("src/app/api/billing/tuition-assignments/route.ts", "utf8");
  const cronRoute = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");
  const invoiceService = readFileSync("src/lib/billing-invoices.ts", "utf8");

  for (const label of ["Employee discount", "Agency discount", "Miscellaneous credit", "Family discount", "Hero discount"]) {
    assert.match(creditPolicy, new RegExp(label));
  }
  assert.match(workbench, /TUITION_CREDIT_CATEGORIES\.map/);
  assert.match(workbench, /tuitionCredits: effectiveAssignmentCredits/);
  assert.match(workbench, /tuitionAdditionalCharges: effectiveAssignmentAdditionalCharges/);
  assert.match(assignmentRoute, /tuitionGrossAmountCents = plan\.amountCents \+ tuitionAdditionalChargesTotalCents/);
  assert.match(assignmentRoute, /tuitionAdditionalChargesTotalCents/);
  assert.match(cronRoute, /additionalCharges: tuitionAdditionalCharges/);
  assert.match(invoiceService, /type: item\.ledgerType \|\| "invoice"/);
  assert.match(invoiceService, /creditCategory: item\.creditCategory \?\? null/);
});
