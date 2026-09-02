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
  return fields.status === "checkout_pending"
    || fields.status === "checkout_created"
    || fields.status === "paid_processing";
}

export function isActiveStripeFamilyBalancePayment(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  if (payment.status !== PaymentStatus.DRAFT) return false;
  const fields = jsonRecord(payment.customFields);
  if (fields.paymentScope !== "family_balance") return false;
  if (payment.provider === "stripe_terminal") return isActiveStripeTerminalPayment(payment);
  if (payment.provider !== "stripe") return false;
  return isActiveStripeCheckoutPayment(payment)
    || fields.status === "checkout_submission_unknown"
    || fields.status === "director_saved_method_pending"
    || fields.status === "director_saved_method_processing"
    || fields.status === "director_saved_method_succeeded_pending_webhook"
    || fields.status === "director_saved_method_submission_unknown";
}

export function isStripeSubmissionUnknownPayment(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  if (payment.status !== PaymentStatus.DRAFT) return false;
  const status = jsonRecord(payment.customFields).status;
  return status === "autopay_submission_unknown"
    || status === "stored_method_submission_unknown"
    || status === "checkout_submission_unknown"
    || status === "director_saved_method_submission_unknown"
    || status === "terminal_submission_unknown"
    || status === "terminal_reader_submission_unknown";
}

export function isActiveStripeTerminalPayment(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  if (payment.provider !== "stripe_terminal" || payment.status !== PaymentStatus.DRAFT) return false;
  const status = jsonRecord(payment.customFields).status;
  return typeof status === "string" && status.startsWith("terminal_") && status !== "terminal_failed";
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberLikeField(value: unknown) {
  const direct = numberField(value);
  if (direct !== null) return direct;
  const text = stringField(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
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
    checkoutTotalCents: numberLikeField(fields.checkoutTotalCents),
    feeDisclosureVersion: stringField(fields.feeDisclosureVersion),
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
  const confirmedBankProcessing = summary.status === "paid_processing"
    || summary.stripePaymentIntentStatus === "processing";
  if (isBankPayment && confirmedBankProcessing) {
    return scope === "family_balance"
      ? "A bank payment is already processing for this family balance and is marked Paid — processing. It can take a few business days to settle."
      : "A bank payment is already processing for this invoice and is marked Paid — processing. It can take a few business days to settle.";
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
    fields.status === "autopay_submission_unknown" ||
    fields.status === "stored_method_pending" ||
    fields.status === "stored_method_processing" ||
    fields.status === "stored_method_succeeded_pending_webhook" ||
    fields.status === "stored_method_submission_unknown";
}

export function activeStripeAccountCreditReservationCents(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  if (!isActiveStripeAutopayPayment(payment) && !isActiveStripeTerminalPayment(payment)) return 0;
  const value = numberLikeField(jsonRecord(payment.customFields).accountCreditAppliedCents);
  return value === null ? 0 : Math.max(0, Math.round(value));
}

export function stripePaymentIntentFailureDisposition({
  collectionMode,
  customFields,
}: {
  collectionMode?: string | null;
  customFields?: unknown;
}) {
  const fields = jsonRecord(customFields);
  const normalizedCollectionMode = stringField(collectionMode);
  const failedStatus = normalizedCollectionMode === "autopay"
    ? "autopay_failed"
    : normalizedCollectionMode === "stored_method"
      ? "stored_method_failed"
      : normalizedCollectionMode === "director_saved_method"
        ? "director_saved_method_failed"
        : "payment_intent_failed";
  const checkoutStatus = stringField(fields.status);
  const checkoutSessionId = stringField(fields.stripeCheckoutSessionId);
  const recoverableCheckout = Boolean(checkoutSessionId)
    && (checkoutStatus === "checkout_created" || checkoutStatus === "checkout_pending")
    && normalizedCollectionMode !== "autopay"
    && normalizedCollectionMode !== "stored_method"
    && normalizedCollectionMode !== "director_saved_method";
  return {
    paymentStatus: recoverableCheckout ? PaymentStatus.DRAFT : PaymentStatus.FAILED,
    customStatus: recoverableCheckout ? "checkout_created" : failedStatus,
    recoverableCheckout,
  };
}

export function checkoutApplicationGuard(input: {
  invoiceStatus: PaymentStatus;
  invoiceBillingAccountId: string;
  invoiceTotalCents: number;
  paymentStatus: PaymentStatus;
  paymentBillingAccountId: string;
  paymentAmountCents: number;
  accountCreditAppliedCents?: number;
}) {
  if (input.invoiceStatus !== PaymentStatus.OPEN) {
    return { ok: false as const, reason: "invoice_not_open" };
  }
  if (input.paymentStatus === PaymentStatus.PAID) {
    return { ok: false as const, reason: "payment_already_applied" };
  }
  if (input.invoiceBillingAccountId !== input.paymentBillingAccountId) {
    return { ok: false as const, reason: "billing_account_mismatch" };
  }
  const accountCreditAppliedCents = Math.max(0, Math.round(input.accountCreditAppliedCents ?? 0));
  if (input.invoiceTotalCents !== input.paymentAmountCents + accountCreditAppliedCents) {
    return { ok: false as const, reason: "amount_mismatch" };
  }
  return { ok: true as const };
}
