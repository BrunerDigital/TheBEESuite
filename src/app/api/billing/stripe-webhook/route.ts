import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { achFailurePresentation, isAchReturnReason, isReturnedStripePayment } from "@/lib/ach-payment-lifecycle";
import { checkoutApplicationGuard, stripePaymentIntentFailureDisposition } from "@/lib/billing-guardrails";
import {
  createStripeSoftwareSubscription,
  ensureStripeSoftwareRecurringPrice,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  retrieveStripePaymentMethod,
  retrieveStripeSetupIntent,
  sendSms,
  setStripeCustomerDefaultPaymentMethod,
  updateStripeSoftwareSubscription,
  type StripeSoftwareSubscriptionSnapshot,
} from "@/lib/integrations";
import { getSchoolSoftwareBillingStartAt, getSchoolSoftwareFeePolicyForCenter } from "@/lib/kidcity-software-billing";
import { beginCommunicationSmsDeliveryAttempt, finalizeCommunicationSmsDeliveryAttempt, nextIntegrationRetryAt } from "@/lib/integration-deliveries";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import {
  paymentMethodSetupAutopayOutcome,
  paymentMethodSetupExpirationPatch,
} from "@/lib/payment-method-management";
import { beeSuitePayoutSmsBody, payoutSmsRecipient, sendPayoutSmsSafely } from "@/lib/payout-sms";
import { prisma } from "@/lib/prisma";
import { saveSoftwareSubscriptionSnapshot } from "@/lib/school-software-subscriptions";
import { markRegistrationPaymentChecklistPaid } from "@/lib/registration-packet";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";
import { stripeCustomerCustomFieldPatch } from "@/lib/stripe-customer-scope";
import {
  isStripeWebhookAccountEvent,
  isStripeWebhookPaymentEvent,
  isStripeWebhookPayoutEvent,
  isStripeWebhookSoftwareBillingEvent,
  stripeWebhookObjectForRouting,
} from "@/lib/stripe-webhook-event-types";
import {
  isStripeWebhookReceiptUniqueConflict,
  reserveStripeWebhookDelivery,
  stripeWebhookDedupeKey,
} from "@/lib/stripe-webhook-receipts";
import { matchStripeWebhookSecret } from "@/lib/stripe-webhook-readiness";
import {
  applySucceededStripeFamilyBalancePayment,
  succeededFamilyBalancePaymentClaim,
} from "@/lib/stripe-payment-application";
import { twilioStatusCallbackUrl } from "@/lib/twilio-messaging";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type StripeCheckoutSessionCompleted = {
  id: string;
  object: "checkout.session";
  mode?: string | null;
  payment_status?: string;
  amount_total?: number;
  payment_intent?: string | null;
  setup_intent?: string | null;
  customer?: string | null;
  metadata?: {
    source?: string;
    setupFlow?: string;
    autopaySetupMode?: string;
    tenantId?: string;
    billingAccountId?: string;
    paymentScope?: string;
    invoiceId?: string;
    paymentId?: string;
    familyId?: string;
    centerId?: string;
    stripeConnectedAccountId?: string;
    stripeCustomerId?: string;
    invoiceAmountCents?: string;
    parentSurchargeAmountCents?: string;
    parentProcessingRecoveryAmountCents?: string;
    schoolProcessingFeeAmountCents?: string;
    beeSuitePaymentOperationsFeeAmountCents?: string;
    checkoutTotalCents?: string;
    applicationFeeAmountCents?: string;
    collectionMode?: string;
    requestedPaymentMethodCategory?: string;
    paymentMethodCategory?: string;
    bankAccountVerificationMethod?: string;
    description?: string;
    checkoutPurpose?: string;
    receiptKind?: string;
    chargeSource?: string;
    sourceId?: string;
    productId?: string;
    productName?: string;
    productType?: string;
    productCatalog?: string;
    productColor?: string;
    productSize?: string;
    productPurchaseOption?: string;
    quantity?: string;
    purchaseId?: string;
    orderReference?: string;
    purchaserUserId?: string;
    currentGuardianId?: string;
    itemSummary?: string;
    stripeBaseSubtotalCents?: string;
    beeSuiteMarkupCents?: string;
  };
};

type StripeMetadata = {
  source?: string;
  tenantId?: string;
  billingAccountId?: string;
  paymentScope?: string;
  invoiceId?: string;
  paymentId?: string;
  familyId?: string;
  centerId?: string;
  stripeConnectedAccountId?: string;
  invoiceTotalCents?: string;
  invoiceAmountCents?: string;
  accountCreditAppliedCents?: string;
  stripeChargePrincipalCents?: string;
  parentSurchargeAmountCents?: string;
  parentProcessingRecoveryAmountCents?: string;
  schoolProcessingFeeAmountCents?: string;
  beeSuitePaymentOperationsFeeAmountCents?: string;
  checkoutTotalCents?: string;
  applicationFeeAmountCents?: string;
  collectionMode?: string;
  requestedPaymentMethodCategory?: string;
  paymentMethodCategory?: string;
  bankAccountVerificationMethod?: string;
  description?: string;
  checkoutPurpose?: string;
  receiptKind?: string;
  chargeSource?: string;
  sourceId?: string;
  productId?: string;
  productName?: string;
  productType?: string;
  productCatalog?: string;
  productColor?: string;
  productSize?: string;
  productPurchaseOption?: string;
  quantity?: string;
  purchaseId?: string;
  orderReference?: string;
  purchaserUserId?: string;
  currentGuardianId?: string;
  itemSummary?: string;
  stripeBaseSubtotalCents?: string;
  beeSuiteMarkupCents?: string;
};

type StripePaymentIntentObject = {
  id: string;
  object: "payment_intent";
  amount?: number;
  status?: string;
  last_payment_error?: { code?: string; decline_code?: string; message?: string } | null;
  metadata?: StripeMetadata;
};

type StripeSetupIntentObject = {
  id: string;
  object: "setup_intent";
  customer?: string | null;
  payment_method?: string | null;
  status?: string | null;
  metadata?: StripeMetadata;
};

type StripeChargeObject = {
  id: string;
  object: "charge";
  amount?: number;
  amount_refunded?: number;
  refunded?: boolean;
  payment_intent?: string | null;
  metadata?: StripeMetadata;
};

type StripeDisputeObject = {
  id: string;
  object: "dispute";
  amount?: number;
  charge?: string | null;
  payment_intent?: string | null;
  reason?: string | null;
  status?: string | null;
  metadata?: StripeMetadata;
};

type StripePayoutObject = {
  id: string;
  object: "payout";
  amount?: number;
  currency?: string;
  status?: string;
};

type StripeWebhookEvent = {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  account?: string;
  data: {
    object: StripeCheckoutSessionCompleted | StripePaymentIntentObject | StripeSetupIntentObject | StripeChargeObject | StripeDisputeObject | StripePayoutObject | { id?: string; object?: string };
  };
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metadataOf(value: { metadata?: unknown }) {
  return jsonObject(value.metadata) as StripeMetadata;
}

function isAchPaymentMetadata(metadata: StripeMetadata) {
  return clean(metadata.paymentMethodCategory) === "ach"
    || clean(metadata.requestedPaymentMethodCategory) === "ach";
}

function processingPaymentLifecycleStatus(input: {
  achProcessing: boolean;
  collectionMode: string;
  currentStatus: string;
}) {
  if (!input.achProcessing) return input.currentStatus || "payment_processing";
  if (input.collectionMode === "autopay" || input.currentStatus.startsWith("autopay_")) {
    return "autopay_processing";
  }
  if (input.collectionMode === "stored_method" || input.currentStatus.startsWith("stored_method_")) {
    return "stored_method_processing";
  }
  if (input.collectionMode === "director_saved_method" || input.currentStatus.startsWith("director_saved_method_")) {
    return "director_saved_method_processing";
  }
  return "paid_processing";
}

function accountEventType(type: string) {
  return isStripeWebhookAccountEvent(type);
}

function stripeObjectId(event: StripeWebhookEvent) {
  return event.data.object.id || null;
}

function stripeDedupeKey(event: StripeWebhookEvent) {
  // Stripe event IDs identify deliveries. Object/type keys can incorrectly collapse
  // two legitimate lifecycle events for the same Checkout Session.
  return stripeWebhookDedupeKey(event.id);
}

function compactEventPayload(event: StripeWebhookEvent): Prisma.InputJsonObject {
  const object = jsonObject(event.data.object);
  return {
    object: typeof object.object === "string" ? object.object : null,
    objectId: stripeObjectId(event),
    account: clean(event.account) || null,
    paymentStatus: typeof object.payment_status === "string" ? object.payment_status : null,
    amountTotal: typeof object.amount_total === "number" ? object.amount_total : null,
    metadata: jsonObject(object.metadata) as Prisma.InputJsonObject,
  };
}

async function recordStripeWebhookEvent(
  tx: Prisma.TransactionClient,
  event: StripeWebhookEvent,
  status = "processed",
) {
  const result = await tx.stripeWebhookEvent.updateMany({
    where: { eventId: event.id },
    data: { status, error: null, processedAt: new Date() },
  });
  if (result.count !== 1) throw new Error("Stripe webhook receipt was not reserved before processing.");
}

async function reserveStripeWebhookEvent(event: StripeWebhookEvent) {
  return reserveStripeWebhookDelivery({
    insert: async () => {
      await prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          dedupeKey: stripeDedupeKey(event),
          type: event.type,
          objectId: stripeObjectId(event),
          livemode: event.livemode ?? null,
          status: "received",
          payload: compactEventPayload(event),
          processedAt: null,
        },
      });
    },
    eventExists: async () => Boolean(await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
      select: { id: true },
    })),
  });
}

function safeReceiptReason(reason: unknown, fallback: string) {
  const value = clean(reason).toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 120);
  return value || fallback;
}

async function finalizeStripeWebhookReceipt(event: StripeWebhookEvent, status: string, reason?: unknown) {
  await prisma.stripeWebhookEvent.update({
    where: { eventId: event.id },
    data: {
      status,
      error: reason ? safeReceiptReason(reason, status) : null,
      processedAt: new Date(),
    },
  });
}

async function finalizeUnfinishedStripeWebhookReceipt(event: StripeWebhookEvent, status: string, reason?: unknown) {
  await prisma.stripeWebhookEvent.updateMany({
    where: { eventId: event.id, status: "received" },
    data: {
      status,
      error: reason ? safeReceiptReason(reason, status) : null,
      processedAt: new Date(),
    },
  });
}

async function handleTerminalStoreCheckoutEvent(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted) {
  const metadata = jsonObject(session.metadata) as StripeMetadata;
  const tenantId = clean(metadata.tenantId);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing terminal store tenant metadata." }, { status: 400 });
  }

  const action = event.type === "checkout.session.completed"
    ? session.payment_status === "paid"
      ? "terminal_store.checkout.completed"
      : "terminal_store.checkout.pending"
    : event.type === "checkout.session.expired"
      ? "terminal_store.checkout.expired"
      : event.type === "checkout.session.async_payment_failed"
        ? "terminal_store.checkout.failed"
        : "terminal_store.checkout.updated";

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event, action.endsWith(".pending") ? "pending" : "processed");
      await tx.auditLog.create({
        data: {
          tenantId,
          centerId: clean(metadata.centerId) || null,
          userId: null,
          action,
          resource: "TerminalStoreOrder",
          resourceId: session.id,
          metadata: {
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            stripeEventId: event.id,
            stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
            stripePaymentStatus: session.payment_status || null,
            stripeAmountTotalCents: session.amount_total ?? null,
            orderReference: clean(metadata.orderReference) || null,
            purchaserUserId: clean(metadata.purchaserUserId) || null,
            itemSummary: clean(metadata.itemSummary) || null,
            checkoutTotalCents: Number(metadata.checkoutTotalCents || session.amount_total || 0) || null,
            stripeBaseSubtotalCents: Number(metadata.stripeBaseSubtotalCents || 0) || null,
            beeSuiteMarkupCents: Number(metadata.beeSuiteMarkupCents || 0) || null,
            source: "terminal_store",
          },
        },
      });
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

function isDuplicateWebhookEvent(error: unknown) {
  return isStripeWebhookReceiptUniqueConflict(error);
}

async function findPaymentForStripeObject(
  tx: Prisma.TransactionClient,
  object: StripePaymentIntentObject | StripeChargeObject | StripeDisputeObject,
) {
  const metadata = metadataOf(object);
  if (metadata.paymentId) {
    const payment = await tx.payment.findUnique({
      where: { id: metadata.paymentId },
      include: { billingAccount: true },
    });
    if (payment) return payment;
  }

  const paymentIntentId = object.object === "payment_intent"
    ? object.id
    : clean(object.payment_intent);
  if (paymentIntentId) {
    const payment = await tx.payment.findFirst({
      where: {
        provider: "stripe",
        customFields: {
          path: ["stripePaymentIntentId"],
          equals: paymentIntentId,
        },
      },
      include: { billingAccount: true },
    });
    if (payment) return payment;
  }

  const chargeId = object.object === "charge"
    ? object.id
    : object.object === "dispute"
      ? clean(object.charge)
      : "";
  if (chargeId) {
    return tx.payment.findFirst({
      where: {
        provider: "stripe",
        customFields: {
          path: ["stripeChargeId"],
          equals: chargeId,
        },
      },
      include: { billingAccount: true },
    });
  }

  return null;
}

