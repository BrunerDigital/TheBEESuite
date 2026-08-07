import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildBillingBalanceAudit,
  buildOpeningBalanceReversalPlan,
  LONGMONT_OPENING_BALANCE_REVERSAL_SOURCE,
  LONGMONT_OPENING_BALANCE_REVERSAL_TYPE,
  openingBalanceReversalExternalId,
  type BillingBalanceAuditInput,
} from "@/lib/billing-balance-audit";

function fixture(): BillingBalanceAuditInput {
  return {
    centerId: "center-longmont",
    familyId: "family-one",
    billingAccountId: "billing-one",
    balanceCents: 146_400,
    asOf: "2026-08-10T12:00:00.000Z",
    ledgerEntries: [
      {
        id: "ledger-procare-440",
        type: "procare_balance_reconciliation",
        description: "Longmont ProCare balance reconciled from account summary PDF",
        amountCents: 44_000,
        balanceAfterCents: 44_000,
        effectiveAt: "2026-08-03T15:00:00.000Z",
        createdAt: "2026-08-03T15:00:00.000Z",
        sourceSystem: "procare",
        externalId: "longmont-pdf:family-one:440",
        invoiceId: null,
        paymentId: null,
        metadata: { sourceAsOf: "2026-08-09", reconciledAt: "2026-08-03T15:00:00.000Z" },
      },
      {
        id: "ledger-invoice-440-past-due",
        type: "invoice_charge",
        description: "Past due balance",
        amountCents: 44_000,
        balanceAfterCents: 88_000,
        effectiveAt: "2026-08-04T15:00:00.000Z",
        createdAt: "2026-08-04T15:00:00.000Z",
        sourceSystem: "bee_suite",
        externalId: "invoice:past-due-440",
        invoiceId: "invoice-past-due-440",
        paymentId: null,
        metadata: {},
      },
      {
        id: "ledger-invoice-144",
        type: "invoice_charge",
        description: "Past due balance",
        amountCents: 14_400,
        balanceAfterCents: 102_400,
        effectiveAt: "2026-08-04T16:00:00.000Z",
        createdAt: "2026-08-04T16:00:00.000Z",
        sourceSystem: "bee_suite",
        externalId: "invoice:past-due-144",
        invoiceId: "invoice-past-due-144",
        paymentId: null,
        metadata: {},
      },
      {
        id: "ledger-invoice-weekly-440",
        type: "invoice_charge",
        description: "Weekly tuition",
        amountCents: 44_000,
        balanceAfterCents: 146_400,
        effectiveAt: "2026-08-05T15:00:00.000Z",
        createdAt: "2026-08-05T15:00:00.000Z",
        sourceSystem: "bee_suite",
        externalId: "invoice:weekly-440",
        invoiceId: "invoice-weekly-440",
        paymentId: null,
        metadata: {},
      },
    ],
    invoices: [
      { id: "invoice-past-due-440", number: "PAST-440", status: "OPEN", totalCents: 44_000, dueDate: "2026-08-01T12:00:00.000Z", createdAt: "2026-08-04T15:00:00.000Z", descriptions: ["Past due balance"] },
      { id: "invoice-past-due-144", number: "PAST-144", status: "OPEN", totalCents: 14_400, dueDate: "2026-08-01T12:00:00.000Z", createdAt: "2026-08-04T16:00:00.000Z", descriptions: ["Past due balance"] },
      { id: "invoice-weekly-440", number: "WEEK-440", status: "OPEN", totalCents: 44_000, dueDate: "2026-08-09T12:00:00.000Z", createdAt: "2026-08-05T15:00:00.000Z", descriptions: ["Weekly tuition"] },
    ],
    payments: [
      { id: "payment-preserved", status: "PAID", amountCents: 20_000, paidAt: "2026-08-02T12:00:00.000Z", provider: "stripe" },
    ],
  };
}

