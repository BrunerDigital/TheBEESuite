import { createHash } from "node:crypto";
import { PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  expireStripeCheckoutSession,
  readStripeConnectedAccountId,
  retrieveStripeCheckoutSession,
} from "../src/lib/integrations";

const prisma = new PrismaClient();
const CENTER_NAME = "Kid City USA - Holly Hill";
const FAMILY_NAME = "Atanga Household";
const EXPECTED_BALANCE_CENTS = 8_860;
const TARGET_PAYMENT_ID = "cmtgnop9z000rky04ti1o6c4u";
const APPLY_FLAG = "--apply-reviewed-atanga-checkout-repair";
const FINGERPRINT_PREFIX = "--reviewed-fingerprint=";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadState(client: PrismaClient | Prisma.TransactionClient = prisma) {
  const center = await client.center.findFirst({
    where: { name: CENTER_NAME },
    select: {
      id: true,
      name: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center) throw new Error("The exact Holly Hill center was not found.");
  const family = await client.family.findFirst({
    where: {
      name: FAMILY_NAME,
      centerId: center.id,
    },
    select: {
      id: true,
      name: true,
      centerId: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          payments: {
            where: { id: TARGET_PAYMENT_ID, provider: "stripe" },
            orderBy: { id: "asc" },
            select: {
              id: true,
              amountCents: true,
              status: true,
              provider: true,
              externalIdPlaceholder: true,
              customFields: true,
              paidAt: true,
              _count: { select: { ledgerEntries: true } },
            },
          },
        },
      },
    },
  });
  if (!family?.billingAccount) {
    throw new Error("The exact Holly Hill Atanga billing account was not found.");
  }

  const snapshot = {
    familyId: family.id,
    centerId: center.id,
    billingAccountId: family.billingAccount.id,
    balanceCents: family.billingAccount.balanceCents,
    targetPayments: family.billingAccount.payments.map((payment) => {
      const fields = object(payment.customFields);
      return {
        id: payment.id,
        amountCents: payment.amountCents,
        status: payment.status,
        provider: payment.provider,
        placeholder: payment.externalIdPlaceholder,
        checkoutStatus: fields.status ?? null,
        paymentScope: fields.paymentScope ?? null,
        stripeCheckoutSessionId: fields.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: fields.stripePaymentIntentId ?? null,
        paidAt: payment.paidAt?.toISOString() ?? null,
        ledgerEntryCount: payment._count.ledgerEntries,
      };
    }),
  };
  const targetPayment = family.billingAccount.payments.length === 1
    ? family.billingAccount.payments[0]
    : null;
  const activeDraft = targetPayment?.status === PaymentStatus.DRAFT ? targetPayment : null;
  const activeFields = object(targetPayment?.customFields);
  const sessionId = text(activeFields.stripeCheckoutSessionId);
  const connectedAccountId = text(activeFields.stripeConnectedAccountId)
    || readStripeConnectedAccountId(center.customFields);
  const provider = sessionId
    ? await retrieveStripeCheckoutSession({
        sessionId,
        connectedAccountId,
        tenantId: center.organization.tenantId,
      })
    : null;
  const providerSnapshot = provider?.session ? {
    ok: provider.ok,
    id: provider.session.id,
    status: provider.session.status,
    paymentStatus: provider.session.paymentStatus,
    paymentIntentId: provider.session.paymentIntentId,
    paymentIntentStatus: provider.session.paymentIntentStatus,
    amountTotalCents: provider.session.amountTotalCents,
    createdAt: provider.session.createdAt,
    expiresAt: provider.session.expiresAt,
    hasRecoverableUrl: Boolean(provider.session.url),
  } : provider ? { ok: provider.ok, error: provider.error ?? null } : null;
  return {
    center,
    family,
    targetPayment,
    activeDraft,
    connectedAccountId,
    snapshot,
    providerSnapshot,
    fingerprint: fingerprint({ snapshot, providerSnapshot }),
  };
}