async function invoiceIdForPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  metadata: StripeMetadata,
) {
  if (metadata.invoiceId) return metadata.invoiceId;
  const ledgerEntry = await tx.ledgerEntry.findFirst({
    where: { paymentId, invoiceId: { not: null } },
    select: { invoiceId: true },
  });
  return ledgerEntry?.invoiceId || null;
}

function centsFromJson(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function metadataCents(value: unknown) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function familyPaymentDescription(metadata: StripeMetadata, fallback: string) {
  return clean(metadata.description) || fallback;
}

function productPaymentMetadata(metadata: StripeMetadata) {
  return {
    checkoutPurpose: clean(metadata.checkoutPurpose) || null,
    receiptKind: clean(metadata.receiptKind) || null,
    chargeSource: clean(metadata.chargeSource) || null,
    sourceId: clean(metadata.sourceId) || null,
    productId: clean(metadata.productId) || null,
    productName: clean(metadata.productName) || null,
    productType: clean(metadata.productType) || null,
    productCatalog: clean(metadata.productCatalog) || null,
    productColor: clean(metadata.productColor) || null,
    productSize: clean(metadata.productSize) || null,
    productPurchaseOption: clean(metadata.productPurchaseOption) || null,
    quantity: clean(metadata.quantity) || null,
    itemSummary: clean(metadata.itemSummary) || null,
    purchaseId: clean(metadata.purchaseId) || null,
    purchaserUserId: clean(metadata.purchaserUserId) || null,
    currentGuardianId: clean(metadata.currentGuardianId) || null,
  };
}

async function applyBalancePaymentToOpenInvoices(
  tx: Prisma.TransactionClient,
  input: {
    billingAccountId: string;
    paymentId: string;
    amountCents: number;
    paidAt: Date;
    accountBalanceAfterCents?: number | null;
    stripeEventId: string;
    stripePaymentIntentId?: string | null;
    stripeCheckoutSessionId?: string | null;
    preferredInvoiceId?: string | null;
  },
) {
  let remainingCents = input.amountCents;
  if (remainingCents <= 0) return [];

  const invoices = await tx.invoice.findMany({
    where: {
      billingAccountId: input.billingAccountId,
      status: PaymentStatus.OPEN,
      totalCents: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      totalCents: true,
      customFields: true,
    },
  });

  const preferredInvoiceId = clean(input.preferredInvoiceId);
  const orderedInvoices = preferredInvoiceId
    ? [
        ...invoices.filter((invoice) => invoice.id === preferredInvoiceId),
        ...invoices.filter((invoice) => invoice.id !== preferredInvoiceId),
      ]
    : invoices;
  const openInvoiceTotalCents = orderedInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const invoiceSettlementBudgetCents = Math.max(
    remainingCents,
    openInvoiceTotalCents - Math.max(0, input.accountBalanceAfterCents ?? openInvoiceTotalCents),
  );
  remainingCents = Math.min(openInvoiceTotalCents, invoiceSettlementBudgetCents);
  const paidAt = input.paidAt.toISOString();
  const appliedInvoiceIds: string[] = [];

  for (const invoice of orderedInvoices) {
    if (remainingCents < invoice.totalCents) break;
    const invoiceFields = jsonObject(invoice.customFields);
    const claim = await tx.invoice.updateMany({
      where: { id: invoice.id, status: PaymentStatus.OPEN },
      data: {
        status: PaymentStatus.PAID,
        customFields: {
          ...invoiceFields,
          status: "paid",
          paidAt,
          paymentId: input.paymentId,
          paidByBalancePayment: true,
          stripeEventId: input.stripeEventId,
          stripePaymentIntentId: input.stripePaymentIntentId || null,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId || null,
        } as Prisma.InputJsonObject,
      },
    });
    if (claim.count !== 1) continue;
    remainingCents -= invoice.totalCents;
    appliedInvoiceIds.push(invoice.id);
  }

  return appliedInvoiceIds;
}

async function handleFamilyBalancePaymentSucceeded(
  event: StripeWebhookEvent,
  input: {
    metadata: StripeMetadata;
    paymentId: string;
    externalId: string;
    stripePaymentIntentId?: string | null;
    stripePaymentStatus?: string | null;
    stripeAmountTotalCents?: number | null;
    auditAction: string;
    descriptionFallback: string;
  },
) {
  let applied = false;
  let ignoredReason: string | null = null;
  let billingAccountId = clean(input.metadata.billingAccountId);

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const currentPayment = await tx.payment.findUnique({
        where: { id: input.paymentId },
        select: {
          status: true,
          billingAccountId: true,
          amountCents: true,
          customFields: true,
        },
      });
      if (!currentPayment) {
        ignoredReason = "payment_not_found";
        return;
      }
      billingAccountId = currentPayment.billingAccountId;
      const currentFields = jsonObject(currentPayment.customFields);
      const stripePaymentIntentId = input.stripePaymentIntentId || clean(currentFields.stripePaymentIntentId) || null;
      const claim = succeededFamilyBalancePaymentClaim({
        paymentStatus: currentPayment.status,
        storedStripePaymentIntentId: clean(currentFields.stripePaymentIntentId) || null,
        succeededStripePaymentIntentId: stripePaymentIntentId || "",
        storedCheckoutAmountCents: metadataCents(currentFields.checkoutTotalCents) || currentPayment.amountCents,
        succeededAmountTotalCents: input.stripeAmountTotalCents,
      });
      if (!claim.ok) {
        ignoredReason = claim.reason;
        return;
      }

      const paidAt = new Date();
      const claimedPayment = await tx.payment.updateMany({
        where: { id: input.paymentId, status: claim.claimStatus },
        data: {
          status: PaymentStatus.PAID,
          paidAt,
          externalIdPlaceholder: input.externalId,
          customFields: {
            ...currentFields,
            paymentScope: "family_balance",
            stripeCheckoutSessionId: event.type.startsWith("checkout.session.") ? input.externalId : currentFields.stripeCheckoutSessionId || null,
            stripePaymentIntentId,
            stripeEventId: event.id,
            stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
            stripePaymentStatus: input.stripePaymentStatus || null,
            stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
            invoiceAmountCents: metadataCents(input.metadata.invoiceAmountCents) || null,
            parentSurchargeAmountCents: metadataCents(input.metadata.parentSurchargeAmountCents),
            parentProcessingRecoveryAmountCents: metadataCents(input.metadata.parentProcessingRecoveryAmountCents || input.metadata.parentSurchargeAmountCents),
            schoolProcessingFeeAmountCents: metadataCents(input.metadata.schoolProcessingFeeAmountCents),
            beeSuitePaymentOperationsFeeAmountCents: metadataCents(input.metadata.beeSuitePaymentOperationsFeeAmountCents),
            checkoutTotalCents: metadataCents(input.metadata.checkoutTotalCents) || input.stripeAmountTotalCents || null,
            applicationFeeAmountCents: metadataCents(input.metadata.applicationFeeAmountCents),
            requestedPaymentMethodCategory: clean(input.metadata.requestedPaymentMethodCategory) || null,
            paymentMethodCategory: clean(input.metadata.paymentMethodCategory) || null,
            bankAccountVerificationMethod: clean(input.metadata.bankAccountVerificationMethod) || null,
            ...productPaymentMetadata(input.metadata),
            recoveredFromFailedAttempt: claim.recoveredFromFailedAttempt,
            recoveredStripePaymentIntentId: claim.recoveredFromFailedAttempt ? stripePaymentIntentId : null,
            provisionalCreditActive: false,
            status: "paid",
          },
        },
      });
      if (claimedPayment.count !== 1) {
        const retry = await applySucceededStripeFamilyBalancePayment(tx, {
          paymentId: input.paymentId,
          externalId: input.externalId,
          stripePaymentIntentId: stripePaymentIntentId || "",
          stripePaymentStatus: input.stripePaymentStatus || null,
          stripePaymentIntentStatus: input.stripePaymentStatus || null,
          stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
          stripeEventId: event.id,
          stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
          metadata: input.metadata,
          descriptionFallback: input.descriptionFallback,
          appliedAt: paidAt,
        });
        billingAccountId = retry.billingAccountId || billingAccountId;
        if (retry.applied) {
          applied = true;
          return;
        }
        ignoredReason = retry.reason;
        return;
      }
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: input.paymentId },
      });
      const updatedAccount = await tx.billingAccount.update({
        where: { id: payment.billingAccountId },
        data: { balanceCents: { decrement: payment.amountCents } },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: payment.billingAccountId,
          paymentId: payment.id,
          type: "payment",
          description: familyPaymentDescription(input.metadata, input.descriptionFallback),
          amountCents: -payment.amountCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "stripe",
          externalId: stripePaymentIntentId || input.externalId,
          metadata: {
            stripeEventId: event.id,
            stripeCheckoutSessionId: event.type.startsWith("checkout.session.") ? input.externalId : null,
            stripePaymentIntentId,
            stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
            paymentScope: "family_balance",
            collectionMode: clean(input.metadata.collectionMode) || null,
            requestedPaymentMethodCategory: clean(input.metadata.requestedPaymentMethodCategory) || null,
            paymentMethodCategory: clean(input.metadata.paymentMethodCategory) || null,
            bankAccountVerificationMethod: clean(input.metadata.bankAccountVerificationMethod) || null,
            ...productPaymentMetadata(input.metadata),
            parentSurchargeAmountCents: metadataCents(input.metadata.parentSurchargeAmountCents),
            parentProcessingRecoveryAmountCents: metadataCents(input.metadata.parentProcessingRecoveryAmountCents || input.metadata.parentSurchargeAmountCents),
            schoolProcessingFeeAmountCents: metadataCents(input.metadata.schoolProcessingFeeAmountCents),
            beeSuitePaymentOperationsFeeAmountCents: metadataCents(input.metadata.beeSuitePaymentOperationsFeeAmountCents),
            applicationFeeAmountCents: metadataCents(input.metadata.applicationFeeAmountCents),
          },
        },
      });
      const appliedInvoiceIds = await applyBalancePaymentToOpenInvoices(tx, {
        billingAccountId: payment.billingAccountId,
        paymentId: payment.id,
        amountCents: payment.amountCents,
        paidAt,
        accountBalanceAfterCents: updatedAccount.balanceCents,
        stripeEventId: event.id,
        stripePaymentIntentId,
        stripeCheckoutSessionId: event.type.startsWith("checkout.session.") ? input.externalId : null,
        preferredInvoiceId: clean(input.metadata.invoiceId) || null,
      });
      if (appliedInvoiceIds.length) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            customFields: {
              ...jsonObject(payment.customFields),
              appliedInvoiceIds,
              appliedInvoiceCount: appliedInvoiceIds.length,
              invoiceApplicationStatus: "applied_to_open_invoices",
              provisionalCreditActive: false,
              status: "paid",
            } as Prisma.InputJsonObject,
          },
        });
      }
      applied = true;
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (!applied) {
    if (billingAccountId && ignoredReason !== "payment_not_found") {
      await writeBillingAccountSystemAudit(billingAccountId, event.id, input.externalId, "billing.family_payment.ignored");
    }
    return NextResponse.json({ ok: true, ignored: true, reason: ignoredReason || "not_applied" });
  }

  if (billingAccountId) {
    await writeBillingAccountSystemAudit(billingAccountId, event.id, input.externalId, input.auditAction);
  }
  return NextResponse.json({ ok: true });
}

