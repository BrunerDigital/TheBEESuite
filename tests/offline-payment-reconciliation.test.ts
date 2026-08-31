import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { planHistoricalOfflineInvoiceReconciliation } from "../src/lib/offline-payment-reconciliation";

const invoice = (id: string, totalCents: number, dueAt: string) => ({
  id,
  totalCents,
  dueAt,
  createdAt: `${dueAt.slice(0, 10)}T12:00:00.000Z`,
});

test("historical offline reconciliation closes only fully covered oldest invoices", () => {
  const result = planHistoricalOfflineInvoiceReconciliation({
    visibleBalanceCents: 31_500,
    payments: [{ id: "payment-530", amountCents: 53_000, postedAt: "2026-08-21T00:00:00.000Z" }],
    invoices: [
      invoice("week-33", 21_500, "2026-08-07T00:00:00.000Z"),
      invoice("week-34", 21_500, "2026-08-13T00:00:00.000Z"),
      invoice("week-35", 21_500, "2026-08-20T00:00:00.000Z"),
      invoice("week-36", 21_500, "2026-08-27T00:00:00.000Z"),
    ],
  });

  assert.equal(result.settlementBudgetCents, 53_000);
  assert.equal(result.invoiceClosureTotalCents, 43_000);
  assert.deepEqual(result.closures.map((item) => item.invoiceId), ["week-33", "week-34"]);
  assert.equal(result.paymentAllocations[0]?.remainingCents, 10_000);
});

test("multiple offline payments combine and attribute an invoice to the completing payment", () => {
  const result = planHistoricalOfflineInvoiceReconciliation({
    visibleBalanceCents: 0,
    payments: [
      { id: "cash-1", amountCents: 10_000, postedAt: "2026-08-01T00:00:00.000Z" },
      { id: "cash-2", amountCents: 20_000, postedAt: "2026-08-02T00:00:00.000Z" },
    ],
    invoices: [invoice("invoice-1", 15_000, "2026-08-01T00:00:00.000Z")],
  });

  assert.equal(result.invoiceClosureTotalCents, 15_000);
  assert.equal(result.closures[0]?.completedByPaymentId, "cash-2");
  assert.equal(result.paymentAllocations[0]?.invoiceClosureContributionCents, 10_000);
  assert.equal(result.paymentAllocations[1]?.invoiceClosureContributionCents, 5_000);
  assert.deepEqual(result.paymentAllocations[1]?.completedInvoiceIds, ["invoice-1"]);
});

test("current visible balance caps historical payment reuse", () => {
  const result = planHistoricalOfflineInvoiceReconciliation({
    visibleBalanceCents: 20_000,
    payments: [{ id: "cash", amountCents: 30_000, postedAt: "2026-08-01T00:00:00.000Z" }],
    invoices: [invoice("invoice", 20_000, "2026-08-01T00:00:00.000Z")],
  });

  assert.equal(result.settlementBudgetCents, 0);
  assert.equal(result.closures.length, 0);
});

test("partial coverage never marks an invoice paid", () => {
  const result = planHistoricalOfflineInvoiceReconciliation({
    visibleBalanceCents: 5_000,
    payments: [{ id: "check", amountCents: 10_000, postedAt: "2026-08-01T00:00:00.000Z" }],
    invoices: [invoice("invoice", 15_000, "2026-08-01T00:00:00.000Z")],
  });

  assert.equal(result.settlementBudgetCents, 10_000);
  assert.equal(result.invoiceClosureTotalCents, 0);
  assert.equal(result.paymentAllocations[0]?.remainingCents, 10_000);
});

test("fleet reconciliation is dry-run by default and guarded at apply time", () => {
  const source = readFileSync("scripts/reconcile-historical-offline-invoice-applications.ts", "utf8");
  assert.match(source, /--confirm-historical-offline-invoice-reconciliation/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /changed after preview; reconciliation aborted/);
  assert.match(source, /balanceCentsChanged: false/);
  assert.match(source, /paymentHistoryPreserved: true/);
  assert.match(source, /ledgerHistoryPreserved: true/);
  assert.doesNotMatch(source, /tx\.billingAccount\.update/);
  assert.doesNotMatch(source, /tx\.ledgerEntry\.(?:create|update|delete)/);
});
