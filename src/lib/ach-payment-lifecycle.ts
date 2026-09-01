type PaymentLifecycleRecord = {
  amountCents: number;
  status: string;
  provider: string;
  customFields?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function paymentMethodCategory(fields: Record<string, unknown>) {
  return text(fields.paymentMethodCategory) || text(fields.requestedPaymentMethodCategory);
}

const ACH_PROCESSING_STATUSES = new Set([
  "paid_processing",
  "checkout_pending",
  "autopay_processing",
  "stored_method_processing",
  "director_saved_method_processing",
]);

const ACH_RETURN_REASONS = new Set([
  "insufficient_funds",
  "incorrect_account_details",
  "bank_cannot_process",
  "bank_can't_process",
]);

export function isAchPaymentProcessing(payment: PaymentLifecycleRecord) {
  if (text(payment.provider) !== "stripe" || text(payment.status) !== "draft") return false;
  const fields = record(payment.customFields);
  if (paymentMethodCategory(fields) !== "ach") return false;
  const lifecycleStatus = text(fields.status);
  const stripeStatus = text(fields.stripePaymentIntentStatus);
  return lifecycleStatus === "paid_processing"
    || (ACH_PROCESSING_STATUSES.has(lifecycleStatus) && stripeStatus === "processing");
}

export function provisionalAchCreditCents(payments: PaymentLifecycleRecord[]) {
  return payments.reduce(
    (total, payment) => total + (isAchPaymentProcessing(payment) ? Math.max(0, Math.round(payment.amountCents)) : 0),
    0,
  );
}

export function visibleBalanceAfterProvisionalAchCredit(balanceCents: number, pendingCreditCents: number) {
  const balance = Math.round(balanceCents);
  if (balance <= 0) return balance;
  return Math.max(0, balance - Math.max(0, Math.round(pendingCreditCents)));
}

export function achFailurePresentation(input: {
  customFields?: unknown;
  metadata?: unknown;
  failureCode?: string | null;
}) {
  const fields = { ...record(input.customFields), ...record(input.metadata) };
  const category = paymentMethodCategory(fields);
  const previousStatus = text(record(input.customFields).status);
  const failureCode = text(input.failureCode);
  const returned = category === "ach" && (
    previousStatus === "payment_returned"
    || previousStatus === "ach_returned"
    || previousStatus === "paid_processing"
    || previousStatus === "checkout_pending"
    || previousStatus.endsWith("_processing")
    || text(record(input.customFields).stripePaymentIntentStatus) === "processing"
  );
  return {
    returned,
    retryAvailable: returned && failureCode === "insufficient_funds",
    failureCode: failureCode || null,
    customStatus: returned ? "payment_returned" : null,
  };
}

export function isReturnedStripePayment(payment: Pick<PaymentLifecycleRecord, "status" | "provider" | "customFields">) {
  if (text(payment.provider) !== "stripe") return false;
  const fields = record(payment.customFields);
  const lifecycleStatus = text(fields.status);
  const disputeReason = text(fields.stripeDisputeReason);
  return lifecycleStatus === "payment_returned"
    || (fields.stripeDisputeLedgerActive === true && ACH_RETURN_REASONS.has(disputeReason));
}

export function returnedPaymentRetryAvailable(payment: Pick<PaymentLifecycleRecord, "status" | "provider" | "customFields">) {
  if (!isReturnedStripePayment(payment)) return false;
  const fields = record(payment.customFields);
  return fields.retryAvailable === true
    || text(fields.stripeFailureCode) === "insufficient_funds"
    || text(fields.stripeDisputeReason) === "insufficient_funds";
}

export function isAchReturnReason(reason: unknown) {
  return ACH_RETURN_REASONS.has(text(reason));
}
