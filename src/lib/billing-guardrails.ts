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

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function activeStripeCheckoutPaymentSummary(payment: {
  id: string;
  amountCents?: number | null;
  externalIdPlaceholder?: string | null;
  customFields?: unknown;
}) {
  const fields = jsonRecord(payment.customFields);
  const checkoutSessionId = stringField(fields.stripeCheckoutSessionId)
    || (stringField(payment.externalIdPlaceholder)?.startsWith("cs_") ? stringField(payment.externalIdPlaceholder) : null);
  return {
    id: payment.id,
    amountCents: numberField(payment.amountCents),
    status: stringField(fields.status),
    paymentMethodCategory: stringField(fields.paymentMethodCategory),
    requestedPaymentMethodCategory: stringField(fields.requestedPaymentMethodCategory),
    bankAccountVerificationMethod: stringField(fields.bankAccountVerificationMethod),
    stripeCheckoutSessionId: checkoutSessionId,
    stripePaymentIntentId: stringField(fields.stripePaymentIntentId),
    stripePaymentIntentStatus: stringField(fields.stripePaymentIntentStatus),
    stripePaymentStatus: stringField(fields.stripePaymentStatus),
  };
}

export function activeStripeCheckoutPaymentMessage(
  payment: {
    id: string;
    amountCents?: number | null;
    externalIdPlaceholder?: string | null;
    customFields?: unknown;
  },
  scope: "invoice" | "family_balance" = "invoice",
) {
  const summary = activeStripeCheckoutPaymentSummary(payment);
  const category = summary.paymentMethodCategory || summary.requestedPaymentMethodCategory;
  const isBankPayment = category === "ach" || category === "link_bank" || Boolean(summary.bankAccountVerificationMethod);
  if (isBankPayment) {
    return scope === "family_balance"
      ? "A bank payment is already processing for this family balance. ACH bank payments can take a few business days to finish; the balance will update after the processor confirms it."
      : "A bank payment is already processing for this invoice. ACH bank payments can take a few business days to finish; the invoice will update after the processor confirms it.";
  }
  return scope === "family_balance"
    ? "A balance checkout session is already pending for this family. Complete or expire it before creating another balance checkout."
    : "A checkout session is already pending for this invoice. Complete or expire it before creating another payment session.";
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
