import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountsReceivableSnapshot } from "../src/lib/accounts-receivable";

test("AR flags genuine unsettled ACH without settling or reducing an overdue ledger balance", () => {
  const snapshot = buildAccountsReceivableSnapshot([{
    id: "family", name: "Test family", centerId: "school",
    billingAccount: {
      id: "account", balanceCents: 25000,
      invoices: [{ id: "invoice", dueDate: new Date("2026-09-01T00:00:00Z") }],
      payments: [
        { amountCents: 25000, status: "DRAFT", provider: "stripe", customFields: { paymentMethodCategory: "ach", status: "checkout_pending", stripePaymentIntentStatus: "processing" } },
        { amountCents: 25000, status: "DRAFT", provider: "stripe", customFields: { paymentMethodCategory: "ach", status: "checkout_pending" } },
        { amountCents: 25000, status: "FAILED", provider: "stripe", customFields: { paymentMethodCategory: "ach", stripePaymentIntentStatus: "processing" } },
        { amountCents: 25000, status: "VOID", provider: "stripe", customFields: { paymentMethodCategory: "ach", status: "paid_processing" } },
      ],
    },
  }], { school: "Test school" }, new Date("2026-10-02T12:00:00Z"));
  const account = snapshot.accounts[0];
  assert.equal(account.processingPaymentCount, 1);
  assert.equal(account.processingPaymentCents, 25000);
  assert.equal(account.balanceCents, 25000);
  assert.equal(account.overdueInvoiceCount, 1);
  assert.equal(snapshot.totalOwedCents, 25000);
});
