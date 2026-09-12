import { PaymentStatus, Prisma, type PrismaClient } from "@prisma/client";
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
  billingAccountId?: string;
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

export function stripeCheckoutDraftConnectedAccountId(
  payment: { customFields?: unknown },
  fallbackConnectedAccountId?: string | null,
) {
  const fields = jsonRecord(payment.customFields);
  if (Object.prototype.hasOwnProperty.call(fields, "stripeConnectedAccountId")) {
    if (fields.stripeConnectedAccountId === null) return null;
    if (typeof fields.stripeConnectedAccountId !== "string") return null;
  }
  const storedConnectedAccountId = typeof fields.stripeConnectedAccountId === "string"
    ? fields.stripeConnectedAccountId.trim()
    : "";
  return Object.prototype.hasOwnProperty.call(fields, "stripeConnectedAccountId")
    ? storedConnectedAccountId || null
    : fallbackConnectedAccountId || null;
}

function isRecoverableOpenUnpaidDraftSession(session: StripeCheckoutSessionSnapshot) {
  return session.status === "open"
    && session.paymentStatus === "unpaid"
    && (!session.paymentIntentId || session.paymentIntentStatus === "requires_payment_method");
}

export function stripeCheckoutDraftReplacementReason({
  session,
  pendingPayment,
  requestedPaymentMethodCategory,
  expectedAmountCents,
  expectedCheckoutTotalCents,
  expectedFeeDisclosureVersion,
}: {
  session: StripeCheckoutSessionSnapshot;
  pendingPayment: {
    amountCents?: number | null;
    paymentMethodCategory?: string | null;
    requestedPaymentMethodCategory?: string | null;
    checkoutTotalCents?: number | null;
    feeDisclosureVersion?: string | null;
  };
  requestedPaymentMethodCategory?: StripePaymentMethodCategory | null;
  expectedAmountCents?: number | null;
  expectedCheckoutTotalCents?: number | null;
  expectedFeeDisclosureVersion?: string | null;
}) {
  if (!isRecoverableOpenUnpaidDraftSession(session)) return null;
  if (
    typeof expectedAmountCents === "number" &&
    Number.isFinite(expectedAmountCents) &&
    typeof pendingPayment.amountCents === "number" &&
    pendingPayment.amountCents !== expectedAmountCents
  ) {
    return "superseded_amount" as const;
  }
  if (
    typeof expectedCheckoutTotalCents === "number" &&
    Number.isFinite(expectedCheckoutTotalCents) &&
    pendingPayment.checkoutTotalCents !== expectedCheckoutTotalCents
  ) {
    return "superseded_fee_policy" as const;
  }
  if (
    expectedFeeDisclosureVersion &&
    pendingPayment.feeDisclosureVersion !== expectedFeeDisclosureVersion
  ) {
    return "superseded_fee_policy" as const;
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
  if (session.status === "expired" && session.paymentStatus === "unpaid"
    && (!session.paymentIntentId || ["requires_payment_method", "canceled"].includes(session.paymentIntentStatus ?? ""))) return "expired" as const;
  const ageMs = millisecondsSince(session.createdAt, now);
  const isStaleOpen =
    session.status === "open" &&
    session.paymentStatus === "unpaid" &&
    (!session.paymentIntentId || session.paymentIntentStatus === "requires_payment_method") &&
    ageMs !== null &&
    ageMs >= staleOpenAfterMs;
  if (isStaleOpen) return "stale_open" as const;
  if (
    session.status === "complete" &&
    session.paymentStatus === "unpaid" &&
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
  expectedCheckoutTotalCents,
  expectedFeeDisclosureVersion,
  now = new Date(),
  database = prisma,
  retrieve = retrieveStripeCheckoutSession,
  expire = expireStripeCheckoutSession,
  validateSession,
  canResumeSession,
}: {
  payment: StripeCheckoutDraftPayment;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  scope?: "invoice" | "family_balance";
  requestedPaymentMethodCategory?: StripePaymentMethodCategory | null;
  expectedAmountCents?: number | null;
  expectedCheckoutTotalCents?: number | null;
  expectedFeeDisclosureVersion?: string | null;
  now?: Date;
  database?: Pick<PrismaClient, "payment">;
  retrieve?: typeof retrieveStripeCheckoutSession;
  expire?: typeof expireStripeCheckoutSession;
  validateSession?: (session: StripeCheckoutSessionSnapshot) => boolean;
  canResumeSession?: (session: StripeCheckoutSessionSnapshot) => boolean;
}) {
  const pendingPayment = activeStripeCheckoutPaymentSummary(payment);
  const sessionId = pendingPayment.stripeCheckoutSessionId;
  // A draft can outlive a Connect cutover. Stripe sessions must be managed on
  // the account where they were created, not the school's current account.
  const draftConnectedAccountId = stripeCheckoutDraftConnectedAccountId(payment, connectedAccountId);
  const changed = () => ({ blocked: true as const, pendingPayment,
    message: "This payment needs confirmation. Refresh to review its current status before continuing." });
  // Full JSON compare-and-set prevents any late read/expire response from
  // overwriting a webhook result, another reconciliation, or newer metadata.
  const unchangedDraft = { id: payment.id, status: PaymentStatus.DRAFT, provider: payment.provider,
    ...(payment.billingAccountId ? { billingAccountId: payment.billingAccountId } : {}),
    ...(payment.externalIdPlaceholder !== undefined ? { externalIdPlaceholder: payment.externalIdPlaceholder } : {}),
    customFields: { equals: payment.customFields == null ? Prisma.DbNull : jsonInput(jsonRecord(payment.customFields)) } };
  if (!sessionId || payment.status !== PaymentStatus.DRAFT) {
    return {
      blocked: true as const,
      pendingPayment,
      message: activeStripeCheckoutPaymentMessage(payment, scope),
    };
  }

  const retrieved = await retrieve({
    sessionId,
    connectedAccountId: draftConnectedAccountId,
    tenantId,
  });
  if (!retrieved.ok || !retrieved.session) {
    return {
      blocked: true as const,
      pendingPayment,
      message: activeStripeCheckoutPaymentMessage(payment, scope),
      error: retrieved.error,
    };
  }

  let session = retrieved.session;
  if (session.id !== sessionId || (validateSession && !validateSession(session))) return changed();
  const clearReason = stripeCheckoutDraftClearReason(session, now);
  const replacementReason = clearReason ? null : stripeCheckoutDraftReplacementReason({
    session,
    pendingPayment,
    requestedPaymentMethodCategory,
    expectedAmountCents,
    expectedCheckoutTotalCents,
    expectedFeeDisclosureVersion,
  });
  if (clearReason === "stale_open" || replacementReason) {
    const expired = await expire({
      sessionId,
      connectedAccountId: draftConnectedAccountId,
      tenantId,
    });
    if (!expired.ok || !expired.session) {
      return {
        blocked: true as const,
        pendingPayment,
        message: activeStripeCheckoutPaymentMessage(payment, scope),
        error: expired.error,
      };
    }
    session = expired.session;
    if (session.id !== sessionId || stripeCheckoutDraftClearReason(session, now) !== "expired"
      || (validateSession && !validateSession(session))) return changed();
  }

  const finalClearReason = replacementReason || (clearReason === "stale_open"
    ? "stale_open"
    : stripeCheckoutDraftClearReason(session, now));
  const fields = jsonRecord(payment.customFields);

  if (
    finalClearReason === "expired" ||
    finalClearReason === "stale_open" ||
    finalClearReason === "superseded_amount" ||
    finalClearReason === "superseded_fee_policy" ||
    finalClearReason === "superseded_payment_method"
  ) {
    const updated = await database.payment.updateMany({
      where: unchangedDraft,
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
    if (updated.count !== 1) return changed();
    return { blocked: false as const, cleared: true as const, clearReason: finalClearReason };
  }

  if (finalClearReason === "failed_intent") {
    const updated = await database.payment.updateMany({
      where: unchangedDraft,
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
    if (updated.count !== 1) return changed();
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
    refreshedFields.status = fields.status === "paid_processing" ? "paid_processing" : "checkout_pending";
  }
  const updated = await database.payment.updateMany({
    where: unchangedDraft,
    data: { customFields: jsonInput(refreshedFields) },
  });
  if (updated.count !== 1) return changed();

  const refreshedPayment = { ...payment, customFields: refreshedFields };
  if (isRecoverableOpenUnpaidDraftSession(session) && session.url && (!canResumeSession || canResumeSession(session))) {
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
