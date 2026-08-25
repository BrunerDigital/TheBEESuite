import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parent invoice documents include DCFSA service evidence", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const portal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const print = readFileSync("src/components/billing-print-actions.tsx", "utf8");

  assert.match(page, /childName: stringField\(invoiceFields\.childName\)/);
  assert.match(page, /servicePeriodStart/);
  assert.match(page, /recurringDueDateForPeriod/);
  assert.match(page, /monthlyPeriod/);
  assert.match(page, /parentInvoiceDocuments/);
  assert.match(page, /Family responsibility/);
  assert.match(page, /familyDocumentAmountCents/);
  assert.match(portal, /InvoicePrintButton/);
  assert.match(portal, /Purchase Invoice/);
  assert.match(print, /School EIN/);
  assert.match(print, /Service period/);
  assert.match(print, /Amount/);
});