async function applyRegistrationPaymentCompletion(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    paymentId: string;
    paidAt: Date;
    invoiceCustomFields: unknown;
  },
) {
  const fields = jsonObject(input.invoiceCustomFields);
  const isRegistrationPayment =
    clean(fields.kind) === "registration_fee_deposit" || clean(fields.checkoutPurpose) === "registration_fee_deposit";
  if (!isRegistrationPayment) return;

  const registrationFeeCents = centsFromJson(fields.registrationFeeCents);
  const depositCents = centsFromJson(fields.depositCents);
  const totalCents = centsFromJson(fields.totalCents) || registrationFeeCents + depositCents;
  const paidAt = input.paidAt.toISOString();
  await tx.invoice.update({
    where: { id: input.invoiceId },
    data: {
      customFields: {
        ...fields,
        status: "paid",
        paidAt,
        paymentId: input.paymentId,
      },
    },
  });

  const enrollmentId = clean(fields.enrollmentId);
  if (enrollmentId) {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { checklist: true },
    });
    const checklist = markRegistrationPaymentChecklistPaid(enrollment?.checklist, {
      amountCents: totalCents,
      paidAt: input.paidAt,
    });
    await tx.enrollment.updateMany({
      where: { id: enrollmentId },
      data: {
        depositDueCents: depositCents,
        depositPaidCents: depositCents,
        ...(checklist ? { checklist: checklist as unknown as Prisma.InputJsonObject } : {}),
      },
    });
  }

  const submissionId = clean(fields.registrationSubmissionId);
  if (submissionId) {
    const submission = await tx.formSubmission.findUnique({
      where: { id: submissionId },
      select: { data: true },
    });
    if (submission) {
      const data = jsonObject(submission.data);
      const previousPayment = jsonObject(data.registrationPayment);
      await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          data: {
            ...data,
            registrationPayment: {
              ...previousPayment,
              required: true,
              status: "paid",
              invoiceId: input.invoiceId,
              paymentId: input.paymentId,
              paidAt,
              registrationFeeCents,
              depositCents,
              totalCents,
            },
          } as Prisma.InputJsonObject,
        },
      });
    }
  }
}

async function handleConnectedAccountEvent(event: StripeWebhookEvent, matchedTenantId?: string | null) {
  const accountId = event.data.object.id;
  if (!accountId || !accountId.startsWith("acct_")) {
    return NextResponse.json({ ok: true, ignored: true, reason: "invalid_connected_account_object" });
  }

  const centers = await prisma.center.findMany({
    select: {
      id: true,
      crmLocationId: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  const matchedCenters = centers.filter((center) => readStripeConnectedAccountId(center.customFields) === accountId);
  if (!matchedCenters.length) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No center matched the connected account." });
  }

  const tenantId = matchedTenantId || matchedCenters[0]?.organization.tenantId || null;
  const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId });
  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      for (const center of matchedCenters) {
        const existingFields = jsonObject(center.customFields);
        const readiness = retrieved.ok && retrieved.account ? stripeConnectReadinessFromSnapshot(retrieved.account) : null;
        const nextFields = readiness
          ? {
              ...existingFields,
              ...stripeConnectCustomFieldPatch(readiness),
              stripeMerchantCapabilityStatus: retrieved.account?.merchantCapabilityStatus || null,
              stripeRecipientTransferStatus: retrieved.account?.recipientTransferStatus || null,
            }
          : {
              ...existingFields,
              stripeConnectAccountId: accountId,
              stripePayoutStatus: "requirements_updated",
              stripeConnectLastSyncedAt: new Date().toISOString(),
            };

        await tx.center.update({
          where: { id: center.id },
          data: { customFields: nextFields },
        });

        await tx.auditLog.create({
          data: {
            tenantId: center.organization.tenantId,
            centerId: center.id,
            action: "billing.connect.account_requirements_updated",
            resource: "Center",
            resourceId: center.id,
            metadata: {
              stripeEventId: event.id,
              stripeEventType: event.type,
              stripeConnectedAccountId: accountId,
              crmLocationId: center.crmLocationId || null,
              status: nextFields.stripePayoutStatus,
            },
          },
        });
      }
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, updatedCenters: matchedCenters.length });
}

async function handlePayoutCreated(
  event: StripeWebhookEvent,
  payout: StripePayoutObject,
  matchedTenantId: string | null,
  statusCallbackUrl: string | null,
) {
  if (event.livemode !== true) {
    return NextResponse.json({ ok: true, ignored: true, reason: "test_mode_payout" });
  }

  const accountId = clean(event.account);
  const amountCents = numeric(payout.amount);
  const currency = clean(payout.currency);
  if (!accountId.startsWith("acct_") || !payout.id.startsWith("po_") || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !currency) {
    return NextResponse.json({ ok: true, ignored: true, reason: "invalid_payout_event" });
  }

  const centers = await prisma.center.findMany({
    select: {
      id: true,
      crmLocationId: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  const matchedCenters = centers.filter((center) => readStripeConnectedAccountId(center.customFields) === accountId);
  if (matchedCenters.length !== 1) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: matchedCenters.length ? "ambiguous_connected_account_mapping" : "payout_center_not_found",
    });
  }

  const center = matchedCenters[0];
  const tenantId = center.organization.tenantId;
  if (matchedTenantId && matchedTenantId !== tenantId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "payout_tenant_mismatch" });
  }

  const to = payoutSmsRecipient(center.customFields);
  const body = beeSuitePayoutSmsBody({ amountCents, currency, centerId: center.id });
  if (!to || !body) {
    return NextResponse.json({ ok: true, ignored: true, reason: "payout_sms_contact_missing" });
  }

  const dedupeKey = `stripe-payout-created:${event.id}:${center.id}`;
  const delivery = await prisma.$transaction(async (tx) => {
    const pendingDelivery = await tx.integrationDelivery.create({
      data: {
        tenantId,
        centerId: center.id,
        dedupeKey,
        provider: "twilio",
        purpose: "payout_notification_sms",
        direction: "outbound",
        recipient: to,
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: nextIntegrationRetryAt(1),
        payload: {
          to,
          body,
          statusCallbackUrl,
          tenantId,
          dedupeKey,
          stripeEventId: event.id,
          stripePayoutId: payout.id,
          stripeConnectedAccountId: accountId,
          amountCents,
          currency: currency.toLowerCase(),
        } as Prisma.InputJsonObject,
      },
    });
    await recordStripeWebhookEvent(tx, event);
    return pendingDelivery;
  });

  await beginCommunicationSmsDeliveryAttempt(delivery.id);
  const result = await sendPayoutSmsSafely(() => sendSms({ to, body, statusCallbackUrl, tenantId }));
  await finalizeCommunicationSmsDeliveryAttempt({
    id: delivery.id,
    result,
    statusCallbackUrl,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      centerId: center.id,
      action: result.ok ? "billing.payout.notification_sms_sent" : "billing.payout.notification_sms_not_sent",
      resource: "Center",
      resourceId: center.id,
      metadata: {
        stripeEventId: event.id,
        stripePayoutId: payout.id,
        stripeConnectedAccountId: accountId,
        crmLocationId: center.crmLocationId || null,
        amountCents,
        currency: currency.toLowerCase(),
        recipientLast4: to.slice(-4),
        provider: result.provider,
        configured: result.configured,
        providerMessageId: result.id ?? null,
        error: result.error ?? null,
      },
    },
  });

  return NextResponse.json({ ok: true, sent: result.ok, configured: result.configured });
}

async function handleCheckoutExpired(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted) {
  if (session.metadata?.setupFlow === "school_software_payment_method") {
    return NextResponse.json({ ok: true, ignored: true, reason: "school_software_payment_method_setup_expired" });
  }

  if (session.mode === "setup" || session.metadata?.setupFlow === "billing_account_payment_method") {
    const billingAccountId = session.metadata?.billingAccountId;
    if (!billingAccountId) {
      return NextResponse.json({ ok: false, error: "Missing billing account metadata." }, { status: 400 });
    }
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event);
        const account = await tx.billingAccount.findUnique({
          where: { id: billingAccountId },
          select: { customFields: true },
        });
        const currentSetupSessionId = clean(jsonObject(account?.customFields).stripeSetupCheckoutSessionId);
        if (currentSetupSessionId && currentSetupSessionId !== session.id) return "stale" as const;
        const expirationPatch = paymentMethodSetupExpirationPatch({
          currentFields: account?.customFields,
          sessionId: session.id,
          stripeEventId: event.id,
        });
        await tx.billingAccount.update({
          where: { id: billingAccountId },
          data: {
            autopayPlaceholder: expirationPatch.autopayPlaceholder,
            customFields: expirationPatch.customFields as Prisma.InputJsonObject,
          },
        });
        return "expired" as const;
      });
      if (outcome === "stale") return NextResponse.json({ ok: true, staleSetupExpirationIgnored: true });
    } catch (error) {
      if (isDuplicateWebhookEvent(error)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  }

  const paymentId = session.metadata?.paymentId;
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "Missing payment metadata." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true, customFields: true } });
      if (!payment || payment.status !== PaymentStatus.DRAFT) return;
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.VOID,
          externalIdPlaceholder: session.id,
          customFields: {
            ...jsonObject(payment.customFields),
            stripeCheckoutSessionId: session.id,
            stripeEventId: event.id,
            status: "checkout_expired",
          },
        },
      });
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (session.metadata?.invoiceId) {
    await writeSystemAudit(session.metadata.invoiceId, event.id, session.id, "billing.checkout.expired");
  } else if (session.metadata?.paymentScope === "family_balance" && session.metadata.billingAccountId) {
    await writeBillingAccountSystemAudit(session.metadata.billingAccountId, event.id, session.id, "billing.family_payment.checkout_expired");
  }
  return NextResponse.json({ ok: true });
}

