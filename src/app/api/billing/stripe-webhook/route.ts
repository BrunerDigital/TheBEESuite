import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { checkoutApplicationGuard } from "@/lib/billing-guardrails";
import {
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  retrieveStripeSetupIntent,
  verifyStripeSignature,
} from "@/lib/integrations";
import { getTenantIntegrationCredentialEntries } from "@/lib/integration-credentials";
import { prisma } from "@/lib/prisma";
import { markRegistrationPaymentChecklistPaid } from "@/lib/registration-packet";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";

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
    setupFlow?: string;
    tenantId?: string;
    billingAccountId?: string;
    invoiceId?: string;
    paymentId?: string;
    familyId?: string;
    centerId?: string;
    stripeConnectedAccountId?: string;
    invoiceAmountCents?: string;
    parentSurchargeAmountCents?: string;
    parentProcessingRecoveryAmountCents?: string;
    beeSuitePaymentOperationsFeeAmountCents?: string;
    checkoutTotalCents?: string;
    applicationFeeAmountCents?: string;
  };
};

type StripeMetadata = {
  tenantId?: string;
  invoiceId?: string;
  paymentId?: string;
  familyId?: string;
  centerId?: string;
  stripeConnectedAccountId?: string;
  invoiceAmountCents?: string;
  parentSurchargeAmountCents?: string;
  parentProcessingRecoveryAmountCents?: string;
  beeSuitePaymentOperationsFeeAmountCents?: string;
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
  created?: number;
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
  return type === "account.updated" || type === "v2.core.account.updated" || type === "v2.core.account[requirements].updated";
}

