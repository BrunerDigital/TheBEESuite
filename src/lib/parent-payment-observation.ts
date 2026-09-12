import type { ParentAccountPaymentBlocker, ParentPendingPayment } from "./parent-payment-status";

export type ParentPaymentObservationTarget = {
  familyId: string;
  invoiceId: string | null;
  paymentId: string | null;
  requestNonce: string;
};
export type ParentPaymentObservation = ParentPaymentObservationTarget & {
  ok: true;
  version: 1;
  observedAt: string;
  accountPaymentBlocker: ParentAccountPaymentBlocker | null;
  invoicePayments: Array<{ invoiceId: string; payment: ParentPendingPayment }>;
  outcome: "unidentified" | "active" | "settled" | "unresolved";
};

export function isPaymentObservationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function isPending(value: unknown): value is ParentPendingPayment {
  const item = record(value);
  return Boolean(item && typeof item.phase === "string" && ["confirmation_unknown", "ach_processing", "payment_pending"].includes(item.phase)
    && [null, "ach", "card", "link_bank", "card_present"].includes(item.method as string | null));
}

/** Correlation and shape validation only: an empty observation NEVER authorizes a retry. */
export function isParentPaymentObservation(value: unknown, target: ParentPaymentObservationTarget): value is ParentPaymentObservation {
  const item = record(value);
  if (!item || item.ok !== true || item.version !== 1 || item.familyId !== target.familyId
    || item.invoiceId !== target.invoiceId || item.paymentId !== target.paymentId || item.requestNonce !== target.requestNonce
    || typeof item.observedAt !== "string" || !Number.isFinite(Date.parse(item.observedAt))
    || typeof item.outcome !== "string" || !["unidentified", "active", "settled", "unresolved"].includes(item.outcome)) return false;
  if (item.outcome === "settled" && !target.paymentId) return false;
  if (item.accountPaymentBlocker !== null) {
    const blocker = record(item.accountPaymentBlocker);
    if (!blocker || !Number.isSafeInteger(blocker.count) || Number(blocker.count) < 1
      || typeof blocker.blocksInvoicePayments !== "boolean" || !isPending(blocker)) return false;
  }
  if (!Array.isArray(item.invoicePayments)) return false;
  const ids = new Set<string>();
  return item.invoicePayments.every(value => {
    const entry = record(value);
    if (!entry || !isPaymentObservationId(entry.invoiceId) || !isPending(entry.payment) || ids.has(entry.invoiceId)) return false;
    ids.add(entry.invoiceId); return true;
  });
}

function isHostedCheckoutDestination(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8192 || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}

/** Only for our same-origin payment endpoint response, never URL/query/user input.
 * Stripe supplies the URL and Session ID server-side; connected accounts can use
 * custom Checkout domains. Shape checks are not independent provider attestation.
 */
export function isServerCheckoutReceipt(body: unknown): body is { ok: true; url: string; paymentId: string; stripeSessionId: string } {
  const item = record(body);
  return item?.ok === true && isPaymentObservationId(item.paymentId)
    && typeof item.stripeSessionId === "string" && /^cs_[A-Za-z0-9_]{1,255}$/.test(item.stripeSessionId)
    && isHostedCheckoutDestination(item.url);
}

export function paymentResponseNeedsConfirmation(response: { ok: boolean; status: number }, body: unknown) {
  const item = record(body);
  return response.status >= 500 || response.status === 409 || response.status === 408
    || (response.ok && !isServerCheckoutReceipt(item));
}