async function handlePaymentMethodSetupCompleted(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted, matchedTenantId?: string | null) {
  const billingAccountId = session.metadata?.billingAccountId;
  if (!billingAccountId) {
    return NextResponse.json({ ok: false, error: "Missing billing account metadata." }, { status: 400 });
  }

  const setupIntentId = clean(session.setup_intent);
  const tenantId = matchedTenantId || session.metadata?.tenantId || null;
  const connectedAccountId = clean(session.metadata?.stripeConnectedAccountId) || clean(event.account) || null;
  const setupIntent = setupIntentId ? await retrieveStripeSetupIntent(setupIntentId, { tenantId, connectedAccountId }) : null;
  if (setupIntent && !setupIntent.ok) {
    return NextResponse.json(
      { ok: false, configured: setupIntent.configured, error: setupIntent.error || "Payment setup session could not be retrieved." },
      { status: setupIntent.configured ? 502 : 503 },
    );
  }
  const setupPaymentMethodId = setupIntent?.setupIntent?.paymentMethodId || null;
  const paymentMethodLookup = setupPaymentMethodId
    ? await retrieveStripePaymentMethod(setupPaymentMethodId, { tenantId, connectedAccountId })
    : null;
  const paymentMethodDetails = paymentMethodLookup?.ok ? paymentMethodLookup.paymentMethod : null;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const billingAccount = await tx.billingAccount.findUnique({
        where: { id: billingAccountId },
        select: {
          autopayPlaceholder: true,
          customFields: true,
          family: {
            select: {
              id: true,
              centerId: true,
            },
          },
        },
      });
      if (!billingAccount) return "missing" as const;

      const currentFields = jsonObject(billingAccount.customFields);
      const latestSetupSessionId = clean(currentFields.stripeSetupCheckoutSessionId);
      if (latestSetupSessionId && latestSetupSessionId !== session.id) {
        return "stale" as const;
      }
      const customerId = setupIntent?.setupIntent?.customerId || clean(session.customer) || clean(currentFields.stripeCustomerId);
      const previousPaymentMethodId = clean(currentFields.stripeDefaultPaymentMethodId);
      const paymentMethodId = setupPaymentMethodId || previousPaymentMethodId;
      const requestedSetupMode = clean(session.metadata?.autopaySetupMode);
      const replacedPaymentMethod = Boolean(paymentMethodId && paymentMethodId !== previousPaymentMethodId);
      const lockedFamilyRows = await tx.$queryRaw<Array<{ id: string; centerId: string | null }>>`
        select "id", "centerId"
        from "Family"
        where "id" = ${billingAccount.family.id}
        for update
      `;
      const lockedFamily = lockedFamilyRows[0];
      if (!lockedFamily) throw new Error("Billing family changed while Stripe payment-method setup was completing.");
      await tx.$queryRaw<Array<{ id: string }>>`
        select "id"
        from "Child"
        where "familyId" = ${lockedFamily.id}
        for update
      `;
      const currentChildren = await tx.child.findMany({
        where: { familyId: lockedFamily.id, ...currentlyEnrolledChildWhere() },
        select: { classroom: { select: { centerId: true } } },
      });
      const currentChildCenters = Array.from(new Map(
        currentChildren
          .map((child) => child.classroom?.centerId)
          .filter((centerId): centerId is string => Boolean(centerId))
          .map((centerId) => [centerId, centerId]),
      ).values());
      const resolvedFamilyCenterId = lockedFamily.centerId || (currentChildCenters.length === 1 ? currentChildCenters[0] : null);
      if (resolvedFamilyCenterId) {
        await tx.$queryRaw<Array<{ id: string }>>`
          select "id"
          from "Center"
          where "id" = ${resolvedFamilyCenterId}
          for update
        `;
      }
      const familyCenter = resolvedFamilyCenterId
        ? await tx.center.findUnique({
            where: { id: resolvedFamilyCenterId },
            select: { id: true, customFields: true, organization: { select: { tenantId: true } } },
          })
        : null;
      const activeFamilyAccountId = readStripeConnectedAccountId(familyCenter?.customFields);
      const migrationSessionIsCurrent = Boolean(
        familyCenter
        && familyCenter.id === clean(session.metadata?.centerId)
        && connectedAccountId
        && connectedAccountId === activeFamilyAccountId
        && stripeConnectSavedMethodNeedsReauthorization({
          activeAccountId: activeFamilyAccountId,
          savedMethodAccountId: clean(currentFields.stripeDefaultPaymentMethodConnectedAccountId),
          centerCustomFields: familyCenter.customFields,
        }),
      );
      const setupMode = requestedSetupMode === "preserve_existing" && !migrationSessionIsCurrent
        ? "preserve"
        : requestedSetupMode;
      const lockedGuardianLinks = requestedSetupMode === "preserve_existing"
        ? await tx.$queryRaw<Array<{ userId: string | null }>>`
            select "userId"
            from "Guardian"
            where "familyId" = ${billingAccount.family.id}
              and "userId" is not null
            for update
          `
        : [];
      const autopayPatch = paymentMethodSetupAutopayOutcome({
        autopayPlaceholder: billingAccount.autopayPlaceholder,
        currentFields,
        previousPaymentMethodId,
        paymentMethodId,
        linkedGuardianUserIds: lockedGuardianLinks.map((guardian) => guardian.userId),
        setupMode,
      });
      const setupSucceeded = setupIntent?.setupIntent?.status === "succeeded";
      const setupPending = !setupSucceeded && !["canceled", "setup_failed"].includes(setupIntent?.setupIntent?.status || "");
      const appliedAutopayPatch = setupSucceeded ? autopayPatch : null;
      const auditTenantId = familyCenter?.organization.tenantId || clean(tenantId);
      if (autopayPatch?.preservedExistingConsent && !auditTenantId) {
        throw new Error("Autopay consent migration requires an authoritative tenant for its audit record.");
      }
      const billingAccountUpdate = await tx.billingAccount.updateMany({
        where: {
          id: billingAccountId,
          autopayPlaceholder: billingAccount.autopayPlaceholder,
          customFields: billingAccount.customFields === null
            ? { equals: Prisma.DbNull }
            : { equals: billingAccount.customFields as Prisma.InputJsonValue },
        },
        data: {
          ...(autopayPatch ? { autopayPlaceholder: autopayPatch.autopayPlaceholder } : {}),
          customFields: {
            ...currentFields,
            ...(customerId ? stripeCustomerCustomFieldPatch(currentFields, customerId, connectedAccountId) : {}),
            ...(appliedAutopayPatch ? {
              autopayEnabled: appliedAutopayPatch.autopayEnabled,
              autopayStatus: appliedAutopayPatch.autopayStatus,
              autopayPaymentMethodId: appliedAutopayPatch.autopayPaymentMethodId,
              ...(appliedAutopayPatch.preservedExistingConsent ? {
                autopayConsentMigratedAt: new Date().toISOString(),
                autopayConsentMigrationReason: "stripe_connected_account_payment_method_reauthorized",
                autopayDisabledAt: null,
                autopayDisabledReason: null,
              } : {}),
              ...(appliedAutopayPatch.replacementDisabledAutopay ? {
                autopayDisabledAt: new Date().toISOString(),
                autopayDisabledReason: "saved_payment_method_replaced",
              } : {}),
            } : {}),
            ...(setupPending ? {
              autopayEnabled: false,
              autopayStatus: "pending",
              autopayPaymentMethodId: null,
              stripePendingAutopayOutcome: autopayPatch,
              stripePendingAutopayAuditTenantId: auditTenantId,
              stripePendingAutopayAuditCenterId: familyCenter?.id ?? null,
              stripeBankVerificationPending: true,
            } : {
              stripePendingAutopayOutcome: null,
              stripePendingAutopayAuditTenantId: null,
              stripePendingAutopayAuditCenterId: null,
              stripeBankVerificationPending: false,
            }),
            stripeDefaultPaymentMethodId: setupSucceeded ? (paymentMethodId || null) : (previousPaymentMethodId || null),
            stripeDefaultPaymentMethodConnectedAccountId: setupSucceeded ? (connectedAccountId || null) : (clean(currentFields.stripeDefaultPaymentMethodConnectedAccountId) || null),
            stripePaymentMethodType: setupSucceeded ? (paymentMethodDetails?.type ?? (replacedPaymentMethod ? null : clean(currentFields.stripePaymentMethodType) || null)) : (clean(currentFields.stripePaymentMethodType) || null),
            stripePaymentMethodLast4: setupSucceeded ? (paymentMethodDetails?.last4 ?? (replacedPaymentMethod ? null : clean(currentFields.stripePaymentMethodLast4) || null)) : (clean(currentFields.stripePaymentMethodLast4) || null),
            stripePaymentMethodBrand: setupSucceeded ? (paymentMethodDetails?.brand ?? (replacedPaymentMethod ? null : clean(currentFields.stripePaymentMethodBrand) || null)) : (clean(currentFields.stripePaymentMethodBrand) || null),
            stripePaymentMethodBankName: setupSucceeded ? (paymentMethodDetails?.bankName ?? (replacedPaymentMethod ? null : clean(currentFields.stripePaymentMethodBankName) || null)) : (clean(currentFields.stripePaymentMethodBankName) || null),
            stripePendingPaymentMethodId: setupPending ? (paymentMethodId || null) : null,
            stripePendingPaymentMethodConnectedAccountId: setupPending ? (connectedAccountId || null) : null,
            stripePendingPaymentMethodType: setupPending ? (paymentMethodDetails?.type || null) : null,
            stripePendingPaymentMethodLast4: setupPending ? (paymentMethodDetails?.last4 || null) : null,
            stripePendingPaymentMethodBrand: setupPending ? (paymentMethodDetails?.brand || null) : null,
            stripePendingPaymentMethodBankName: setupPending ? (paymentMethodDetails?.bankName || null) : null,
            stripeSetupIntentId: setupIntentId || null,
            stripeSetupIntentStatus: setupIntent?.setupIntent?.status || null,
            stripeSetupCheckoutSessionId: session.id,
            stripeSetupConnectedAccountId: connectedAccountId || null,
            stripeEventId: event.id,
            stripePaymentMethodSavedAt: setupSucceeded ? new Date().toISOString() : null,
            paymentMethodManagementStatus: setupSucceeded
              ? (paymentMethodId ? "payment_method_saved" : "setup_completed_missing_payment_method")
              : (setupPending ? "pending_bank_verification" : "bank_verification_failed"),
          },
        },
      });
      if (billingAccountUpdate.count !== 1) {
        throw new Error("Billing account consent changed while Stripe payment-method setup was completing.");
      }
      if (appliedAutopayPatch?.preservedExistingConsent) {
        await tx.auditLog.create({
          data: {
            tenantId: auditTenantId,
            centerId: familyCenter?.id ?? null,
            action: "billing.autopay.consent_migrated_to_current_stripe_account",
            resource: "BillingAccount",
            resourceId: billingAccountId,
            metadata: {
              stripeEventId: event.id,
              stripeSessionId: session.id,
            },
          },
        });
        if (familyCenter?.id) {
          await tx.center.update({ where: { id: familyCenter.id }, data: { updatedAt: new Date() } });
        }
      }
      return appliedAutopayPatch?.preservedExistingConsent ? "preserved" as const : "applied" as const;
    });
    if (outcome === "stale") return NextResponse.json({ ok: true, staleSetupSessionIgnored: true });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