async function main() {
  const before = await loadState();
  const apply = process.argv.includes(APPLY_FLAG);
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry_run",
    school: CENTER_NAME,
    family: FAMILY_NAME,
    snapshot: before.snapshot,
    provider: before.providerSnapshot,
    fingerprint: before.fingerprint,
  }, null, 2));
  if (!apply) return;

  const reviewedFingerprint = process.argv
    .find((argument) => argument.startsWith(FINGERPRINT_PREFIX))
    ?.slice(FINGERPRINT_PREFIX.length);
  if (!reviewedFingerprint || !/^[a-f0-9]{64}$/.test(reviewedFingerprint)) {
    throw new Error(`Apply requires ${FINGERPRINT_PREFIX}<64-character dry-run fingerprint>.`);
  }
  if (before.fingerprint !== reviewedFingerprint) {
    throw new Error("The Atanga billing state changed since the reviewed dry run; do not apply.");
  }
  if (before.family.billingAccount?.balanceCents !== EXPECTED_BALANCE_CENTS) {
    throw new Error(`Expected the reviewed $${(EXPECTED_BALANCE_CENTS / 100).toFixed(2)} balance.`);
  }
  const currentFields = object(before.targetPayment?.customFields);
  if (
    before.targetPayment?.status === PaymentStatus.VOID
    && currentFields.status === "checkout_expired"
    && before.providerSnapshot?.status === "expired"
    && before.providerSnapshot.paymentStatus === "unpaid"
  ) {
    console.log(JSON.stringify({ ok: true, alreadyReconciled: true, charged: false, ledgerChanged: false }, null, 2));
    return;
  }
  if (!before.activeDraft || before.family.billingAccount.payments.length !== 1) {
    throw new Error("Expected exactly one active Stripe checkout draft.");
  }
  const target = before.activeDraft;
  if (target.paidAt || target._count.ledgerEntries !== 0) {
    throw new Error("The checkout draft has payment or ledger history and cannot be retired by this repair.");
  }
  const targetFields = object(target.customFields);
  const targetSessionId = text(targetFields.stripeCheckoutSessionId);
  const provider = before.providerSnapshot;
  if (
    target.amountCents !== EXPECTED_BALANCE_CENTS
    || targetFields.paymentScope !== "family_balance"
    || targetFields.status !== "checkout_created"
    || !targetSessionId
    || provider?.ok !== true
    || provider.id !== targetSessionId
    || provider.status !== "open"
    || provider.paymentStatus !== "unpaid"
    || provider.paymentIntentStatus !== "requires_payment_method"
    || provider.amountTotalCents !== EXPECTED_BALANCE_CENTS
  ) {
    throw new Error("The checkout no longer matches the reviewed open, unpaid, retryable Stripe state.");
  }

  const expired = await expireStripeCheckoutSession({
    sessionId: targetSessionId,
    connectedAccountId: before.connectedAccountId,
    tenantId: before.center.organization.tenantId,
  });
  if (!expired.ok || expired.session?.status !== "expired" || expired.session.paymentStatus === "paid") {
    throw new Error(expired.error || "Stripe did not confirm that the exact unpaid checkout was expired.");
  }

  const repairedAt = new Date().toISOString();
  const reconciliation = await prisma.$transaction(async (tx) => {
    const lockedTarget = await tx.payment.findUnique({
      where: { id: target.id },
      select: {
        id: true,
        billingAccountId: true,
        amountCents: true,
        status: true,
        provider: true,
        externalIdPlaceholder: true,
        customFields: true,
        paidAt: true,
        _count: { select: { ledgerEntries: true } },
      },
    });
    if (!lockedTarget) throw new Error("The exact checkout draft no longer exists.");
    const fields = object(lockedTarget.customFields);
    if (lockedTarget.status === PaymentStatus.VOID && fields.status === "checkout_expired") {
      return "webhook_reconciled" as const;
    }
    if (
      lockedTarget.billingAccountId !== before.family.billingAccount!.id
      || lockedTarget.amountCents !== EXPECTED_BALANCE_CENTS
      || lockedTarget.status !== PaymentStatus.DRAFT
      || lockedTarget.provider !== "stripe"
      || lockedTarget.externalIdPlaceholder !== targetSessionId
      || lockedTarget.paidAt
      || lockedTarget._count.ledgerEntries !== 0
    ) {
      throw new Error("The exact checkout draft changed before local reconciliation.");
    }
    const updated = await tx.payment.updateMany({
      where: {
        id: lockedTarget.id,
        billingAccountId: before.family.billingAccount!.id,
        provider: "stripe",
        status: PaymentStatus.DRAFT,
        externalIdPlaceholder: targetSessionId,
        paidAt: null,
      },
      data: {
        status: PaymentStatus.VOID,
        externalIdPlaceholder: targetSessionId,
        customFields: {
          ...fields,
          status: "checkout_expired",
          stripeCheckoutSessionStatus: "expired",
          stripePaymentStatus: "unpaid",
          staleDraftClearedAt: repairedAt,
          staleDraftClearReason: "stale_open_requires_payment_method",
        } as Prisma.InputJsonObject,
      },
    });
    if (updated.count !== 1) {
      const raced = await tx.payment.findUnique({ where: { id: lockedTarget.id }, select: { status: true, customFields: true } });
      if (raced?.status === PaymentStatus.VOID && object(raced.customFields).status === "checkout_expired") {
        return "webhook_reconciled" as const;
      }
      throw new Error("The exact checkout draft was not updated.");
    }
    await tx.auditLog.create({
      data: {
        tenantId: before.center.organization.tenantId,
        centerId: before.center.id,
        action: "billing.family_payment.stale_checkout_expired",
        resource: "Payment",
        resourceId: lockedTarget.id,
        metadata: {
          billingAccountId: before.family.billingAccount!.id,
          familyId: before.family.id,
          amountCents: lockedTarget.amountCents,
          charged: false,
          ledgerChanged: false,
          stripeSessionId: targetSessionId,
          stripeSessionExpired: true,
          reason: "stale_open_requires_payment_method",
          reviewedFingerprint,
        },
      },
    });
    return "script_reconciled" as const;
  });

  const after = await loadState();
  console.log(JSON.stringify({
    ok: true,
    balanceCents: after.snapshot.balanceCents,
    targetPayments: after.snapshot.targetPayments,
    provider: after.providerSnapshot,
    reconciliation,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
