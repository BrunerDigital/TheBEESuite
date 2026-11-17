import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parentPaidInvoiceReferences } from "../src/lib/parent-payment-history";

test("parent invoice documents include DCFSA service evidence", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const portal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const print = readFileSync("src/components/billing-print-actions.tsx", "utf8");

  assert.match(page, /childName: stringField\(invoiceFields\.childName\)/);
  assert.match(page, /servicePeriodStart/);
  assert.match(page, /recurringDueDateForPeriod/);
  assert.match(page, /monthlyPeriod/);
  assert.match(page, /productCheckoutAvailable \? null/);
  assert.match(page, /invoiceFields\.childIds/);
  assert.match(page, /batchChildNames\.join/);
  assert.match(page, /invoiceChildNames/);
  assert.match(page, /familyId: family\.id/);
  assert.match(page, /parentInvoiceDocuments/);
  assert.match(page, /Family responsibility/);
  assert.match(page, /familyDocumentAmountCents/);
  assert.match(portal, /InvoicePrintButton/);
  assert.match(portal, /View \/ print invoice/);
  assert.match(portal, /PaymentReceiptPrintButton/);
  assert.match(portal, /View \/ print receipt/);
  assert.match(page, /paymentAppliedInvoiceIds/);
  assert.match(page, /appliedInvoiceIds/);
  assert.match(page, /paymentReferenceLabel/);
  assert.match(page, /recordFromJson\(payment\.customFields\)\.centerId/);
  assert.match(page, /organization: \{ tenantId: user\.tenantId \}/);
  assert.match(portal, /payment\.centerTimeZone \?\? centerTimeZone/);
  assert.match(page, /stringField\(fields\.reference\)/);
  assert.match(page, /stringField\(fields\.payrollReference\)/);
  assert.match(page, /stringField\(fields\.checkNumber\)/);
  assert.match(page, /invoiceNumbers\.join\(", "\)/);
  assert.match(page, /centerId: resolvedParentCenterId/);
  assert.match(page, /centerTimeZone=\{parentUpdateSnapshot\?\.context\.timeZone \?\? \(familyCenter \? readCenterLocationTimeZone\(familyCenter\)/);
  assert.match(print, /schoolTimeZone \?\? contextTimeZone/);
  assert.match(portal, /Purchase Invoice/);
  assert.match(print, /School EIN/);
  assert.match(page, /checkoutTotalCents \?\? payment\.amountCents/);
  assert.match(print, /Processing recovery/);
  assert.match(print, /manual_payroll_deduction/);
  assert.match(print, /Invoice reference/);
  assert.match(print, /Service period/);
  assert.match(print, /Amount/);
});

test("parent payments show only invoices settled by that payment", () => {
  const dueDate = "2026-11-05T12:00:00.000Z";
  const invoices = [
    { number: "INV-A", dueDate, status: "PAID", customFields: { childId: "a", paymentId: "payment-1" } },
    { number: "INV-B", dueDate, status: "PAID", customFields: { childId: "b", paymentId: "payment-1" } },
    { number: "INV-C", dueDate, status: "PAID", customFields: { childId: "c", paymentId: "payment-2" } },
    { number: "INV-D", dueDate, status: "OPEN", customFields: { childId: "a", paymentId: "payment-1" } },
    { number: "INV-E", dueDate, status: "PAID", customFields: null },
  ];
  const childNames = new Map([["a", "Avery"], ["b", "Charlie"]]);

  assert.deepEqual(parentPaidInvoiceReferences("payment-1", invoices, childNames), [
    { number: "INV-A", dueDate, childName: "Avery" },
    { number: "INV-B", dueDate, childName: "Charlie" },
  ]);
  assert.deepEqual(parentPaidInvoiceReferences("payment-2", invoices, childNames), [
    { number: "INV-C", dueDate, childName: null },
  ]);
  assert.deepEqual(parentPaidInvoiceReferences("unallocated-payment", invoices, childNames), []);
});