async function handlePaymentMethodSetupIntentSucceeded(event: StripeWebhookEvent, setupIntent: StripeSetupIntentObject) {
  const billingAccountId = clean(setupIntent.metadata?.billingAccountId);
  if (!billingAccountId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "billing_account_metadata_missing" });
  }
  const paymentMethodId = clean(setupIntent.payment_method);
  if (!paymentMethodId) {
    return NextResponse.json({ ok: false, error: "Verified setup intent is missing a payment method." }, { status: 400 });
  }
  const paymentMethodLookup = await retrieveStripePaymentMethod(paymentMethodId, {
    tenantId: clean(setupIntent.metadata?.tenantId) || null,
    connectedAccountId: clean(setupIntent.metadata?.stripeConnectedAccountId) || clean(event.account) || null,
  });
  if (!paymentMethodLookup.ok || !paymentMethodLookup.paymentMethod) {
    return NextResponse.json(
      { ok: false, error: paymentMethodLookup.error || "Verified payment method details could not be retrieved." },
      { status: paymentMethodLookup.configured ? 502 : 503 },
    );
  }
  const paymentMethodDetails = paymentMethodLookup.paymentMethod;

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const billingAccount = await tx.billingAccount.findUnique({
        where: { id: billingAccountId },
        select: { autopayPlaceholder: true, customFields: true },
      });
      if (!billingAccount) return;
      const currentFields = jsonObject(billingAccount.customFields);
      if (clean(currentFields.stripeSetupIntentId) !== setupIntent.id) return;
      if (currentFields.stripeBankVerificationPending !== true) return;
      const pendingOutcome = jsonObject(currentFields.stripePendingAutopayOutcome);
      const hasPendingOutcome = Object.keys(pendingOutcome).length > 0;
      const preservedExistingConsent = pendingOutcome.preservedExistingConsent === true;
      const update = await tx.billingAccount.updateMany({
        where: {
          id: billingAccountId,
          autopayPlaceholder: billingAccount.autopayPlaceholder,
          customFields: billingAccount.customFields === null
            ? { equals: Prisma.DbNull }
            : { equals: billingAccount.customFields as Prisma.InputJsonValue },
        },
        data: {
          ...(hasPendingOutcome ? { autopayPlaceholder: pendingOutcome.autopayPlaceholder === true } : {}),
          customFields: {
            ...currentFields,
            ...(hasPendingOutcome ? {
              autopayEnabled: pendingOutcome.autopayEnabled === true,
              autopayStatus: clean(pendingOutcome.autopayStatus) || "disabled",
              autopayPaymentMethodId: clean(pendingOutcome.autopayPaymentMethodId) || null,
            } : {}),
            ...(preservedExistingConsent ? {
              autopayConsentMigratedAt: new Date().toISOString(),
              autopayConsentMigrationReason: "stripe_connected_account_payment_method_reauthorized",
              autopayDisabledAt: null,
              autopayDisabledReason: null,
            } : {}),
            stripeSetupIntentStatus: "succeeded",
            stripeDefaultPaymentMethodId: clean(currentFields.stripePendingPaymentMethodId) || paymentMethodId,
            stripeDefaultPaymentMethodConnectedAccountId: clean(currentFields.stripePendingPaymentMethodConnectedAccountId) || null,
            stripePaymentMethodType: paymentMethodDetails.type || clean(currentFields.stripePendingPaymentMethodType) || null,
            stripePaymentMethodLast4: paymentMethodDetails.last4 || clean(currentFields.stripePendingPaymentMethodLast4) || null,
            stripePaymentMethodBrand: paymentMethodDetails.brand || clean(currentFields.stripePendingPaymentMethodBrand) || null,
            stripePaymentMethodBankName: paymentMethodDetails.bankName || clean(currentFields.stripePendingPaymentMethodBankName) || null,
            stripePendingPaymentMethodId: null,
            stripePendingPaymentMethodConnectedAccountId: null,
            stripePendingPaymentMethodType: null,
            stripePendingPaymentMethodLast4: null,
            stripePendingPaymentMethodBrand: null,
            stripePendingPaymentMethodBankName: null,
            stripeEventId: event.id,
            stripePaymentMethodSavedAt: new Date().toISOString(),
            paymentMethodManagementStatus: "payment_method_saved",
            stripePendingAutopayOutcome: null,
            stripePendingAutopayAuditTenantId: null,
            stripePendingAutopayAuditCenterId: null,
            stripeBankVerificationPending: false,
          },
        },
      });
      if (update.count !== 1) throw new Error("Billing account changed while bank verification was completing.");
      const auditTenantId = clean(currentFields.stripePendingAutopayAuditTenantId);
      if (preservedExistingConsent && auditTenantId) {
        await tx.auditLog.create({
          data: {
            tenantId: auditTenantId,
            centerId: clean(currentFields.stripePendingAutopayAuditCenterId) || null,
            action: "billing.autopay.consent_migrated_to_current_stripe_account",
            resource: "BillingAccount",
            resourceId: billingAccountId,
            metadata: { stripeEventId: event.id, stripeSetupIntentId: setupIntent.id },
          },
        });
      }
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) return NextResponse.json({ ok: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

async function handlePaymentMethodSetupIntentFailed(event: StripeWebhookEvent, setupIntent: StripeSetupIntentObject) {
  const billingAccountId = clean(setupIntent.metadata?.billingAccountId);
  if (!billingAccountId) return NextResponse.json({ ok: true, ignored: true, reason: "billing_account_metadata_missing" });
  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const billingAccount = await tx.billingAccount.findUnique({ where: { id: billingAccountId }, select: { customFields: true } });
      if (!billingAccount) return;
      const currentFields = jsonObject(billingAccount.customFields);
      if (clean(currentFields.stripeSetupIntentId) !== setupIntent.id || currentFields.stripeBankVerificationPending !== true) return;
      const update = await tx.billingAccount.updateMany({
        where: {
          id: billingAccountId,
          customFields: billingAccount.customFields === null
            ? { equals: Prisma.DbNull }
            : { equals: billingAccount.customFields as Prisma.InputJsonValue },
        },
        data: {
          autopayPlaceholder: false,
          customFields: {
            ...currentFields,
            autopayEnabled: false,
            autopayStatus: "disabled",
            autopayPaymentMethodId: null,
            stripePendingPaymentMethodId: null,
            stripePendingPaymentMethodConnectedAccountId: null,
            stripePendingPaymentMethodType: null,
            stripePendingPaymentMethodLast4: null,
            stripePendingPaymentMethodBrand: null,
            stripePendingPaymentMethodBankName: null,
            stripeSetupIntentStatus: "setup_failed",
            paymentMethodManagementStatus: "bank_verification_failed",
            stripePendingAutopayOutcome: null,
            stripePendingAutopayAuditTenantId: null,
            stripePendingAutopayAuditCenterId: null,
            stripeBankVerificationPending: false,
            stripeEventId: event.id,
          },
        },
      });
      if (update.count !== 1) throw new Error("Billing account changed while failed bank verification was being recorded.");
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) return NextResponse.json({ ok: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

async function handleSchoolSoftwarePaymentMethodCompleted(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted, matchedTenantId?: string | null) {
  const centerId = clean(session.metadata?.centerId);
  if (!centerId) return NextResponse.json({ ok: false, error: "Missing school metadata." }, { status: 400 });
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      customFields: true,
      organization: { select: { tenantId: true } },
      ownerGroup: {
        select: {
          name: true,
          ownerType: true,
          billingEmail: true,
          contactName: true,
          customFields: true,
        },
      },
    },
  });
  if (!center) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  const metadataTenantId = clean(session.metadata?.tenantId);
  if ((matchedTenantId && center.organization.tenantId !== matchedTenantId) ||
    (metadataTenantId && center.organization.tenantId !== metadataTenantId)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "software_payment_tenant_mismatch" });
  }
  const fields = jsonObject(center.customFields);
  if (clean(fields.stripeSoftwareSetupSessionId) !== session.id) {
    try {
      await prisma.$transaction((tx) => recordStripeWebhookEvent(tx, event));
    } catch (error) {
      if (!isDuplicateWebhookEvent(error)) throw error;
    }
    return NextResponse.json({ ok: true, ignored: true, reason: "superseded_school_software_setup_session" });
  }
  const tenantId = matchedTenantId || center.organization.tenantId;
  const setupIntentId = clean(session.setup_intent);
  const setupIntent = setupIntentId ? await retrieveStripeSetupIntent(setupIntentId, { tenantId }) : null;
  if (!setupIntent?.ok || !setupIntent.setupIntent?.paymentMethodId) {
    return NextResponse.json({ ok: false, error: setupIntent?.error || "The school payment method could not be confirmed." }, { status: setupIntent?.configured === false ? 503 : 502 });
  }
  const customerId = setupIntent.setupIntent.customerId || clean(session.customer) || clean(session.metadata?.stripeCustomerId);
  const paymentMethodId = setupIntent.setupIntent.paymentMethodId;
  if (!customerId || customerId !== clean(fields.stripeSoftwareCustomerId)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "software_payment_customer_mismatch" });
  }
  const methodLookup = await retrieveStripePaymentMethod(paymentMethodId, { tenantId });
  if (!methodLookup.ok || !methodLookup.paymentMethod || !customerId) {
    return NextResponse.json({ ok: false, error: methodLookup.error || "The school payment method details could not be confirmed." }, { status: methodLookup.configured ? 502 : 503 });
  }
  const methodDetails = methodLookup.paymentMethod;
  const defaultResult = await setStripeCustomerDefaultPaymentMethod({ customerId, paymentMethodId, tenantId });
  if (!defaultResult.ok) {
    return NextResponse.json({ ok: false, error: defaultResult.error || "The default school payment method could not be saved." }, { status: defaultResult.configured ? 502 : 503 });
  }
  const feePolicy = getSchoolSoftwareFeePolicyForCenter(center);
  let subscription: StripeSoftwareSubscriptionSnapshot | null = null;
  const existingSubscriptionId = clean(fields.stripeSoftwareSubscriptionId);
  if (existingSubscriptionId) {
    const updated = await updateStripeSoftwareSubscription({
      subscriptionId: existingSubscriptionId,
      defaultPaymentMethodId: paymentMethodId,
      tenantId,
    });
    if (!updated.ok || !updated.subscription) {
      return NextResponse.json({ ok: false, error: updated.error || "The recurring school software payment method could not be updated." }, { status: updated.configured ? 502 : 503 });
    }
    subscription = updated.subscription;
  } else {
    const price = await ensureStripeSoftwareRecurringPrice({
      tenantId,
      unitAmountCents: feePolicy.unitAmountCents,
    });
    if (!price.ok || !price.priceId) {
      return NextResponse.json({ ok: false, error: price.error || "The school software price could not be prepared." }, { status: price.configured ? 502 : 503 });
    }
    const created = await createStripeSoftwareSubscription({
      customerId,
      paymentMethodId,
      priceId: price.priceId,
      quantity: 1,
      billingStartAt: getSchoolSoftwareBillingStartAt(),
      tenantId,
      centerId,
    });
    if (!created.ok || !created.subscription) {
      return NextResponse.json({ ok: false, error: created.error || "The recurring school software subscription could not be started." }, { status: created.configured ? 502 : 503 });
    }
    subscription = created.subscription;
  }
  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      await tx.center.update({
        where: { id: centerId },
        data: { customFields: {
          ...fields,
          stripeSoftwareCustomerId: customerId,
          stripeSoftwareDefaultPaymentMethodId: paymentMethodId,
          stripeSoftwarePaymentMethodType: methodDetails.type,
          stripeSoftwarePaymentMethodLast4: methodDetails.last4,
          stripeSoftwarePaymentMethodBrand: methodDetails.brand,
          stripeSoftwarePaymentMethodBankName: methodDetails.bankName,
          stripeSoftwarePaymentStatus: "ready",
          stripeSoftwareBillingSource: "external_payment_method",
          stripeSoftwareBillingStartAt: getSchoolSoftwareBillingStartAt().toISOString(),
          stripeSoftwareMonthlyAmountCents: feePolicy.unitAmountCents,
          stripeSoftwareFeeTier: feePolicy.tier,
          stripeSoftwarePaymentPreference: methodDetails.type === "us_bank_account" ? "payout_bank" : methodDetails.type,
          stripeSoftwarePaymentMethodSavedAt: new Date().toISOString(),
          stripeSoftwareSetupIntentId: setupIntentId,
          stripeSoftwareSetupSessionId: session.id,
        } },
      });
      if (subscription) {
        await saveSoftwareSubscriptionSnapshot(tx, centerId, subscription, {
          stripeSoftwareMonthlyAmountCents: feePolicy.unitAmountCents,
          stripeSoftwareFeeTier: feePolicy.tier,
          stripeSoftwareBillingBasis: feePolicy.billingBasis,
          stripeSoftwareBillingSource: "external_payment_method",
          stripeSoftwareBillingStartAt: getSchoolSoftwareBillingStartAt().toISOString(),
        });
      }
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) return NextResponse.json({ ok: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

async function handleFamilyBalanceCheckoutEvent(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted) {
  const metadata = jsonObject(session.metadata) as StripeMetadata;
  const paymentId = clean(metadata.paymentId);
  const billingAccountId = clean(metadata.billingAccountId);
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "Missing family payment metadata." }, { status: 400 });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event);
        const currentPayment = await tx.payment.findUnique({ where: { id: paymentId }, select: { customFields: true } });
        const currentFields = jsonObject(currentPayment?.customFields);
        const failure = achFailurePresentation({
          customFields: currentFields,
          metadata,
          failureCode: clean(currentFields.stripeFailureCode) || null,
        });
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            externalIdPlaceholder: session.id,
            customFields: {
              ...currentFields,
              paymentScope: "family_balance",
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              failedAt: new Date().toISOString(),
              returnedAt: failure.returned ? new Date().toISOString() : null,
              provisionalCreditActive: false,
              retryAvailable: failure.retryAvailable || currentFields.retryAvailable === true,
              status: failure.customStatus || "checkout_failed",
            },
          },
        });
      });
    } catch (error) {
      if (isDuplicateWebhookEvent(error)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw error;
    }
    if (billingAccountId) {
      await writeBillingAccountSystemAudit(billingAccountId, event.id, session.id, "billing.family_payment.checkout_failed");
    }
    return NextResponse.json({ ok: true });
  }

  if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event, "pending");
        const currentPayment = await tx.payment.findUnique({ where: { id: paymentId }, select: { customFields: true } });
        const currentFields = jsonObject(currentPayment?.customFields);
        const achProcessing = isAchPaymentMetadata(metadata);
        await tx.payment.updateMany({
          where: { id: paymentId, status: PaymentStatus.DRAFT },
          data: {
            externalIdPlaceholder: session.id,
            customFields: {
              ...currentFields,
              paymentScope: "family_balance",
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
              stripePaymentStatus: session.payment_status || null,
              stripePaymentIntentStatus: clean(currentFields.stripePaymentIntentStatus) || (achProcessing ? "processing" : null),
              stripeAmountTotalCents: session.amount_total ?? null,
              submittedAt: achProcessing ? new Date().toISOString() : currentFields.submittedAt || null,
              provisionalCreditActive: achProcessing,
              status: achProcessing ? "paid_processing" : "checkout_pending",
            },
          },
        });
      });
    } catch (error) {
      if (isDuplicateWebhookEvent(error)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, pending: true });
  }

  return handleFamilyBalancePaymentSucceeded(event, {
    metadata,
    paymentId,
    externalId: session.id,
    stripePaymentIntentId: clean(session.payment_intent) || null,
    stripePaymentStatus: session.payment_status || null,
    stripeAmountTotalCents: session.amount_total ?? null,
    auditAction: event.type === "checkout.session.async_payment_succeeded"
      ? "billing.family_payment.checkout_async_succeeded"
      : "billing.family_payment.checkout_completed",
    descriptionFallback: "Parent payment",
  });
}

async function handlePaymentIntentProcessing(event: StripeWebhookEvent, paymentIntent: StripePaymentIntentObject) {
  const metadata = metadataOf(paymentIntent);
  const paymentId = clean(metadata.paymentId);
  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Missing payment metadata." });
  }

  let billingAccountId: string | null = null;
  let invoiceId: string | null = null;
  let applied = false;
  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event, "pending");
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, billingAccountId: true, customFields: true },
      });
      if (!payment || payment.status !== PaymentStatus.DRAFT) return;
      billingAccountId = payment.billingAccountId;
      const currentFields = jsonObject(payment.customFields);
      const storedEventCreatedAt = Date.parse(clean(currentFields.stripeEventCreatedAt));
      const processingEventCreatedAt = event.created ? event.created * 1000 : Number.NaN;
      if (Number.isFinite(storedEventCreatedAt) && (
        !Number.isFinite(processingEventCreatedAt) || processingEventCreatedAt <= storedEventCreatedAt
      )) return;
      invoiceId = clean(currentFields.invoiceId) || clean(metadata.invoiceId) || null;
      const achProcessing = isAchPaymentMetadata({
        ...metadata,
        paymentMethodCategory: clean(metadata.paymentMethodCategory) || clean(currentFields.paymentMethodCategory),
        requestedPaymentMethodCategory: clean(metadata.requestedPaymentMethodCategory) || clean(currentFields.requestedPaymentMethodCategory),
      });
      const lifecycleStatus = processingPaymentLifecycleStatus({
        achProcessing,
        collectionMode: clean(metadata.collectionMode) || clean(currentFields.collectionMode),
        currentStatus: clean(currentFields.status),
      });
      const updated = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: PaymentStatus.DRAFT,
          customFields: {
            equals: payment.customFields === null ? Prisma.DbNull : payment.customFields,
          },
        },
        data: {
          externalIdPlaceholder: paymentIntent.id,
          customFields: {
            ...currentFields,
            stripePaymentIntentId: paymentIntent.id,
            stripePaymentIntentStatus: paymentIntent.status || "processing",
            stripeEventId: event.id,
            stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
            submittedAt: currentFields.submittedAt || new Date().toISOString(),
            provisionalCreditActive: achProcessing,
            status: lifecycleStatus,
          } as Prisma.InputJsonObject,
        },
      });
      applied = updated.count === 1;
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) return NextResponse.json({ ok: true, duplicate: true });
    throw error;
  }

  if (applied && invoiceId) {
    await writeSystemAudit(invoiceId, event.id, paymentIntent.id, "billing.payment_intent.processing");
  } else if (applied && billingAccountId) {
    await writeBillingAccountSystemAudit(billingAccountId, event.id, paymentIntent.id, "billing.family_payment.payment_intent_processing");
  }
  return NextResponse.json({ ok: true, pending: applied });
}