test("read-only Longmont audit identifies the duplicated 440 opening balance and future source date", () => {
  const audit = buildBillingBalanceAudit(fixture());
  assert.equal(audit.balanceCents, 146_400);
  assert.equal(audit.orderedLedgerTotalCents, 146_400);
  assert.equal(audit.openInvoiceTotalCents, 102_400);
  assert.equal(audit.succeededPaymentTotalCents, 20_000);
  assert.equal(audit.originalProcareEntries[0]?.amountCents, 44_000);
  assert.equal(audit.duplicateOpeningBalanceCandidates.some((candidate) => candidate.invoiceId === "invoice-past-due-440"), true);
  assert.equal(audit.flags.some((flag) => flag.code === "opening_balance_recreated_as_invoice"), true);
  assert.equal(audit.flags.some((flag) => flag.code === "future_source_as_of"), true);
});

test("guarded reversal plan is exact, idempotent, and preserves invoices and payments", () => {
  const input = fixture();
  const audit = buildBillingBalanceAudit(input);
  const preconditions = {
    centerId: input.centerId,
    familyId: input.familyId,
    billingAccountId: input.billingAccountId,
    originalLedgerEntryId: "ledger-procare-440",
    expectedCurrentBalanceCents: 146_400,
    expectedOpenInvoiceTotalCents: 102_400,
    expectedSourceFingerprint: audit.sourceFingerprint,
  };
  const plan = buildOpeningBalanceReversalPlan(audit, preconditions);
  assert.equal(plan.status, "ready");
  assert.equal(plan.reversalAmountCents, -44_000);
  assert.equal(plan.expectedBalanceAfterCents, 102_400);
  assert.deepEqual(plan.preservedInvoiceIds, input.invoices.map((invoice) => invoice.id));
  assert.deepEqual(plan.preservedPaymentIds, input.payments.map((payment) => payment.id));

  const afterAudit = buildBillingBalanceAudit({
    ...input,
    balanceCents: 102_400,
    ledgerEntries: [
      ...input.ledgerEntries,
      {
        id: "ledger-reversal",
        type: LONGMONT_OPENING_BALANCE_REVERSAL_TYPE,
        description: "Compensating reversal",
        amountCents: -44_000,
        balanceAfterCents: 102_400,
        effectiveAt: "2026-08-10T13:00:00.000Z",
        createdAt: "2026-08-10T13:00:00.000Z",
        sourceSystem: LONGMONT_OPENING_BALANCE_REVERSAL_SOURCE,
        externalId: openingBalanceReversalExternalId("ledger-procare-440"),
        invoiceId: null,
        paymentId: null,
        metadata: {},
      },
    ],
  });
  const secondPlan = buildOpeningBalanceReversalPlan(afterAudit, preconditions);
  assert.equal(secondPlan.status, "already_applied");
  assert.deepEqual(secondPlan.preservedInvoiceIds, plan.preservedInvoiceIds);
  assert.deepEqual(secondPlan.preservedPaymentIds, plan.preservedPaymentIds);

  const wrongScopePlan = buildOpeningBalanceReversalPlan(afterAudit, { ...preconditions, familyId: "another-family" });
  assert.equal(wrongScopePlan.status, "blocked");
  assert.match(wrongScopePlan.errors.join(" "), /Family precondition/);
});

test("apply path is locked behind exact scope, history, balance, and fingerprint confirmations", () => {
  const script = readFileSync(new URL("../scripts/audit-longmont-billing-account.ts", import.meta.url), "utf8");
  assert.match(script, /--confirm-longmont-opening-balance-reversal/);
  assert.match(script, /--confirm-preserve-invoices-payments-access/);
  assert.match(script, /--expected-current-balance-cents/);
  assert.match(script, /--expected-open-invoice-total-cents/);
  assert.match(script, /--expected-source-fingerprint/);
  assert.match(script, /--confirm-plan-fingerprint/);
  assert.match(script, /LONGMONT_OPENING_BALANCE_REVERSAL_TYPE/);
  assert.match(script, /invoicesMutated: false/);
  assert.match(script, /paymentsMutated: false/);
  assert.match(script, /parentAccessMutated: false/);
});
