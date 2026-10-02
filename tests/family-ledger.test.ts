import assert from "node:assert/strict";
import test from "node:test";
import { filterFamilyLedgerEntries, filterLedgerEntriesByDateRange, reconciledFamilyLedgerEntries, standardCustomerStatementEntries } from "../src/lib/family-ledger";
import { readFileSync } from "node:fs";

const entries = [
  { id: "harris-1", billingAccount: { family: { id: "harris" } } },
  { id: "davis-1", billingAccount: { family: { id: "davis" } } },
  { id: "harris-2", billingAccount: { family: { id: "harris" } } },
];

test("backdated payments display effective-date carryforward without changing posting snapshots", () => {
  const history = [
    { id: "next", amountCents: 5120, balanceAfterCents: 10240, effectiveAt: "2026-09-17" },
    { id: "cash", amountCents: -5200, balanceAfterCents: 5040, effectiveAt: "2026-09-16" },
    { id: "prior", amountCents: 5120, balanceAfterCents: 5120, effectiveAt: "2026-09-10" },
  ];
  const displayed = reconciledFamilyLedgerEntries(history, 5040);
  assert.deepEqual(displayed.map(entry => entry.balanceAfterCents), [5040, -80, 5120]);
  assert.equal(history[1].balanceAfterCents, 5040);
  assert.deepEqual(displayed.map(entry => entry.id), history.map(entry => entry.id));
});

test("partial ledgers and unknown imported opening balances retain original snapshots", () => {
  const history = [{ id: "payment", amountCents: -100, balanceAfterCents: 900, effectiveAt: "2026-09-10" }];
  assert.deepEqual(reconciledFamilyLedgerEntries(history, 900), history);
  assert.deepEqual(reconciledFamilyLedgerEntries(history, null), history);
});

test("same-time entries use posting time and ID to resolve ordering", () => {
  const history = [
    { id: "b", amountCents: -100, balanceAfterCents: null, effectiveAt: "2026-09-10", createdAt: "2026-09-11" },
    { id: "a", amountCents: 200, balanceAfterCents: null, effectiveAt: "2026-09-10", createdAt: "2026-09-10" },
  ];
  assert.deepEqual(reconciledFamilyLedgerEntries(history, 100).map(entry => entry.balanceAfterCents), [100, 200]);
});

test("invalid dates and amounts fail closed to original snapshots", () => {
  const history = [{ id: "bad", amountCents: 100, balanceAfterCents: 100, effectiveAt: "invalid" }];
  assert.deepEqual(reconciledFamilyLedgerEntries(history, 100), history);
});

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
    { id: "chargeback", type: "chargeback", effectiveAt: "2026-09-05T12:00:00.000Z" },
    { id: "chargeback-reversal", type: "chargeback_reversal", effectiveAt: "2026-09-06T12:00:00.000Z" },
  ];
  assert.deepEqual(
    standardCustomerStatementEntries(history).map((entry) => entry.id),
    ["valid", "payment", "chargeback", "chargeback-reversal"],
  );
  assert.equal(history.length, 6);
});

test("family statement date ranges resolve the selected family's school time zone", () => {
  const component = readFileSync(new URL("../src/components/family-ledger-card.tsx", import.meta.url), "utf8");
  assert.match(component, /useSchoolTimeZoneResolver/);
  assert.match(component, /resolveSchoolTimeZone\(selectedCenterId\)/);
  assert.match(component, /selectedFamily\?\.centerId/);
  assert.match(component, /currentBalanceCents = selectedAccount\?\.balanceCents/);
  assert.match(component, /familyName=\{selectedAccount\?\.familyName/);
});