async function handlePaymentIntentFailed(event: StripeWebhookEvent, paymentIntent: StripePaymentIntentObject) {
  const metadata = metadataOf(paymentIntent);
  if (!metadata.paymentId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Missing payment metadata." });
  }
  const collectionMode = clean(metadata.collectionMode);
  const canceled = event.type === "payment_intent.canceled";
  let failureApplied = false;
  let achReturned = false;
  let recoverableCheckoutFailure = false;
  let paymentFound = false;
  let storedBillingAccountId: string | null = null;
  let verifiedInvoiceId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const currentPayment = await tx.payment.findUnique({
        where: { id: metadata.paymentId },
        select: { status: true, provider: true, billingAccountId: true, customFields: true },
      });
      if (!currentPayment) return;
      paymentFound = true;
      storedBillingAccountId = currentPayment.billingAccountId;
      const currentFields = jsonObject(currentPayment.customFields);
      if (canceled && isReturnedStripePayment(currentPayment)) return;
      const candidateInvoiceId = clean(currentFields.invoiceId) || clean(metadata.invoiceId);
      if (candidateInvoiceId) {
        const verifiedInvoice = await tx.invoice.findFirst({
          where: { id: candidateInvoiceId, billingAccountId: currentPayment.billingAccountId },
          select: { id: true },
        });
        verifiedInvoiceId = verifiedInvoice?.id ?? null;
      }
      const disposition = stripePaymentIntentFailureDisposition({
        collectionMode,
        customFields: currentFields,
      });
      const failureCode = clean(paymentIntent.last_payment_error?.code)
        || clean(paymentIntent.last_payment_error?.decline_code)
        || null;
      const achFailure = canceled
        ? {
            returned: false,
            retryAvailable: true,
            failureCode: "payment_canceled",
            customStatus: "payment_canceled",
          }
        : achFailurePresentation({
            customFields: currentFields,
            metadata,
            failureCode,
          });
      achReturned = achFailure.returned;
      recoverableCheckoutFailure = disposition.recoverableCheckout && !achFailure.returned;
      const failedPayment = await tx.payment.updateMany({
        where: { id: metadata.paymentId, status: { in: [PaymentStatus.DRAFT, PaymentStatus.FAILED] } },
        data: {
          status: canceled || achFailure.returned ? PaymentStatus.FAILED : disposition.paymentStatus,
          customFields: {
            ...currentFields,
            stripePaymentIntentId: paymentIntent.id,
            stripeEventId: event.id,
            stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
            stripePaymentIntentStatus: paymentIntent.status || null,
            stripeFailureCode: achFailure.failureCode,
            stripeFailureMessage: canceled
              ? "Payment was canceled before settlement."
              : paymentIntent.last_payment_error?.message || null,
            failedAt: new Date().toISOString(),
            canceledAt: canceled ? new Date().toISOString() : null,
            returnedAt: achFailure.returned ? new Date().toISOString() : null,
            provisionalCreditActive: false,
            retryAvailable: achFailure.retryAvailable,
            collectionMode: collectionMode || null,
            status: achFailure.customStatus || disposition.customStatus,
          },
        },
      });
      failureApplied = failedPayment.count === 1;
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (!failureApplied) {
    if (paymentFound && verifiedInvoiceId) {
      await writeSystemAudit(verifiedInvoiceId, event.id, paymentIntent.id, "billing.payment_intent.failure_ignored");
    } else if (paymentFound && storedBillingAccountId) {
      await writeBillingAccountSystemAudit(
        storedBillingAccountId,
        event.id,
        paymentIntent.id,
        "billing.family_payment.payment_intent_failure_ignored",
      );
    }
    return NextResponse.json({ ok: true, ignored: true, reason: paymentFound ? "payment_not_chargeable" : "payment_not_found" });
  }

  if (metadata.invoiceId) {
    await writeSystemAudit(
      metadata.invoiceId,
      event.id,
      paymentIntent.id,
      canceled
        ? "billing.payment_intent.canceled"
        : achReturned
        ? "billing.ach_payment.returned"
        : collectionMode === "autopay"
        ? "billing.autopay.failed"
        : collectionMode === "stored_method"
          ? "billing.stored_method.failed"
          : collectionMode === "director_saved_method"
            ? "billing.family_payment.payment_intent_failed"
          : recoverableCheckoutFailure
            ? "billing.checkout.payment_method_retry_required"
            : "billing.payment_intent.failed",
    );
  } else if (clean(metadata.paymentScope) === "family_balance" && metadata.billingAccountId) {
    await writeBillingAccountSystemAudit(
      metadata.billingAccountId,
      event.id,
      paymentIntent.id,
      canceled
        ? "billing.family_payment.payment_intent_canceled"
        : achReturned
        ? "billing.family_payment.ach_returned"
        : recoverableCheckoutFailure
        ? "billing.family_payment.checkout_payment_method_retry_required"
        : "billing.family_payment.payment_intent_failed",
    );
  }
  return NextResponse.json({ ok: true });
}

async function handlePaymentIntentSucceeded(event: StripeWebhookEvent, paymentIntent: StripePaymentIntentObject) {
  const metadata = metadataOf(paymentIntent);
  const invoiceId = metadata.invoiceId;
  const paymentId = metadata.paymentId;
  if (!invoiceId && paymentId && clean(metadata.paymentScope) === "family_balance") {
    return handleFamilyBalancePaymentSucceeded(event, {
      metadata,
      paymentId,
      externalId: paymentIntent.id,
      stripePaymentIntentId: paymentIntent.id,
      stripePaymentStatus: paymentIntent.status || null,
      stripeAmountTotalCents: paymentIntent.amount ?? null,
      auditAction: "billing.family_payment.payment_intent_succeeded",
      descriptionFallback: clean(metadata.collectionMode) === "director_saved_method" ? "Director saved method payment" : "Parent payment",
    });
  }
  if (!invoiceId || !paymentId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Missing invoice/payment metadata." });
  }

  const collectionMode = clean(metadata.collectionMode);
  const isAutopay = collectionMode === "autopay";
  const isStoredMethod = collectionMode === "stored_method";
  let applied = false;
  let ignoredReason: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const currentPayment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, billingAccountId: true, amountCents: true, customFields: true },
      });
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true, billingAccountId: true, totalCents: true, customFields: true },
      });
      if (!currentPayment || !invoice) {
        ignoredReason = currentPayment ? "invoice_not_found" : "payment_not_found";
        return;
      }
      const currentPaymentFields = jsonObject(currentPayment.customFields);
      if (currentPayment.status === PaymentStatus.PAID && clean(currentPaymentFields.stripePaymentIntentId) === paymentIntent.id) {
        ignoredReason = "payment_already_applied";
        return;
      }

      const accountCreditAppliedCents = Math.max(
        0,
        Number(metadata.accountCreditAppliedCents || currentPaymentFields.accountCreditAppliedCents || 0) || 0,
      );
      const guard = checkoutApplicationGuard({
        invoiceStatus: invoice.status,
        invoiceBillingAccountId: invoice.billingAccountId,
        invoiceTotalCents: invoice.totalCents,
        paymentStatus: currentPayment.status,
        paymentBillingAccountId: currentPayment.billingAccountId,
        paymentAmountCents: currentPayment.amountCents,
        accountCreditAppliedCents,
      });
      if (!guard.ok) {
        ignoredReason = guard.reason;
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: currentPayment.status === PaymentStatus.PAID ? PaymentStatus.PAID : PaymentStatus.VOID,
            externalIdPlaceholder: paymentIntent.id,
            customFields: {
              ...jsonObject(currentPayment.customFields),
              stripePaymentIntentId: paymentIntent.id,
              stripeEventId: event.id,
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
              stripePaymentIntentStatus: paymentIntent.status || null,
              stripeAmountTotalCents: paymentIntent.amount ?? null,
              ignoredReason: guard.reason,
              requiresManualReview: guard.reason === "invoice_already_paid",
              status: "payment_intent_ignored",
            },
          },
        });
        return;
      }

      const paidAt = new Date();
      const invoiceClaim = await tx.invoice.updateMany({
        where: { id: invoiceId, status: PaymentStatus.OPEN },
        data: {
          status: PaymentStatus.PAID,
          customFields: {
            ...jsonObject(invoice.customFields),
            status: "paid",
            paidAt: paidAt.toISOString(),
            paymentId,
            paidWithAccountCredit: accountCreditAppliedCents > 0,
            accountCreditAppliedCents,
            stripeChargePrincipalCents: currentPayment.amountCents,
          } as Prisma.InputJsonObject,
        },
      });
      if (invoiceClaim.count !== 1) {
        ignoredReason = "invoice_already_paid";
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.VOID,
            externalIdPlaceholder: paymentIntent.id,
            customFields: {
              ...jsonObject(currentPayment.customFields),
              stripePaymentIntentId: paymentIntent.id,
              stripeEventId: event.id,
              stripePaymentIntentStatus: paymentIntent.status || null,
              stripeAmountTotalCents: paymentIntent.amount ?? null,
              ignoredReason,
              requiresManualReview: true,
              status: "payment_intent_ignored",
            },
          },
        });
        return;
      }

      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.PAID,
          paidAt,
          externalIdPlaceholder: paymentIntent.id,
          customFields: {
            ...jsonObject(currentPayment.customFields),
            stripePaymentIntentId: paymentIntent.id,
            stripeEventId: event.id,
            stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
            stripePaymentIntentStatus: paymentIntent.status || null,
            stripeAmountTotalCents: paymentIntent.amount ?? null,
            invoiceAmountCents: Number(metadata.invoiceAmountCents || invoice.totalCents || 0) || null,
            accountCreditAppliedCents,
            stripeChargePrincipalCents: currentPayment.amountCents,
            parentSurchargeAmountCents: Number(metadata.parentSurchargeAmountCents || 0) || 0,
            parentProcessingRecoveryAmountCents: Number(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents || 0) || 0,
            schoolProcessingFeeAmountCents: Number(metadata.schoolProcessingFeeAmountCents || 0) || 0,
            beeSuitePaymentOperationsFeeAmountCents: Number(metadata.beeSuitePaymentOperationsFeeAmountCents || 0) || 0,
            checkoutTotalCents: Number(metadata.checkoutTotalCents || paymentIntent.amount || 0) || null,
            applicationFeeAmountCents: Number(metadata.applicationFeeAmountCents || 0) || 0,
            collectionMode: collectionMode || null,
            provisionalCreditActive: false,
            status: "paid",
          },
        },
      });
      const updatedAccount = await tx.billingAccount.update({
        where: { id: payment.billingAccountId },
        data: { balanceCents: { decrement: payment.amountCents } },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: payment.billingAccountId,
          invoiceId,
          paymentId: payment.id,
          type: "payment",
          description: isAutopay ? "Autopay payment" : isStoredMethod ? "Saved method payment" : "Parent payment",
          amountCents: -payment.amountCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "stripe",
          externalId: paymentIntent.id,
          metadata: {
            stripeEventId: event.id,
            stripePaymentIntentId: paymentIntent.id,
            stripeAmountTotalCents: paymentIntent.amount ?? null,
            collectionMode: collectionMode || null,
            invoiceAmountCents: Number(metadata.invoiceAmountCents || invoice.totalCents || 0) || null,
            accountCreditAppliedCents,
            stripeChargePrincipalCents: currentPayment.amountCents,
            parentSurchargeAmountCents: Number(metadata.parentSurchargeAmountCents || 0) || 0,
            parentProcessingRecoveryAmountCents: Number(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents || 0) || 0,
            schoolProcessingFeeAmountCents: Number(metadata.schoolProcessingFeeAmountCents || 0) || 0,
            beeSuitePaymentOperationsFeeAmountCents: Number(metadata.beeSuitePaymentOperationsFeeAmountCents || 0) || 0,
            applicationFeeAmountCents: Number(metadata.applicationFeeAmountCents || 0) || 0,
          },
        },
      });
      if (accountCreditAppliedCents > 0) {
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: payment.billingAccountId,
            invoiceId,
            type: "account_credit_application",
            description: "Account credit applied to invoice",
            amountCents: 0,
            balanceAfterCents: updatedAccount.balanceCents,
            sourceSystem: "bee_suite",
            externalId: `account-credit:invoice:${invoiceId}`,
            metadata: {
              invoiceAmountCents: invoice.totalCents,
              accountCreditAppliedCents,
              stripeChargePrincipalCents: currentPayment.amountCents,
              stripePaymentIntentId: paymentIntent.id,
              stripeEventId: event.id,
            },
          },
        });
      }
      await applyRegistrationPaymentCompletion(tx, {
        invoiceId,
        paymentId: payment.id,
        paidAt,
        invoiceCustomFields: invoice.customFields,
      });
      applied = true;
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (!applied) {
    if (ignoredReason !== "invoice_not_found" && ignoredReason !== "payment_not_found") {
      await writeSystemAudit(
        invoiceId,
        event.id,
        paymentIntent.id,
        isAutopay ? "billing.autopay.ignored" : isStoredMethod ? "billing.stored_method.ignored" : "billing.payment_intent.ignored",
      );
    }
    return NextResponse.json({ ok: true, ignored: true, reason: ignoredReason || "not_applied" });
  }

  await writeSystemAudit(
    invoiceId,
    event.id,
    paymentIntent.id,
    isAutopay ? "billing.autopay.completed" : isStoredMethod ? "billing.stored_method.completed" : "billing.payment_intent.succeeded",
  );
  return NextResponse.json({ ok: true });
}

