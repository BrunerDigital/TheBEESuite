import { type PaymentStatus } from "@prisma/client";
import { isActiveStripeAutopayPayment, isActiveStripeCheckoutPayment, isActiveStripeFamilyBalancePayment, isActiveStripeTerminalPayment, jsonRecord } from "./billing-guardrails";

export type StripePaymentClaimScope = "family_balance" | "invoice_collection";

type StripePaymentClaimCandidate = {
  id: string;
  status: PaymentStatus;
  provider: string;
  customFields: unknown;
};

export function stripePaymentClaimConflict({
  scope,
  invoiceId,
  payment,
}: {
  scope: StripePaymentClaimScope;
  invoiceId?: string | null;
  payment: StripePaymentClaimCandidate;
}) {
  const fields = jsonRecord(payment.customFields);
  const validInvoiceId = typeof fields.invoiceId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(fields.invoiceId);
  const activeProviderAttempt = isActiveStripeCheckoutPayment(payment) || isActiveStripeAutopayPayment(payment) || isActiveStripeTerminalPayment(payment)
    || isActiveStripeFamilyBalancePayment({ ...payment, customFields: { ...fields, paymentScope: "family_balance" } });
  if (!activeProviderAttempt) return null;
  // An active provider attempt with ambiguous attribution still reserves this
  // account. It cannot authorize a new collection or label any invoice paid.
  // Director saved-method attempts collect the family balance, including legacy
  // rows without explicit scope. Stale invoice metadata cannot narrow that hold.
  if (fields.paymentScope === "family_balance" || (typeof fields.status === "string" && fields.status.startsWith("director_saved_method_"))) return "active_family_balance" as const;
  if (!validInvoiceId) return "active_unattributed_payment" as const;
  if (scope === "invoice_collection") {
    return invoiceId && fields.invoiceId === invoiceId ? "active_invoice_payment" as const : null;
  }
  return "active_invoice_collection" as const;
}
