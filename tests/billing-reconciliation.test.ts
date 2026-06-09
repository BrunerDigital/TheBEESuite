import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLedgerReconciliationReport } from "../src/lib/billing-reconciliation";

test("ledger reconciliation groups charges, credits, and account balance variance", () => {
  const report = buildLedgerReconciliationReport({
    accounts: [
      { id: "acct_1", familyName: "Baker Family", balanceCents: 150 },
      { id: "acct_2", familyName: "Clark Family", balanceCents: 0 },
      { id: "acct_3", familyName: "Davis Family", balanceCents: 250 },
    ],
    entries: [
      {
        billingAccountId: "acct_1",
        type: "invoice",
        amountCents: 1000,
        balanceAfterCents: 1000,
        effectiveAt: "2026-06-01T12:00:00.000Z",
      },
      {
        billingAccountId: "acct_1",
        type: "payment",
        amountCents: -850,
        balanceAfterCents: 150,
        effectiveAt: "2026-06-02T12:00:00.000Z",
      },
      {
        billingAccountId: "acct_2",
        type: "invoice",
        amountCents: 500,
        balanceAfterCents: 500,
        effectiveAt: "2026-06-01T12:00:00.000Z",
      },
      {
        billingAccountId: "acct_2",
        type: "credit",
        amountCents: -500,
        balanceAfterCents: 0,
        effectiveAt: "2026-06-03T12:00:00.000Z",
      },
    ],
  });

  assert.equal(report.invoiceChargeCents, 1500);
  assert.equal(report.parentPaymentCreditCents, 850);
  assert.equal(report.adjustmentCreditCents, 500);
  assert.equal(report.netLedgerActivityCents, 150);
  assert.equal(report.accountBalanceCents, 400);
  assert.equal(report.latestLedgerBalanceCents, 150);
  assert.equal(report.balanceVarianceCents, 250);
  assert.equal(report.accountsOutOfBalance.length, 1);
  assert.equal(report.accountsOutOfBalance[0]?.familyName, "Davis Family");
  assert.equal(report.isBalanced, false);
});

test("ledger reconciliation uses the latest balance per account", () => {
  const report = buildLedgerReconciliationReport({
    accounts: [{ id: "acct_1", balanceCents: 175 }],
    entries: [
      {
        billingAccountId: "acct_1",
        type: "invoice",
        amountCents: 250,
        balanceAfterCents: 250,
        effectiveAt: "2026-06-01T12:00:00.000Z",
      },
      {
        billingAccountId: "acct_1",
        type: "payment",
        amountCents: -75,
        balanceAfterCents: 175,
        effectiveAt: "2026-06-04T12:00:00.000Z",
      },
    ],
  });

  assert.equal(report.latestLedgerBalanceCents, 175);
  assert.equal(report.balanceVarianceCents, 0);
  assert.equal(report.accountsOutOfBalance.length, 0);
  assert.equal(report.isBalanced, true);
});