async function handleChargeRefunded(event: StripeWebhookEvent, charge: StripeChargeObject) {
  const metadata = metadataOf(charge);
  let affectedBillingAccountId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const payment = await findPaymentForStripeObject(tx, charge);
      if (!payment) return;
      affectedBillingAccountId = payment.billingAccountId;

      const currentFields = jsonObject(payment.customFields);
      const previousRefundedCents = numeric(currentFields.stripeAmountRefundedCents);
      const refundedCents = numeric(charge.amount_refunded);
      const refundDeltaCents = Math.max(0, refundedCents - previousRefundedCents);
      const invoiceId = await invoiceIdForPayment(tx, payment.id, metadata);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: charge.refunded ? PaymentStatus.REFUNDED : payment.status,
          customFields: {
            ...currentFields,
            stripeChargeId: charge.id,
            stripePaymentIntentId: clean(charge.payment_intent) || currentFields.stripePaymentIntentId || null,
            stripeEventId: event.id,
            stripeAmountRefundedCents: refundedCents,
            stripeFullyRefunded: charge.refunded === true,
            status: charge.refunded ? "refunded" : "partially_refunded",
          },
        },
      });

      if (refundDeltaCents > 0 && invoiceId) {
        const updatedAccount = await tx.billingAccount.update({
          where: { id: payment.billingAccountId },
          data: { balanceCents: { increment: refundDeltaCents } },
        });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: PaymentStatus.OPEN },
        });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: payment.billingAccountId,
            invoiceId,
            paymentId: payment.id,
            type: "refund",
            description: charge.refunded ? "Payment refunded" : "Payment partially refunded",
            amountCents: refundDeltaCents,
            balanceAfterCents: updatedAccount.balanceCents,
            sourceSystem: "stripe",
            externalId: `stripe-refund:${charge.id}:${refundedCents}`,
            metadata: {
              stripeEventId: event.id,
              stripeChargeId: charge.id,
              stripePaymentIntentId: clean(charge.payment_intent) || null,
              refundedCents,
              refundDeltaCents,
            },
          },
        });
      }
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (metadata.invoiceId) {
    await writeSystemAudit(metadata.invoiceId, event.id, charge.id, "billing.charge.refunded");
  } else if (affectedBillingAccountId) {
    await writeBillingAccountSystemAudit(affectedBillingAccountId, event.id, charge.id, "billing.charge.refunded");
  }
  return NextResponse.json({ ok: true });
}

async function handleDisputeLifecycle(event: StripeWebhookEvent, dispute: StripeDisputeObject) {
  const metadata = metadataOf(dispute);
  let affectedBillingAccountId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const payment = await findPaymentForStripeObject(tx, dispute);
      if (!payment) return;
      affectedBillingAccountId = payment.billingAccountId;
      const currentFields = jsonObject(payment.customFields);
      const disputeAmountCents = numeric(dispute.amount);
      const ledgerActive = currentFields.stripeDisputeLedgerActive === true;
      const assessParentBalance = (event.type === "charge.dispute.created" || event.type === "charge.dispute.funds_withdrawn") && !ledgerActive;
      const reverseParentBalance = (
        event.type === "charge.dispute.funds_reinstated" ||
        (event.type === "charge.dispute.closed" && dispute.status === "won")
      ) && ledgerActive;
      const invoiceId = await invoiceIdForPayment(tx, payment.id, metadata);
      let ledgerActiveAfterEvent = ledgerActive;

      if (assessParentBalance && disputeAmountCents > 0) {
        const updatedAccount = await tx.billingAccount.update({
          where: { id: payment.billingAccountId },
          data: { balanceCents: { increment: disputeAmountCents } },
        });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: payment.billingAccountId,
            invoiceId,
            paymentId: payment.id,
            type: "chargeback",
            description: "Chargeback added back to parent balance",
            amountCents: disputeAmountCents,
            balanceAfterCents: updatedAccount.balanceCents,
            sourceSystem: "stripe",
            externalId: `stripe-dispute:${dispute.id}:assessment`,
            metadata: {
              stripeEventId: event.id,
              stripeDisputeId: dispute.id,
              stripeChargeId: clean(dispute.charge) || null,
              stripePaymentIntentId: clean(dispute.payment_intent) || null,
              reason: dispute.reason || null,
            },
          },
        });
        ledgerActiveAfterEvent = true;
      } else if (reverseParentBalance && disputeAmountCents > 0) {
        const updatedAccount = await tx.billingAccount.update({
          where: { id: payment.billingAccountId },
          data: { balanceCents: { decrement: disputeAmountCents } },
        });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: payment.billingAccountId,
            invoiceId,
            paymentId: payment.id,
            type: "chargeback_reversal",
            description: "Chargeback reversed after Stripe returned the funds",
            amountCents: -disputeAmountCents,
            balanceAfterCents: updatedAccount.balanceCents,
            sourceSystem: "stripe",
            externalId: `stripe-dispute:${dispute.id}:reversal`,
            metadata: {
              stripeEventId: event.id,
              stripeDisputeId: dispute.id,
              stripeChargeId: clean(dispute.charge) || null,
              stripePaymentIntentId: clean(dispute.payment_intent) || null,
              status: dispute.status || null,
            },
          },
        });
        ledgerActiveAfterEvent = false;
      }

      const achReturned = ledgerActiveAfterEvent && isAchReturnReason(dispute.reason);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          customFields: {
            ...currentFields,
            stripeDisputeId: dispute.id,
            stripeDisputeAmountCents: disputeAmountCents,
            stripeDisputeReason: dispute.reason || null,
            stripeDisputeStatus: dispute.status || null,
            stripeDisputeChargeId: clean(dispute.charge) || null,
            stripePaymentIntentId: clean(dispute.payment_intent) || currentFields.stripePaymentIntentId || null,
            stripeEventId: event.id,
            stripeDisputeLedgerActive: ledgerActiveAfterEvent,
            returnedAt: achReturned ? new Date().toISOString() : currentFields.returnedAt || null,
            provisionalCreditActive: false,
            retryAvailable: achReturned && clean(dispute.reason) === "insufficient_funds",
            status: achReturned ? "payment_returned" : ledgerActiveAfterEvent ? "disputed" : dispute.status === "won" ? "paid" : "dispute_closed",
          },
        },
      });
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (metadata.invoiceId) {
    await writeSystemAudit(metadata.invoiceId, event.id, dispute.id, `billing.${event.type.replaceAll(".", "_")}`);
  } else if (affectedBillingAccountId) {
    await writeBillingAccountSystemAudit(
      affectedBillingAccountId,
      event.id,
      dispute.id,
      `billing.${event.type.replaceAll(".", "_")}`,
    );
  }
  return NextResponse.json({ ok: true });
}

async function writeSystemAudit(invoiceId: string, stripeEventId: string, sessionId: string, action = "billing.checkout.completed") {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      billingAccount: {
        select: {
          family: { select: { centerId: true } },
        },
      },
    },
  });

  const center = invoice?.billingAccount.family.centerId
    ? await prisma.center.findUnique({
        where: { id: invoice.billingAccount.family.centerId },
        select: {
          id: true,
          organization: { select: { tenantId: true } },
        },
      })
    : null;
  const tenant = center?.organization.tenantId
    ? { id: center.organization.tenantId }
    : await prisma.tenant.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });

  if (!tenant) return;

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      centerId: center?.id ?? null,
      action,
      resource: "Invoice",
      resourceId: invoiceId,
      metadata: {
        stripeEventId,
        stripeSessionId: sessionId,
      },
    },
  });
  if (center?.id) {
    await prisma.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });
  }
}

async function writeBillingAccountSystemAudit(billingAccountId: string, stripeEventId: string, sessionId: string, action: string) {
  const account = await prisma.billingAccount.findUnique({
    where: { id: billingAccountId },
    select: {
      family: { select: { centerId: true } },
    },
  });

  const center = account?.family.centerId
    ? await prisma.center.findUnique({
        where: { id: account.family.centerId },
        select: {
          id: true,
          organization: { select: { tenantId: true } },
        },
      })
    : null;
  const tenant = center?.organization.tenantId
    ? { id: center.organization.tenantId }
    : await prisma.tenant.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });

  if (!tenant) return;

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      centerId: center?.id ?? null,
      action,
      resource: "BillingAccount",
      resourceId: billingAccountId,
      metadata: {
        stripeEventId,
        stripeSessionId: sessionId,
      },
    },
  });
  if (center?.id) {
    await prisma.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });
  }
}

