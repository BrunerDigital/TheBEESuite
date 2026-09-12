import type { ComponentProps } from "react";
import type { ParentPortalWorkspace } from "../../src/components/parent-portal-workspace";
import { executiveParentPortalDemo } from "../../src/lib/executive-demo-data";
import { parentPaymentStatus } from "../../src/lib/parent-payment-status";
import { provisionalAchCreditCents } from "../../src/lib/ach-payment-lifecycle";

// Fake props only. Never imported by the production application.
export function parentPaymentFixture(scenario: string): Partial<ComponentProps<typeof ParentPortalWorkspace>> {
  const terminal = scenario.startsWith("terminal"), family = scenario === "family";
  const status = scenario === "ach" ? "paid_processing" : scenario === "inactive" ? "checkout_failed"
    : terminal ? scenario === "terminal-unknown" ? "terminal_submission_unknown" : "terminal_processing"
    : ["unknown", "mixed", "hidden", "family"].includes(scenario) ? "checkout_submission_unknown" : "checkout_created";
  const payment = { id: "fake-payment", amountCents: 5000, status: scenario === "settled" ? "PAID" as const : "DRAFT" as const,
    provider: scenario === "manual" ? "manual" : terminal ? "stripe_terminal" : "stripe",
    customFields: { status, invoiceId: family ? null : "fake-pending-invoice", paymentScope: family ? "family_balance" : "invoice",
      paymentMethodCategory: scenario === "ach" ? "ach" : "card", stripePaymentIntentStatus: scenario === "ach" ? "processing" : null } };
  const summary = parentPaymentStatus([payment]), provisionalCreditCents = provisionalAchCreditCents([payment]);
  const invoice = { ...executiveParentPortalDemo.invoices[0], id: "fake-pending-invoice", number: "FAKE-PENDING", status: "OPEN",
    familyDocumentAmountCents: 5000, pendingPayment: summary.byInvoiceId.get("fake-pending-invoice") };
  const product = { ...invoice, id: "fake-product-invoice", number: "FAKE-PRODUCT", pendingPayment: null, productCheckoutAvailable: true, purposeLabel: "Fake uniform" };
  const invoices = scenario === "hidden" ? [product] : ["mixed", "family", "clear-products"].includes(scenario) ? [invoice, product, ...(scenario === "clear-products" ? [{ ...product, id: "fake-product-other", number: "FAKE-OTHER" }, { ...product, id: "fake-product-third", number: "FAKE-THIRD" }] : [])] : [invoice];
  const clear = ["clear-products", "credit", "review"].includes(scenario);
  return { invoices: clear ? invoices.map(item => ({ ...item, pendingPayment: null })) : invoices,
    billingAccount: { ...executiveParentPortalDemo.billingAccount, balanceCents: scenario === "credit" ? -2500 : 10000 - provisionalCreditCents },
    parentBalanceReviewRequired: scenario === "review", parentBalanceVisibilityConfirmed: false,
    accountPaymentBlocker: clear ? null : summary.accountPaymentBlocker, attentionSummary: { openInvoiceCount: invoices.length, unacknowledgedIncidentCount: 0 },
    paymentActivitySummary: { pendingCount: payment.status === "DRAFT" ? 1 : 0, provisionalCreditCents },
    payments: [], ledgerEntries: [], uniformProducts: scenario === "family" ? [{ id: "fake-uniform-option", productId: "fake-uniform", name: "Fake uniform", type: "uniform", amountCents: 1000, color: "Black", size: "2T", purchaseOption: "single", shirtCount: 1 }] : [] };
}
