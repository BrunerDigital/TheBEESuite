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

type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data: {
    object: StripeCheckoutSessionCompleted | { id?: string; object?: string };
  };
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = event.data.object as StripeCheckoutSessionCompleted;
  const invoiceId = session.metadata?.invoiceId;
  const paymentId = session.metadata?.paymentId;

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