async function dispatchAuthenticatedEvent(
  event: StripeWebhookEvent,
  matchedTenantId: string | null,
  statusCallbackUrl: string | null,
) {
  if (accountEventType(event.type)) {
    return handleConnectedAccountEvent(event, matchedTenantId);
  }

  if (isStripeWebhookPayoutEvent(event.type)) {
    return handlePayoutCreated(event, event.data.object as StripePayoutObject, matchedTenantId, statusCallbackUrl);
  }

  if (isStripeWebhookSoftwareBillingEvent(event.type)) {
    const object = jsonObject(event.data.object);
    const metadata = jsonObject(object.metadata);
    const subscriptionDetails = jsonObject(object.subscription_details);
    const subscriptionMetadata = jsonObject(subscriptionDetails.metadata);
    const centerId = clean(metadata.centerId) || clean(subscriptionMetadata.centerId);
    const customerId = clean(object.customer);
    const center = centerId
      ? await prisma.center.findUnique({ where: { id: centerId }, select: { id: true, customFields: true, organization: { select: { tenantId: true } } } })
      : customerId
        ? await prisma.center.findFirst({
            where: {
              customFields: { path: ["stripeSoftwareCustomerId"], equals: customerId },
              ...(matchedTenantId ? { organization: { tenantId: matchedTenantId } } : {}),
            },
            select: { id: true, customFields: true, organization: { select: { tenantId: true } } },
          })
        : null;
    if (!center) return NextResponse.json({ ok: true, ignored: true, reason: "software_billing_center_not_found" });
    if (matchedTenantId && center.organization.tenantId !== matchedTenantId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "software_billing_tenant_mismatch" });
    }
    const fields = jsonObject(center.customFields);
    const items = jsonObject(object.items);
    const firstItem = Array.isArray(items.data) ? jsonObject(items.data[0]) : {};
    const price = jsonObject(firstItem.price);
    const patch: Record<string, unknown> = { stripeSoftwareLastWebhookAt: new Date().toISOString(), stripeSoftwareLastWebhookEventId: event.id };
    if (event.type.startsWith("customer.subscription.")) {
      patch.stripeSoftwareSubscriptionId = clean(object.id);
      patch.stripeSoftwareSubscriptionStatus = event.type === "customer.subscription.deleted" ? "canceled" : clean(object.status) || "unknown";
      patch.stripeSoftwareSubscriptionItemId = clean(firstItem.id) || null;
      patch.stripeSoftwarePriceId = clean(price.id) || null;
      patch.stripeSoftwareQuantity = typeof firstItem.quantity === "number" ? firstItem.quantity : 0;
      patch.stripeSoftwareCancelAtPeriodEnd = object.cancel_at_period_end === true;
      patch.stripeSoftwareCurrentPeriodStart = typeof firstItem.current_period_start === "number" ? new Date(firstItem.current_period_start * 1000).toISOString() : null;
      patch.stripeSoftwareCurrentPeriodEnd = typeof firstItem.current_period_end === "number" ? new Date(firstItem.current_period_end * 1000).toISOString() : null;
    } else {
      patch.stripeSoftwareLatestInvoiceId = clean(object.id);
      patch.stripeSoftwareLatestInvoiceStatus = event.type.replace("invoice.", "");
      patch.stripeSoftwareLatestInvoiceAmountCents = typeof object.amount_due === "number" ? object.amount_due : null;
      patch.stripeSoftwareLatestInvoicePaidCents = typeof object.amount_paid === "number" ? object.amount_paid : null;
      patch.stripeSoftwareLatestInvoiceUrl = clean(object.hosted_invoice_url) || null;
      patch.stripeSoftwareLatestInvoiceAt = new Date().toISOString();
      patch.stripeSoftwarePaymentStatus = event.type === "invoice.paid" ? "current" : event.type === "invoice.payment_action_required" ? "action_required" : "past_due";
    }
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      await tx.center.update({ where: { id: center.id }, data: { customFields: { ...fields, ...patch } as Prisma.InputJsonObject } });
    });
    return NextResponse.json({ ok: true });
  }

  if (!isStripeWebhookPaymentEvent(event.type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (event.type === "payment_intent.succeeded") {
    return handlePaymentIntentSucceeded(event, event.data.object as StripePaymentIntentObject);
  }

  if (event.type === "payment_intent.processing") {
    return handlePaymentIntentProcessing(event, event.data.object as StripePaymentIntentObject);
  }

  if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
    return handlePaymentIntentFailed(event, event.data.object as StripePaymentIntentObject);
  }

  if (event.type === "setup_intent.succeeded") {
    return handlePaymentMethodSetupIntentSucceeded(event, event.data.object as StripeSetupIntentObject);
  }

  if (event.type === "setup_intent.setup_failed") {
    return handlePaymentMethodSetupIntentFailed(event, event.data.object as StripeSetupIntentObject);
  }

  if (event.type === "charge.refunded") {
    return handleChargeRefunded(event, event.data.object as StripeChargeObject);
  }

  if (event.type.startsWith("charge.dispute.")) {
    return handleDisputeLifecycle(event, event.data.object as StripeDisputeObject);
  }

  const session = event.data.object as StripeCheckoutSessionCompleted;
  if (event.type === "checkout.session.completed" && session.metadata?.setupFlow === "school_software_payment_method") {
    return handleSchoolSoftwarePaymentMethodCompleted(event, session, matchedTenantId);
  }
  if (event.type === "checkout.session.completed" && (session.mode === "setup" || session.metadata?.setupFlow === "billing_account_payment_method")) {
    return handlePaymentMethodSetupCompleted(event, session, matchedTenantId);
  }

  if (session.metadata?.source === "terminal_store") {
    return handleTerminalStoreCheckoutEvent(event, session);
  }

  const invoiceId = session.metadata?.invoiceId;
  const paymentId = session.metadata?.paymentId;

  if (event.type === "checkout.session.expired") {
    return handleCheckoutExpired(event, session);
  }

  if (!invoiceId && paymentId && session.metadata?.paymentScope === "family_balance") {
    return handleFamilyBalanceCheckoutEvent(event, session);
  }

  if (!invoiceId || !paymentId) {
    return NextResponse.json({ ok: false, error: "Missing invoice/payment metadata." }, { status: 400 });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event);
        const currentPayment = await tx.payment.findUnique({ where: { id: paymentId }, select: { customFields: true } });
        const currentFields = jsonObject(currentPayment?.customFields);
        const failure = achFailurePresentation({
          customFields: currentFields,
          metadata: session.metadata,
          failureCode: clean(currentFields.stripeFailureCode) || null,
        });
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            externalIdPlaceholder: session.id,
            customFields: {
              ...currentFields,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              failedAt: new Date().toISOString(),
              returnedAt: failure.returned ? new Date().toISOString() : null,
              provisionalCreditActive: false,
              retryAvailable: failure.retryAvailable || currentFields.retryAvailable === true,
              status: failure.customStatus || "checkout_failed",
            },
          },
        });
      });
    } catch (error) {
      if (isDuplicateWebhookEvent(error)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw error;
    }
    await writeSystemAudit(invoiceId, event.id, session.id, "billing.checkout.failed");
    return NextResponse.json({ ok: true });
  }

  if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event, "pending");
        const currentPayment = await tx.payment.findUnique({ where: { id: paymentId }, select: { customFields: true } });
        const currentFields = jsonObject(currentPayment?.customFields);
        const achProcessing = isAchPaymentMetadata(session.metadata ?? {});
        await tx.payment.updateMany({
          where: { id: paymentId, status: PaymentStatus.DRAFT },
          data: {
            externalIdPlaceholder: session.id,
            customFields: {
              ...currentFields,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
              stripePaymentStatus: session.payment_status || null,
              stripePaymentIntentStatus: clean(currentFields.stripePaymentIntentStatus) || (achProcessing ? "processing" : null),
              stripeAmountTotalCents: session.amount_total ?? null,
              submittedAt: achProcessing ? new Date().toISOString() : currentFields.submittedAt || null,
              provisionalCreditActive: achProcessing,
              status: achProcessing ? "paid_processing" : "checkout_pending",
            },
          },
        });
      });
    } catch (error) {
      if (isDuplicateWebhookEvent(error)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw error;
    }
    await writeSystemAudit(invoiceId, event.id, session.id, "billing.checkout.pending");
    return NextResponse.json({ ok: true, pending: true });
  }

  let applied = false;
  let ignoredReason: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const currentPayment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, billingAccountId: true, amountCents: true, customFields: true },
      });
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true, billingAccountId: true, totalCents: true, customFields: true },
      });
      if (!currentPayment || !invoice) {
        ignoredReason = currentPayment ? "invoice_not_found" : "payment_not_found";
        return;
      }

      const guard = checkoutApplicationGuard({
        invoiceStatus: invoice.status,
        invoiceBillingAccountId: invoice.billingAccountId,
        invoiceTotalCents: invoice.totalCents,
        paymentStatus: currentPayment.status,
        paymentBillingAccountId: currentPayment.billingAccountId,
        paymentAmountCents: currentPayment.amountCents,
      });
      if (!guard.ok) {
        ignoredReason = guard.reason;
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: currentPayment.status === PaymentStatus.PAID ? PaymentStatus.PAID : PaymentStatus.VOID,
            externalIdPlaceholder: session.id,
            customFields: {
              ...jsonObject(currentPayment.customFields),
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              ignoredReason: guard.reason,
              requiresManualReview: guard.reason === "invoice_already_paid",
              status: "checkout_ignored",
            },
          },
        });
        return;
      }

      const invoiceClaim = await tx.invoice.updateMany({
        where: { id: invoiceId, status: PaymentStatus.OPEN },
        data: { status: PaymentStatus.PAID },
      });
      if (invoiceClaim.count !== 1) {
        ignoredReason = "invoice_already_paid";
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.VOID,
            externalIdPlaceholder: session.id,
            customFields: {
              ...jsonObject(currentPayment.customFields),
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              ignoredReason,
              requiresManualReview: true,
              status: "checkout_ignored",
            },
          },
        });
        return;
      }

      const paidAt = new Date();
      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.PAID,
          paidAt,
          externalIdPlaceholder: session.id,
          customFields: {
            ...jsonObject(currentPayment?.customFields),
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            stripeEventId: event.id,
            stripePaymentStatus: session.payment_status || null,
            stripeAmountTotalCents: session.amount_total ?? null,
            invoiceAmountCents: Number(session.metadata?.invoiceAmountCents || 0) || null,
            parentSurchargeAmountCents: Number(session.metadata?.parentSurchargeAmountCents || 0) || 0,
            parentProcessingRecoveryAmountCents: Number(session.metadata?.parentProcessingRecoveryAmountCents || session.metadata?.parentSurchargeAmountCents || 0) || 0,
            schoolProcessingFeeAmountCents: Number(session.metadata?.schoolProcessingFeeAmountCents || 0) || 0,
            beeSuitePaymentOperationsFeeAmountCents: Number(session.metadata?.beeSuitePaymentOperationsFeeAmountCents || 0) || 0,
            checkoutTotalCents: Number(session.metadata?.checkoutTotalCents || session.amount_total || 0) || null,
            applicationFeeAmountCents: Number(session.metadata?.applicationFeeAmountCents || 0) || 0,
            ...productPaymentMetadata(session.metadata ?? {}),
            provisionalCreditActive: false,
            status: "paid",
          },
        },
      });
      const updatedAccount = await tx.billingAccount.update({
        where: { id: payment.billingAccountId },
        data: { balanceCents: { decrement: payment.amountCents } },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: payment.billingAccountId,
          invoiceId,
          paymentId: payment.id,
          type: "payment",
          description: familyPaymentDescription(session.metadata ?? {}, "Parent payment"),
          amountCents: -payment.amountCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "stripe",
          externalId: session.id,
          metadata: {
            stripeEventId: event.id,
            stripeAmountTotalCents: session.amount_total ?? null,
            parentSurchargeAmountCents: Number(session.metadata?.parentSurchargeAmountCents || 0) || 0,
            parentProcessingRecoveryAmountCents: Number(session.metadata?.parentProcessingRecoveryAmountCents || session.metadata?.parentSurchargeAmountCents || 0) || 0,
            schoolProcessingFeeAmountCents: Number(session.metadata?.schoolProcessingFeeAmountCents || 0) || 0,
            beeSuitePaymentOperationsFeeAmountCents: Number(session.metadata?.beeSuitePaymentOperationsFeeAmountCents || 0) || 0,
            applicationFeeAmountCents: Number(session.metadata?.applicationFeeAmountCents || 0) || 0,
            ...productPaymentMetadata(session.metadata ?? {}),
          },
        },
      });
      await applyRegistrationPaymentCompletion(tx, {
        invoiceId,
        paymentId: payment.id,
        paidAt,
        invoiceCustomFields: invoice.customFields,
      });
      applied = true;
    });
  } catch (error) {
    if (isDuplicateWebhookEvent(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  if (!applied) {
    if (ignoredReason !== "invoice_not_found" && ignoredReason !== "payment_not_found") {
      await writeSystemAudit(invoiceId, event.id, session.id, "billing.checkout.ignored");
    }
    return NextResponse.json({ ok: true, ignored: true, reason: ignoredReason || "not_applied" });
  }

  await writeSystemAudit(invoiceId, event.id, session.id, event.type === "checkout.session.async_payment_succeeded" ? "billing.checkout.async_succeeded" : "billing.checkout.completed");

  return NextResponse.json({ ok: true });
}

async function POSTHandler(request: NextRequest) {
  // Stripe signs the exact request bytes. This must remain the first and only
  // request-body consumption before signature verification and JSON parsing.
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const signatureMatch = await matchStripeWebhookSecret(payload, signature);
  if (!signatureMatch.configured) {
    return NextResponse.json({ ok: false, error: "Payment processor webhook secret is not configured." }, { status: 503 });
  }
  if (!signatureMatch.matched) {
    return NextResponse.json({ ok: false, error: "Invalid payment processor signature." }, { status: 400 });
  }

  let event: StripeWebhookEvent;
  try {
    const parsed = jsonObject(JSON.parse(payload));
    event = {
      ...parsed,
      data: {
        ...jsonObject(parsed.data),
        object: stripeWebhookObjectForRouting(parsed),
      },
    } as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed authenticated webhook payload." }, { status: 400 });
  }
  if (!event || typeof event.id !== "string" || !event.id.startsWith("evt_") || typeof event.type !== "string") {
    return NextResponse.json({ ok: false, error: "Malformed authenticated webhook event." }, { status: 400 });
  }

  let reservation: "received" | "duplicate";
  try {
    reservation = await reserveStripeWebhookEvent(event);
  } catch (error) {
    logOperationalError("stripe_webhook.receipt_failed", error, { eventId: event.id, eventType: event.type });
    return NextResponse.json({ ok: false, error: "Webhook receipt could not be stored." }, { status: 503 });
  }
  if (reservation === "duplicate") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const response = await dispatchAuthenticatedEvent(event, signatureMatch.tenantId, twilioStatusCallbackUrl(request));
    const result = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
    if (response.status < 200 || response.status >= 300) {
      const reason = safeReceiptReason(result.error || result.reason, `authenticated_handler_http_${response.status}`);
      await finalizeStripeWebhookReceipt(event, "manual_review", reason);
      return NextResponse.json({ ok: true, received: true, manualReview: true, reason }, { status: 202 });
    }

    const status = result.ignored === true ? "ignored" : result.pending === true ? "pending" : "processed";
    const reason = result.ignored === true ? result.reason || "handler_ignored" : undefined;
    await finalizeUnfinishedStripeWebhookReceipt(event, status, reason);
    return response;
  } catch (error) {
    logOperationalError("stripe_webhook.processing_failed_after_receipt", error, { eventId: event.id, eventType: event.type });
    try {
      await finalizeStripeWebhookReceipt(event, "manual_review", "processing_failed_after_durable_receipt");
    } catch (receiptError) {
      logOperationalError("stripe_webhook.receipt_status_update_failed", receiptError, { eventId: event.id, eventType: event.type });
    }
    return NextResponse.json(
      { ok: true, received: true, manualReview: true, reason: "processing_failed_after_durable_receipt" },
      { status: 202 },
    );
  }
}

export const POST = withApiLogging("POST", POSTHandler, { omitRequestBody: true });