async function matchStripeWebhookSecret(payload: string, signature: string | null) {
  const secrets: Array<{ tenantId: string | null; secret: string }> = [];
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (platformSecret) secrets.push({ tenantId: null, secret: platformSecret });

  const tenantSecrets = await getTenantIntegrationCredentialEntries("stripe", "STRIPE_WEBHOOK_SECRET");
  for (const credential of tenantSecrets) {
    secrets.push({ tenantId: credential.tenantId, secret: credential.value });
  }

  for (const item of secrets) {
    if (verifyStripeSignature({ payload, signature, secret: item.secret })) {
      return { configured: true, matched: true, tenantId: item.tenantId };
    }
  }

  return { configured: secrets.length > 0, matched: false, tenantId: null };
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

function centsFromJson(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

async function handleCheckoutExpired(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted) {
  if (session.mode === "setup" || session.metadata?.setupFlow === "billing_account_payment_method") {
    try {
      await prisma.$transaction(async (tx) => {
        await recordStripeWebhookEvent(tx, event);
        if (!session.metadata?.billingAccountId) return;
        const account = await tx.billingAccount.findUnique({
          where: { id: session.metadata.billingAccountId },
          select: { customFields: true },
        });
        await tx.billingAccount.update({
          where: { id: session.metadata.billingAccountId },
          data: {
            customFields: {
              ...jsonObject(account?.customFields),
              stripeSetupCheckoutSessionId: session.id,
              stripeEventId: event.id,
              paymentMethodManagementStatus: "setup_session_expired",
              autopayStatus: "disabled",
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

async function handlePaymentMethodSetupCompleted(event: StripeWebhookEvent, session: StripeCheckoutSessionCompleted, matchedTenantId?: string | null) {
  const billingAccountId = session.metadata?.billingAccountId;
  if (!billingAccountId) {
    return NextResponse.json({ ok: false, error: "Missing billing account metadata." }, { status: 400 });
  }

  const setupIntentId = clean(session.setup_intent);
  const tenantId = matchedTenantId || session.metadata?.tenantId || null;
  const setupIntent = setupIntentId ? await retrieveStripeSetupIntent(setupIntentId, { tenantId }) : null;
  if (setupIntent && !setupIntent.ok) {
    return NextResponse.json(
      { ok: false, configured: setupIntent.configured, error: setupIntent.error || "Payment setup session could not be retrieved." },
      { status: setupIntent.configured ? 502 : 503 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await recordStripeWebhookEvent(tx, event);
      const billingAccount = await tx.billingAccount.findUnique({
        where: { id: billingAccountId },
        select: { customFields: true },
      });
      if (!billingAccount) return;

      const customerId = setupIntent?.setupIntent?.customerId || clean(session.customer) || clean(jsonObject(billingAccount.customFields).stripeCustomerId);
      const paymentMethodId = setupIntent?.setupIntent?.paymentMethodId || clean(jsonObject(billingAccount.customFields).stripeDefaultPaymentMethodId);
      await tx.billingAccount.update({
        where: { id: billingAccountId },
        data: {
          autopayPlaceholder: Boolean(paymentMethodId),
          customFields: {
            ...jsonObject(billingAccount.customFields),
            stripeCustomerId: customerId || null,
            stripeDefaultPaymentMethodId: paymentMethodId || null,
            stripeSetupIntentId: setupIntentId || null,
            stripeSetupIntentStatus: setupIntent?.setupIntent?.status || null,
            stripeSetupCheckoutSessionId: session.id,
            stripeEventId: event.id,
            stripePaymentMethodSavedAt: new Date().toISOString(),
            autopayEnabled: Boolean(paymentMethodId),
            autopayStatus: paymentMethodId ? "enabled" : "pending",
            paymentMethodManagementStatus: paymentMethodId ? "payment_method_saved" : "setup_completed_missing_payment_method",
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
            stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
            stripePaymentIntentStatus: paymentIntent.status || null,
            stripeFailureMessage: paymentIntent.last_payment_error?.message || null,
            failedAt: new Date().toISOString(),
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
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const signatureMatch = await matchStripeWebhookSecret(payload, signature);
  if (!signatureMatch.configured) {
    return NextResponse.json({ ok: false, error: "Payment processor webhook secret is not configured." }, { status: 503 });
  }

  if (!signatureMatch.matched) {
    return NextResponse.json({ ok: false, error: "Invalid payment processor signature." }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeWebhookEvent;

  if (accountEventType(event.type)) {
    return handleConnectedAccountEvent(event, signatureMatch.tenantId);
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
  if (event.type === "checkout.session.completed" && (session.mode === "setup" || session.metadata?.setupFlow === "billing_account_payment_method")) {
    return handlePaymentMethodSetupCompleted(event, session, signatureMatch.tenantId);
  }

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
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
              stripePaymentStatus: session.payment_status || null,
              stripeAmountTotalCents: session.amount_total ?? null,
              failedAt: new Date().toISOString(),
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

  if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
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
              stripeEventCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null,
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
        where: { id: invoiceId, status: { not: PaymentStatus.PAID } },
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
            beeSuitePaymentOperationsFeeAmountCents: Number(session.metadata?.beeSuitePaymentOperationsFeeAmountCents || 0) || 0,
            checkoutTotalCents: Number(session.metadata?.checkoutTotalCents || session.amount_total || 0) || null,
            applicationFeeAmountCents: Number(session.metadata?.applicationFeeAmountCents || 0) || 0,
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
          description: "Parent payment",
          amountCents: -payment.amountCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "stripe",
          externalId: session.id,
          metadata: {
            stripeEventId: event.id,
            stripeAmountTotalCents: session.amount_total ?? null,
            parentSurchargeAmountCents: Number(session.metadata?.parentSurchargeAmountCents || 0) || 0,
            parentProcessingRecoveryAmountCents: Number(session.metadata?.parentProcessingRecoveryAmountCents || session.metadata?.parentSurchargeAmountCents || 0) || 0,
            beeSuitePaymentOperationsFeeAmountCents: Number(session.metadata?.beeSuitePaymentOperationsFeeAmountCents || 0) || 0,
            applicationFeeAmountCents: Number(session.metadata?.applicationFeeAmountCents || 0) || 0,
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
