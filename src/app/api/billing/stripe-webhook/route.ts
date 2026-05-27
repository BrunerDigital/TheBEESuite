import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { readStripeConnectedAccountId, retrieveStripeConnectedAccount, verifyStripeSignature } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type StripeCheckoutSessionCompleted = {
  id: string;
  object: "checkout.session";
  payment_status?: string;
  amount_total?: number;
  payment_intent?: string | null;
  metadata?: {
    invoiceId?: string;
    paymentId?: string;
    familyId?: string;
    centerId?: string;
    stripeConnectedAccountId?: string;
    invoiceAmountCents?: string;
    parentSurchargeAmountCents?: string;
    checkoutTotalCents?: string;
    applicationFeeAmountCents?: string;
  };
};

type StripeMetadata = {
  invoiceId?: string;
  paymentId?: string;
  familyId?: string;
  centerId?: string;
  stripeConnectedAccountId?: string;
  invoiceAmountCents?: string;
  parentSurchargeAmountCents?: string;
  checkoutTotalCents?: string;
  applicationFeeAmountCents?: string;
};

type StripePaymentIntentObject = {
  id: string;
  object: "payment_intent";
  amount?: number;
  status?: string;
  last_payment_error?: { message?: string } | null;
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

type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data: {
    object: StripeCheckoutSessionCompleted | StripePaymentIntentObject | StripeChargeObject | StripeDisputeObject | { id?: string; object?: string };
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

function accountEventType(type: string) {
  return type === "account.updated" || type === "v2.core.account[requirements].updated";
}

function stripeObjectId(event: StripeWebhookEvent) {
  return event.data.object.id || null;
}

function stripeDedupeKey(event: StripeWebhookEvent) {
  const objectId = stripeObjectId(event);
  if (event.type.startsWith("checkout.session.") && objectId) {
    return `${event.type}:${objectId}`;
  }
  return event.id;
}

function compactEventPayload(event: StripeWebhookEvent): Prisma.InputJsonObject {
  const object = jsonObject(event.data.object);
  return {
    object: typeof object.object === "string" ? object.object : null,
    objectId: stripeObjectId(event),
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
  await tx.stripeWebhookEvent.create({
    data: {
      eventId: event.id,
      dedupeKey: stripeDedupeKey(event),
      type: event.type,
      objectId: stripeObjectId(event),
      livemode: event.livemode ?? null,
      status,
      payload: compactEventPayload(event),
      processedAt: new Date(),
    },
  });
}

function isDuplicateWebhookEvent(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
    return tx.payment.findFirst({
      where: {
        provider: "stripe",
        customFields: {
          path: ["stripePaymentIntentId"],
          equals: paymentIntentId,
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

async function handleConnectedAccountEvent(event: StripeWebhookEvent) {
  const accountId = event.data.object.id;
  if (!accountId || !accountId.startsWith("acct_")) {
    return NextResponse.json({ ok: true, ignored: true });
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

  const retrieved = await retrieveStripeConnectedAccount(accountId);
  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      for (const center of matchedCenters) {
        const existingFields = jsonObject(center.customFields);
        const nextFields = retrieved.ok && retrieved.account
          ? {
              ...existingFields,
              stripeConnectAccountId: accountId,
              stripeChargesEnabled: retrieved.account.chargesEnabled,
              stripePayoutsEnabled: retrieved.account.payoutsEnabled,
              stripeDetailsSubmitted: retrieved.account.detailsSubmitted,
              stripeMerchantCapabilityStatus: retrieved.account.merchantCapabilityStatus || null,
              stripeRecipientTransferStatus: retrieved.account.recipientTransferStatus || null,
              stripePayoutRequirementFields: retrieved.account.requirementFields,
              stripePayoutStatus: retrieved.account.payoutsEnabled && retrieved.account.chargesEnabled ? "ready" : "requirements_due",
              stripeConnectLastSyncedAt: new Date().toISOString(),
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

async function handleCheckoutExpired(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted) {
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
  }
  return NextResponse.json({ ok: true });
}

async function handlePaymentIntentFailed(event: StripeWebhookEvent, paymentIntent: StripePaymentIntentObject) {
  const metadata = metadataOf(paymentIntent);
  if (!metadata.paymentId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Missing payment metadata." });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const currentPayment = await tx.payment.findUnique({ where: { id: metadata.paymentId }, select: { customFields: true } });
      await tx.payment.update({
        where: { id: metadata.paymentId },
        data: {
          status: PaymentStatus.FAILED,
          customFields: {
            ...jsonObject(currentPayment?.customFields),
            stripePaymentIntentId: paymentIntent.id,
            stripeEventId: event.id,
            stripePaymentIntentStatus: paymentIntent.status || null,
            stripeFailureMessage: paymentIntent.last_payment_error?.message || null,
            status: "payment_intent_failed",
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
    await writeSystemAudit(metadata.invoiceId, event.id, paymentIntent.id, "billing.payment_intent.failed");
  }
  return NextResponse.json({ ok: true });
}

async function handleChargeRefunded(event: StripeWebhookEvent, charge: StripeChargeObject) {
  const metadata = metadataOf(charge);

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const payment = await findPaymentForStripeObject(tx, charge);
      if (!payment) return;

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
            description: charge.refunded ? "Stripe payment refunded" : "Stripe payment partially refunded",
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
  }
  return NextResponse.json({ ok: true });
}

async function handleDisputeCreated(event: StripeWebhookEvent, dispute: StripeDisputeObject) {
  const metadata = metadataOf(dispute);

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const payment = await findPaymentForStripeObject(tx, dispute);
      if (!payment) return;
      const currentFields = jsonObject(payment.customFields);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          customFields: {
            ...currentFields,
            stripeDisputeId: dispute.id,
            stripeDisputeAmountCents: numeric(dispute.amount),
            stripeDisputeReason: dispute.reason || null,
            stripeDisputeStatus: dispute.status || null,
            stripeDisputeChargeId: clean(dispute.charge) || null,
            stripePaymentIntentId: clean(dispute.payment_intent) || currentFields.stripePaymentIntentId || null,
            stripeEventId: event.id,
            status: "disputed",
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
    await writeSystemAudit(metadata.invoiceId, event.id, dispute.id, "billing.dispute.created");
  }
  return NextResponse.json({ ok: true });
}

async function writeSystemAudit(invoiceId: string, stripeEventId: string, sessionId: string, action = "billing.checkout.completed") {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      billingAccount: {
        include: {
          family: {
            include: {
              children: {
                select: {
                  classroom: {
                    select: {
                      center: {
                        select: {
                          id: true,
                          organization: {
                            select: {
                              tenantId: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  const center = invoice?.billingAccount.family.children[0]?.classroom?.center;
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
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Stripe webhook secret is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature({ payload, signature, secret })) {
    return NextResponse.json({ ok: false, error: "Invalid Stripe signature." }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeWebhookEvent;

  if (accountEventType(event.type)) {
    return handleConnectedAccountEvent(event);
  }

  if (![
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "payment_intent.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
  ].includes(event.type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (event.type === "payment_intent.payment_failed") {
    return handlePaymentIntentFailed(event, event.data.object as StripePaymentIntentObject);
  }

  if (event.type === "charge.refunded") {
    return handleChargeRefunded(event, event.data.object as StripeChargeObject);
  }

  if (event.type === "charge.dispute.created") {
    return handleDisputeCreated(event, event.data.object as StripeDisputeObject);
  }

  const session = event.data.object as StripeCheckoutSessionCompleted;
  const invoiceId = session.metadata?.invoiceId;
  const paymentId = session.metadata?.paymentId;

  if (event.type === "checkout.session.expired") {
    return handleCheckoutExpired(event, session);
  }

  if (!invoiceId || !paymentId) {
    return NextResponse.json({ ok: false, error: "Missing invoice/payment metadata." }, { status: 400 });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event);
        const currentPayment = await tx.payment.findUnique({ where: { id: paymentId }, select: { customFields: true } });
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            externalIdPlaceholder: session.id,
            customFields: {
              ...jsonObject(currentPayment?.customFields),
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              status: "checkout_failed",
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

  if (event.type === "checkout.session.completed" && session.payment_status && session.payment_status !== "paid") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event, "pending");
        const currentPayment = await tx.payment.findUnique({ where: { id: paymentId }, select: { customFields: true } });
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.DRAFT,
            externalIdPlaceholder: session.id,
            customFields: {
              ...jsonObject(currentPayment?.customFields),
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
              stripeEventId: event.id,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              status: "checkout_pending",
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

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const currentPayment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { customFields: true },
      });
      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
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
            checkoutTotalCents: Number(session.metadata?.checkoutTotalCents || session.amount_total || 0) || null,
            applicationFeeAmountCents: Number(session.metadata?.applicationFeeAmountCents || 0) || 0,
            status: "paid",
          },
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: PaymentStatus.PAID },
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
          description: "Stripe parent payment",
          amountCents: -payment.amountCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "stripe",
          externalId: session.id,
          metadata: {
            stripeEventId: event.id,
            stripeAmountTotalCents: session.amount_total ?? null,
            parentSurchargeAmountCents: Number(session.metadata?.parentSurchargeAmountCents || 0) || 0,
            applicationFeeAmountCents: Number(session.metadata?.applicationFeeAmountCents || 0) || 0,
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

  await writeSystemAudit(invoiceId, event.id, session.id, event.type === "checkout.session.async_payment_succeeded" ? "billing.checkout.async_succeeded" : "billing.checkout.completed");

  return NextResponse.json({ ok: true });
}
