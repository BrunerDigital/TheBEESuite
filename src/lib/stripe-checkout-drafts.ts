import { PaymentStatus, Prisma } from "@prisma/client";
import {
  activeStripeCheckoutPaymentMessage,
  activeStripeCheckoutPaymentSummary,
  jsonRecord,
} from "@/lib/billing-guardrails";
import {
  expireStripeCheckoutSession,
  retrieveStripeCheckoutSession,
  type StripePaymentMethodCategory,
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

function normalizeCheckoutCategory(value: unknown): StripePaymentMethodCategory | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "default" || normalized === "ach" || normalized === "card" || normalized === "link_bank") {
    return normalized;
  }
  return null;
}

function isOpenUnpaidDraftSession(session: StripeCheckoutSessionSnapshot) {
  return session.status === "open" && session.paymentStatus === "unpaid" && !session.paymentIntentId;
}

export function stripeCheckoutDraftReplacementReason({
  session,
  pendingPayment,
  requestedPaymentMethodCategory,
  expectedAmountCents,
}: {
  session: StripeCheckoutSessionSnapshot;
  pendingPayment: {
    amountCents?: number | null;
    paymentMethodCategory?: string | null;
    requestedPaymentMethodCategory?: string | null;
  };
  requestedPaymentMethodCategory?: StripePaymentMethodCategory | null;
  expectedAmountCents?: number | null;
}) {
  if (!isOpenUnpaidDraftSession(session)) return null;
  if (
    typeof expectedAmountCents === "number" &&
    Number.isFinite(expectedAmountCents) &&
    typeof pendingPayment.amountCents === "number" &&
    pendingPayment.amountCents !== expectedAmountCents
  ) {
    return "superseded_amount" as const;
  }

  const requestedCategory = normalizeCheckoutCategory(requestedPaymentMethodCategory);
  const pendingCategory = normalizeCheckoutCategory(pendingPayment.paymentMethodCategory)
    || normalizeCheckoutCategory(pendingPayment.requestedPaymentMethodCategory);
  if (
    requestedCategory &&
    requestedCategory !== "default" &&
    pendingCategory &&
    pendingCategory !== "default" &&
    requestedCategory !== pendingCategory
  ) {
    return "superseded_payment_method" as const;
  }

  return null;
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
  requestedPaymentMethodCategory,
  expectedAmountCents,
  now = new Date(),
}: {
  payment: StripeCheckoutDraftPayment;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  scope?: "invoice" | "family_balance";
  requestedPaymentMethodCategory?: StripePaymentMethodCategory | null;
  expectedAmountCents?: number | null;
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
  const replacementReason = clearReason ? null : stripeCheckoutDraftReplacementReason({
    session,
    pendingPayment,
    requestedPaymentMethodCategory,
    expectedAmountCents,
  });
  if (clearReason === "stale_open" || replacementReason) {
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

  const finalClearReason = replacementReason || (clearReason === "stale_open"
    ? "stale_open"
    : stripeCheckoutDraftClearReason(session, now));
  const fields = jsonRecord(payment.customFields);

  if (
    finalClearReason === "expired" ||
    finalClearReason === "stale_open" ||
    finalClearReason === "superseded_amount" ||
    finalClearReason === "superseded_payment_method"
  ) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.VOID,
        externalIdPlaceholder: session.id,
        customFields: jsonInput({
          ...fields,
          status: finalClearReason === "expired" ? "checkout_expired" : "checkout_superseded",
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
  if (isOpenUnpaidDraftSession(session) && session.url) {
    return {
      blocked: false as const,
      resumed: true as const,
      url: session.url,
      pendingPayment: activeStripeCheckoutPaymentSummary(refreshedPayment),
    };
  }

  return {
    blocked: true as const,
    pendingPayment: activeStripeCheckoutPaymentSummary(refreshedPayment),
    message: activeStripeCheckoutPaymentMessage(refreshedPayment, scope),
  };
}
