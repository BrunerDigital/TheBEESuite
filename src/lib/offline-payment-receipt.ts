function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readOfflinePaymentReceipt(value: unknown, operation: { requestId: string; familyId: string }) {
  const response = record(value);
  const payment = record(response.payment);
  const entry = record(response.entry);
  const fields = record(payment.customFields);
  const amountCents = payment.amountCents;
  if (response.ok !== true || typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0
    || response.totalCents !== amountCents || typeof payment.id !== "string" || !payment.id
    || typeof payment.billingAccountId !== "string" || !payment.billingAccountId
    || payment.status !== "PAID" || (payment.provider !== "manual_cash" && payment.provider !== "manual_check")
    || fields.requestId !== operation.requestId || fields.familyId !== operation.familyId
    || typeof entry.id !== "string" || !entry.id || entry.paymentId !== payment.id
    || entry.billingAccountId !== payment.billingAccountId || entry.amountCents !== -amountCents) return null;
  return { paymentId: payment.id, billingAccountId: payment.billingAccountId, amountCents, provider: payment.provider };
}

export function isConfirmedOfflinePaymentReceipt(value: unknown, request: Record<string, unknown>) {
  if (typeof request.requestId !== "string" || typeof request.familyId !== "string") return false;
  const receipt = readOfflinePaymentReceipt(value, { requestId: request.requestId, familyId: request.familyId });
  const amountCents = request.amountCents;
  const provider = request.mode === "manualCashPayment" ? "manual_cash"
    : request.mode === "manualCheckPayment" ? "manual_check" : null;
  return receipt !== null && receipt.provider === provider && receipt.amountCents === amountCents;
}
