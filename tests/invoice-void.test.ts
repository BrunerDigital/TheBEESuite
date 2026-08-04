import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PaymentStatus } from "@prisma/client";
import { invoiceLedgerBalanceCents, invoiceVoidBlocker } from "@/lib/invoice-void";

const base = {
  status: PaymentStatus.OPEN,
  totalCents: 18_900,
  sourceSystem: "bee_suite",
  externalId: null,
  customFields: {},
  ledgerEntries: [{ amountCents: 18_900, paymentId: null }],
  payments: [],
};

test("an unpaid internal open invoice can be voided", () => {
  assert.equal(invoiceVoidBlocker(base), null);
  assert.equal(invoiceLedgerBalanceCents(base.ledgerEntries), 18_900);
});

test("invoice voiding blocks paid, adjusted, pending, and provider-managed invoices", () => {
  assert.match(invoiceVoidBlocker({ ...base, status: PaymentStatus.PAID }) ?? "", /Only open/);
  assert.match(invoiceVoidBlocker({ ...base, ledgerEntries: [{ amountCents: 18_900, paymentId: "payment_1" }] }) ?? "", /payment activity/);
  assert.match(invoiceVoidBlocker({ ...base, ledgerEntries: [{ amountCents: 10_000, paymentId: null }] }) ?? "", /adjustments or credits/);
  assert.match(invoiceVoidBlocker({
    ...base,
    payments: [{ status: PaymentStatus.DRAFT, provider: "stripe", customFields: { status: "checkout_pending" } }],
  }) ?? "", /payment or checkout is pending/);
  assert.match(invoiceVoidBlocker({ ...base, externalId: "in_provider" }) ?? "", /managed by Stripe/);
});

test("director invoice voiding stays school-scoped, audited, and explicit in the workbench", async () => {
  const [route, workbench] = await Promise.all([
    readFile("src/app/api/billing/invoices/route.ts", "utf8"),
    readFile("src/components/billing-workbench.tsx", "utf8"),
  ]);
  assert.match(route, /canManageBilling\(user\)/);
  assert.match(route, /canAccessCenter\(user, centerId\)/);
  assert.match(route, /invoiceVoidBlocker/);
  assert.match(route, /TransactionIsolationLevel\.Serializable/);
  assert.match(route, /action: "billing\.invoice\.voided"/);
  assert.match(workbench, /mode: "void"/);
  assert.match(workbench, /Void Invoice/);
  assert.match(workbench, /No family charge \/ CCDF \/ voucher-funded \(\$0\.00\)/);
});
