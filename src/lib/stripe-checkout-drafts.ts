import { PaymentStatus, Prisma } from "@prisma/client";
import {
  activeStripeCheckoutPaymentMessage,
  activeStripeCheckoutPaymentSummary,
  jsonRecord,
} from "@/lib/billing-guardrails";
import {
  expireStripeCheckoutSession,
  retrieveStripeCheckoutSession,
  type StripeCheckoutSessionSnapshot,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const STALE_OPEN_STRIPE_CHECKOUT_MS = 30 * 60 * 1000;

type StripeCheckoutDraftPayment = {
  id: string;
  amountCents?: number | null;
  status: PaymentStatus;
  provider: string;
  externalIdPlaceholder?: string | null;
  customFields?: unknown;
};

function jsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function millisecondsSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? now.getTime() - parsed : null;
}

export function stripeCheckoutDraftClearReason(
  session: StripeCheckoutSessionSnapshot,
  now = new Date(),
  staleOpenAfterMs = STALE_OPEN_STRIPE_CHECKOUT_MS,
) {
  if (session.status === "expired") return "expired" as const;
  const ageMs = millisecondsSince(session.createdAt, now);
  const isStaleOpen =
    session.status === "open" &&
    session.paymentStatus === "unpaid" &&
    !session.paymentIntentId &&
    ageMs !== null &&
    ageMs >= staleOpenAfterMs;
  if (isStaleOpen) return "stale_open" as const;
  if (
    session.status === "complete" &&
    session.paymentStatus !== "paid" &&
    (session.paymentIntentStatus === "requires_payment_method" || session.paymentIntentStatus === "canceled")
  ) {
    return "failed_intent" as const;
  }
  return null;
}

export async function resolveStripeCheckoutDraftBlocker({
  payment,
  connectedAccountId,
  tenantId,
  scope = "invoice",
  now = new Date(),
}: {
  payment: StripeCheckoutDraftPayment;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  scope?: "invoice" | "family_balance";
  now?: Date;
}) {
  const pendingPayment = activeStripeCheckoutPaymentSummary(payment);
  const sessionId = pendingPayment.stripeCheckoutSessionId;
  if (!sessionId) {
    return {
      blocked: true as const,
      pendingPayment,
      message: activeStripeCheckoutPaymentMessage(payment, scope),
    };
  }

  const retrieved = await retrieveStripeCheckoutSession({ sessionId, connectedAccountId, tenantId });
  if (!retrieved.ok || !retrieved.session) {
    return {
      blocked: true as const,
      pendingPayment,
      message: activeStripeCheckoutPaymentMessage(payment, scope),
      error: retrieved.error,
    };
  }

  let session = retrieved.session;
  const clearReason = stripeCheckoutDraftClearReason(session, now);
  if (clearReason === "stale_open") {
    const expired = await expireStripeCheckoutSession({ sessionId, connectedAccountId, tenantId });
    if (!expired.ok || !expired.session) {
      return {
        blocked: true as const,
        pendingPayment,
        message: activeStripeCheckoutPaymentMessage(payment, scope),
        error: expired.error,
      };
    }
    session = expired.session;
  }

  const finalClearReason = clearReason === "stale_open"
    ? "stale_open"
    : stripeCheckoutDraftClearReason(session, now);
  const fields = jsonRecord(payment.customFields);

  if (finalClearReason === "expired" || finalClearReason === "stale_open") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.VOID,
        externalIdPlaceholder: session.id,
        customFields: jsonInput({
          ...fields,
          status: finalClearReason === "stale_open" ? "checkout_superseded" : "checkout_expired",
          stripeCheckoutSessionId: session.id,
          stripeCheckoutSessionStatus: session.status || null,
          stripePaymentStatus: session.paymentStatus || null,
          staleDraftClearedAt: now.toISOString(),
          staleDraftClearReason: finalClearReason,
        }),
      },
    });
    return { blocked: false as const, cleared: true as const, clearReason: finalClearReason };
  }

  if (finalClearReason === "failed_intent") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        externalIdPlaceholder: session.paymentIntentId || session.id,
        customFields: jsonInput({
          ...fields,
          status: "checkout_failed",
          stripeCheckoutSessionId: session.id,
          stripeCheckoutSessionStatus: session.status || null,
          stripePaymentStatus: session.paymentStatus || null,
          stripePaymentIntentId: session.paymentIntentId || null,
          stripePaymentIntentStatus: session.paymentIntentStatus || null,
          staleDraftClearedAt: now.toISOString(),
          staleDraftClearReason: finalClearReason,
        }),
      },
    });
    return { blocked: false as const, cleared: true as const, clearReason: finalClearReason };
  }

  const refreshedFields: Record<string, unknown> = {
    ...fields,
    stripeCheckoutSessionId: session.id,
    stripeCheckoutSessionStatus: session.status || null,
    stripePaymentStatus: session.paymentStatus || null,
    stripePaymentIntentId: session.paymentIntentId || fields.stripePaymentIntentId || null,
    stripePaymentIntentStatus: session.paymentIntentStatus || fields.stripePaymentIntentStatus || null,
  };
  if (session.status === "complete" && session.paymentStatus === "unpaid" && session.paymentIntentStatus === "processing") {
    refreshedFields.status = "checkout_pending";
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { customFields: jsonInput(refreshedFields) },
  });

  const refreshedPayment = { ...payment, customFields: refreshedFields };
  return {
    blocked: true as const,
    pendingPayment: activeStripeCheckoutPaymentSummary(refreshedPayment),
    message: activeStripeCheckoutPaymentMessage(refreshedPayment, scope),
  };
}
