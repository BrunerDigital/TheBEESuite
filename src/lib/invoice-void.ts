import { PaymentStatus } from "@prisma/client";
import { isActiveStripeAutopayPayment, isActiveStripeCheckoutPayment } from "@/lib/billing-guardrails";

type InvoiceVoidLedgerEntry = {
  amountCents: number;
  paymentId?: string | null;
};

type InvoiceVoidPayment = {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
};

export function invoiceLedgerBalanceCents(entries: readonly InvoiceVoidLedgerEntry[]) {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}

export function invoiceVoidBlocker(input: {
  status: PaymentStatus;
  totalCents: number;
  sourceSystem?: string | null;
  externalId?: string | null;
  customFields?: unknown;
  ledgerEntries: readonly InvoiceVoidLedgerEntry[];
  payments: readonly InvoiceVoidPayment[];
}) {
  if (input.status !== PaymentStatus.OPEN) return "Only open invoices can be voided.";
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) return "This invoice does not have a valid amount to reverse.";
  if (input.ledgerEntries.some((entry) => Boolean(entry.paymentId))) {
    return "This invoice has payment activity and cannot be voided. Review or refund the payment instead.";
  }
  if (invoiceLedgerBalanceCents(input.ledgerEntries) !== input.totalCents) {
    return "This invoice has adjustments or credits that require billing support review before it can be voided.";
  }
  if (input.payments.some((payment) =>
    payment.status === PaymentStatus.DRAFT || isActiveStripeCheckoutPayment(payment) || isActiveStripeAutopayPayment(payment)
  )) {
    return "A payment or checkout is pending for this family. Let it finish or expire before voiding the invoice.";
  }
  const fields = input.customFields && typeof input.customFields === "object" && !Array.isArray(input.customFields)
    ? input.customFields as Record<string, unknown>
    : {};
  if (
    input.sourceSystem?.toLowerCase().includes("stripe") ||
    input.externalId?.startsWith("in_") ||
    typeof fields.stripeInvoiceId === "string"
  ) {
    return "This invoice is managed by Stripe and must be voided through the provider workflow.";
  }
  return null;
}
