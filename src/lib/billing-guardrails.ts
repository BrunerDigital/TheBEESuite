import { PaymentStatus } from "@prisma/client";

export function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isActiveStripeCheckoutPayment(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  if (payment.provider !== "stripe" || payment.status !== PaymentStatus.DRAFT) return false;
  const fields = jsonRecord(payment.customFields);
  return fields.status === "checkout_pending" || fields.status === "checkout_created";
}

export function isActiveStripeAutopayPayment(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  if (payment.provider !== "stripe" || payment.status !== PaymentStatus.DRAFT) return false;
  const fields = jsonRecord(payment.customFields);
  return fields.status === "autopay_pending" ||
    fields.status === "autopay_processing" ||
    fields.status === "autopay_succeeded_pending_webhook" ||
    fields.status === "stored_method_pending" ||
    fields.status === "stored_method_processing" ||
    fields.status === "stored_method_succeeded_pending_webhook";
}

export function checkoutApplicationGuard(input: {
  invoiceStatus: PaymentStatus;
  invoiceBillingAccountId: string;
  invoiceTotalCents: number;
  paymentStatus: PaymentStatus;
  paymentBillingAccountId: string;
  paymentAmountCents: number;
}) {
  if (input.invoiceStatus === PaymentStatus.PAID) {
    return { ok: false as const, reason: "invoice_already_paid" };
  }
  if (input.paymentStatus === PaymentStatus.PAID) {
    return { ok: false as const, reason: "payment_already_applied" };
  }
  if (input.invoiceBillingAccountId !== input.paymentBillingAccountId) {
    return { ok: false as const, reason: "billing_account_mismatch" };
  }
  if (input.invoiceTotalCents !== input.paymentAmountCents) {
    return { ok: false as const, reason: "amount_mismatch" };
  }
  return { ok: true as const };
}
