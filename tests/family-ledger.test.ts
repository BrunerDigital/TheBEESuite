import assert from "node:assert/strict";
import test from "node:test";
import { filterFamilyLedgerEntries, filterLedgerEntriesByDateRange, standardCustomerStatementEntries } from "../src/lib/family-ledger";

const entries = [
  { id: "harris-1", billingAccount: { family: { id: "harris" } } },
  { id: "davis-1", billingAccount: { family: { id: "davis" } } },
  { id: "harris-2", billingAccount: { family: { id: "harris" } } },
];

test("family ledger shows entries for only the selected family", () => {
  assert.deepEqual(
    filterFamilyLedgerEntries(entries, "harris").map((entry) => entry.id),
    ["harris-1", "harris-2"],
  );
  assert.deepEqual(filterFamilyLedgerEntries(entries, ""), []);
});

test("family ledger date ranges include both boundary dates", () => {
  const dated = [
    { id: "before", type: "invoice", effectiveAt: "2026-08-31T12:00:00.000Z" },
    { id: "start", type: "invoice", effectiveAt: "2026-09-01T12:00:00.000Z" },
    { id: "end", type: "payment", effectiveAt: "2026-09-30T12:00:00.000Z" },
    { id: "after", type: "invoice", effectiveAt: "2026-10-01T12:00:00.000Z" },
  ];
  assert.deepEqual(
    filterLedgerEntriesByDateRange(dated, "2026-09-01", "2026-09-30", (value) => new Date(value).toISOString().slice(0, 10)).map((entry) => entry.id),
    ["start", "end"],
  );
});

test("standard statements hide both sides of a voided invoice without deleting ledger history", () => {
  const history = [
    { id: "charge", type: "invoice", invoiceId: "invoice-1", effectiveAt: "2026-09-01T12:00:00.000Z" },
    { id: "void", type: "invoice_void", invoiceId: "invoice-1", effectiveAt: "2026-09-02T12:00:00.000Z" },
    { id: "valid", type: "invoice", invoiceId: "invoice-2", effectiveAt: "2026-09-03T12:00:00.000Z" },
    { id: "payment", type: "payment", invoiceId: "invoice-2", effectiveAt: "2026-09-04T12:00:00.000Z" },
  ];
  assert.deepEqual(standardCustomerStatementEntries(history).map((entry) => entry.id), ["valid", "payment"]);
  assert.equal(history.length, 4);
});
