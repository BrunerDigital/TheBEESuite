import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { issueFamilyRefund } from "@/lib/family-refunds";
import { retrieveStripeCheckoutSession } from "@/lib/integrations";
import { invoiceLedgerBalanceCents } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const PERIOD = "2026-W33";
const RECOVERY_FINGERPRINT = "88b30b0be5cea0cd908a62cdd8f7d1784f1bca309133f3955bf4e67b4b89efad";
const CREATED_FROM = new Date("2026-08-07T16:15:00.000Z");
const CREATED_TO = new Date("2026-08-07T16:16:30.000Z");
const APPLY = "--apply";
const CONFIRM = "--confirm-centennial-w33-rollback";
const FINGERPRINT_ARG = "--confirm-fingerprint=";
const YOUNG_PENDING_PAYMENT_ID = "cmshxhlt60034la04el6xcpni";
const YOUNG_PENDING_SESSION_ID = "cs_live_a1ES0UKpSRibQUAxtYAnNHjHohlpBoCwQe2Fx8QhXpglgbr7b2qNId0P4d";
const REASON = "Centennial W33 recovery rollback: school had already reflected the coming-week tuition in family balances before the duplicate recovery invoices were created.";

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function arg(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function loadState() {
  const center = await prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true } });
  invariant(center?.name === CENTER_NAME && center.status !== "closed", "Centennial center identity or status changed.");

  const invoices = await prisma.invoice.findMany({
    where: {
      createdAt: { gte: CREATED_FROM, lt: CREATED_TO },
      sourceSystem: "bee_suite",
      billingAccount: { family: { centerId: CENTER_ID } },
      customFields: { path: ["recoveryManifestFingerprint"], equals: RECOVERY_FINGERPRINT },
    },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      createdAt: true,
      ledgerEntries: { select: { id: true, amountCents: true, paymentId: true, type: true, externalId: true } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: { select: { id: true, name: true, centerId: true } },
          payments: { where: { status: PaymentStatus.DRAFT }, select: { id: true, status: true, amountCents: true, provider: true, customFields: true } },
        },
      },
    },
    orderBy: { number: "asc" },
  });
  invariant(invoices.length === 29, `Expected 29 Centennial recovery invoices; found ${invoices.length}.`);

  const linkedPaymentIds = [...new Set(invoices.flatMap((invoice) => invoice.ledgerEntries.map((entry) => entry.paymentId).filter((id): id is string => Boolean(id))))];
  const linkedPayments = await prisma.payment.findMany({
    where: { id: { in: linkedPaymentIds } },
    select: { id: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, customFields: true },
  });
  const paymentById = new Map(linkedPayments.map((payment) => [payment.id, payment]));

  const targets = invoices.map((invoice) => {
    const fields = object(invoice.customFields);
    invariant(fields.billingPeriod === PERIOD && fields.coverageStartsPeriod === PERIOD, `${invoice.number} is not the W33 recovery invoice.`);
    invariant(fields.chargeSource === "tuitionPlan" && fields.mode === "recurring", `${invoice.number} is not a recurring tuition invoice.`);
    invariant(fields.noPaymentSubmitted === true, `${invoice.number} does not carry the no-payment safeguard.`);
    invariant(invoice.billingAccount.family.centerId === CENTER_ID, `${invoice.number} is outside Centennial.`);
    const ledgerNetCents = invoiceLedgerBalanceCents(invoice.ledgerEntries);
    const paymentIds = [...new Set(invoice.ledgerEntries.map((entry) => entry.paymentId).filter((id): id is string => Boolean(id)))];
    const payments = paymentIds.map((id) => paymentById.get(id)).filter((payment): payment is NonNullable<typeof payment> => Boolean(payment));
    invariant(payments.length === paymentIds.length, `${invoice.number} has an unresolved linked payment.`);

    let disposition: "void" | "refund_then_void" | "already_rolled_back";
    let refundPaymentId: string | null = null;
    if (invoice.status === PaymentStatus.VOID && fields.recoveryRollbackFingerprint) {
      disposition = "already_rolled_back";
    } else if (invoice.status === PaymentStatus.OPEN) {
      invariant(ledgerNetCents === invoice.totalCents && paymentIds.length === 0, `${invoice.number} open-invoice ledger is not safely reversible.`);
      disposition = "void";
    } else if (invoice.status === PaymentStatus.PAID) {
      invariant(ledgerNetCents === 0 && payments.length === 1, `${invoice.number} paid-invoice ledger is not an exact single payment.`);
      const payment = payments[0];
      const paymentFields = object(payment.customFields);
      invariant(payment.status === PaymentStatus.PAID && payment.provider === "stripe" && payment.amountCents === invoice.totalCents, `${invoice.number} payment is not an exact refundable Stripe payment.`);
      invariant(clean(paymentFields.invoiceId) === invoice.id && clean(paymentFields.invoiceNumber) === invoice.number, `${invoice.number} payment is not scoped to this invoice.`);
      invariant(clean(paymentFields.stripePaymentIntentId).startsWith("pi_") && numeric(paymentFields.stripeAmountRefundedCents) === 0, `${invoice.number} payment is not fully available for refund.`);
      disposition = "refund_then_void";
      refundPaymentId = payment.id;
    } else {
      throw new Error(`${invoice.number} has unsupported status ${invoice.status}.`);
    }

    const drafts = invoice.billingAccount.payments;
    if (drafts.length) {
      invariant(
        invoice.number === "INV-20260807-36BAD250"
          && drafts.length === 1
          && drafts[0].id === YOUNG_PENDING_PAYMENT_ID
          && clean(object(drafts[0].customFields).stripeCheckoutSessionId) === YOUNG_PENDING_SESSION_ID,
        `${invoice.number} has an unexpected pending payment or checkout.`,
      );
    }

    return {
      id: invoice.id,
      number: invoice.number,
      familyId: invoice.billingAccount.family.id,
      familyName: invoice.billingAccount.family.name,
      billingAccountId: invoice.billingAccount.id,
      accountBalanceCents: invoice.billingAccount.balanceCents,
      status: invoice.status,
      totalCents: invoice.totalCents,
      ledgerNetCents,
      disposition,
      refundPaymentId,
      paymentIds,
      draftPaymentIds: drafts.map((draft) => draft.id),
      customFields: invoice.customFields,
      createdAt: invoice.createdAt,
    };
  });

  const youngTarget = targets.find((target) => target.number === "INV-20260807-36BAD250");
  invariant(youngTarget?.draftPaymentIds.includes(YOUNG_PENDING_PAYMENT_ID), "The known Young Household checkout was not found.");
  const youngSession = await retrieveStripeCheckoutSession({
    sessionId: YOUNG_PENDING_SESSION_ID,
    connectedAccountId: "acct_1TyvotKIhC18XU5U",
    tenantId: "cms3g2rje00006a7wfmqdl6um",
  });
  invariant(youngSession.ok && youngSession.session, `Could not verify the Young Household checkout: ${youngSession.error ?? "unknown error"}`);
  invariant(
    youngSession.session.status === "open"
      && youngSession.session.paymentStatus === "unpaid"
      && youngSession.session.amountTotalCents === 39_200
      && Boolean(youngSession.session.createdAt)
      && new Date(youngSession.session.createdAt as string) < CREATED_FROM,
    "The Young Household checkout is no longer the pre-recovery unpaid checkout.",
  );

  const accountBalances = [...new Map(targets.map((target) => [target.billingAccountId, {
    billingAccountId: target.billingAccountId,
    familyId: target.familyId,
    familyName: target.familyName,
    balanceCents: target.accountBalanceCents,
  }])).values()];
  const state = { center, period: PERIOD, recoveryFingerprint: RECOVERY_FINGERPRINT, targets, accountBalances, youngSession: youngSession.session };
  return { state, fingerprint: fingerprint(state), targets, accountBalances };
}

async function main() {
  const before = await loadState();
  const pending = before.targets.filter((target) => target.disposition !== "already_rolled_back");
  const refunds = pending.filter((target) => target.disposition === "refund_then_void");
  const summary = {
    mode: process.argv.includes(APPLY) ? "apply" : "dry-run",
    fingerprint: before.fingerprint,
    invoicesFound: before.targets.length,
    invoicesToVoid: pending.length,
    familiesToRestore: new Set(pending.map((target) => target.familyId)).size,
    duplicateInvoiceCents: pending.reduce((sum, target) => sum + target.totalCents, 0),
    refundsToIssue: refunds.length,
    refundCents: refunds.reduce((sum, target) => sum + target.totalCents, 0),
    paymentsPreserved: before.targets.flatMap((target) => target.paymentIds).length,
    preRecoveryCheckoutPreserved: YOUNG_PENDING_PAYMENT_ID,
    targetInvoices: pending.map((target) => ({ number: target.number, familyName: target.familyName, totalCents: target.totalCents, status: target.status, disposition: target.disposition, refundPaymentId: target.refundPaymentId })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!process.argv.includes(APPLY)) return;

  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(arg(FINGERPRINT_ARG) === before.fingerprint, "Centennial recovery state changed; rerun the dry run.");
  const dbUser = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true, email: true, name: true, role: true, organizationId: true } });
  invariant(dbUser, "Brenden audit user was not found.");
  const actor = {
    ...dbUser,
    mustResetPassword: false,
    centerIds: [CENTER_ID],
    primaryCenterId: CENTER_ID,
    assignedClassroomId: null,
    deviceSessionId: null,
    accessScope: "center",
    accessGrantCount: 1,
    profilePhotoUrl: null,
    branding: {},
  } as CurrentUser;

  for (const target of refunds) {
    invariant(target.refundPaymentId, `${target.number} refund payment is missing.`);
    const refunded = await issueFamilyRefund(actor, {
      familyId: target.familyId,
      amountCents: target.totalCents,
      reason: REASON,
      preferredPaymentIds: [target.refundPaymentId],
      operationId: `centennial-w33-recovery-rollback:${target.id}`,
      tenantId: dbUser.tenantId,
    });
    invariant(refunded.ok, `${target.number} refund failed: ${refunded.ok ? "unknown" : refunded.error}`);
    invariant(
      refunded.totalCents === target.totalCents
        && refunded.allocations.length === 1
        && refunded.allocations[0].paymentId === target.refundPaymentId,
      `${target.number} refund allocation did not match the duplicate payment.`,
    );
  }

  const voidedAt = new Date();
  for (const target of pending) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findUniqueOrThrow({
        where: { id: target.id },
        include: {
          ledgerEntries: { select: { amountCents: true, paymentId: true } },
          billingAccount: { select: { id: true, family: { select: { id: true, centerId: true } } } },
        },
      });
      invariant(current.billingAccount.family.centerId === CENTER_ID && current.billingAccount.family.id === target.familyId, `${target.number} family or center scope changed.`);
      invariant(object(current.customFields).recoveryManifestFingerprint === RECOVERY_FINGERPRINT, `${target.number} recovery evidence changed.`);
      invariant(current.status === PaymentStatus.OPEN, `${target.number} is not open after refund preparation.`);
      const reversalCents = invoiceLedgerBalanceCents(current.ledgerEntries);
      invariant(reversalCents === current.totalCents, `${target.number} ledger does not net to its duplicate invoice amount.`);
      const currentPaymentIds = [...new Set(current.ledgerEntries.map((entry) => entry.paymentId).filter((id): id is string => Boolean(id)))];
      if (currentPaymentIds.length) {
        const payments = await tx.payment.findMany({ where: { id: { in: currentPaymentIds } }, select: { status: true, amountCents: true, customFields: true } });
        invariant(payments.length === currentPaymentIds.length && payments.every((payment) => payment.status === PaymentStatus.REFUNDED && numeric(object(payment.customFields).stripeAmountRefundedCents) >= payment.amountCents), `${target.number} has a linked payment that is not fully refunded.`);
      }

      const updated = await tx.invoice.updateMany({
        where: { id: current.id, status: PaymentStatus.OPEN },
        data: {
          status: PaymentStatus.VOID,
          customFields: {
            ...object(current.customFields),
            voidedAt: voidedAt.toISOString(),
            voidedByUserId: dbUser.id,
            voidedByEmail: dbUser.email,
            voidReason: REASON,
            recoveryRollbackFingerprint: before.fingerprint,
          } as Prisma.InputJsonObject,
        },
      });
      invariant(updated.count === 1, `${target.number} changed before rollback.`);
      const account = await tx.billingAccount.update({
        where: { id: current.billingAccount.id },
        data: { balanceCents: { decrement: reversalCents } },
        select: { balanceCents: true },
      });
      const ledger = await tx.ledgerEntry.create({
        data: {
          billingAccountId: current.billingAccount.id,
          invoiceId: current.id,
          type: "invoice_void",
          description: `Voided ${current.number}: ${REASON}`,
          amountCents: -reversalCents,
          balanceAfterCents: account.balanceCents,
          sourceSystem: "bee_suite_manual",
          externalId: `invoice-void:${current.id}`,
          metadata: {
            voidedBy: dbUser.email,
            reason: REASON,
            previousStatus: PaymentStatus.OPEN,
            updatedStatus: PaymentStatus.VOID,
            recoveryManifestFingerprint: RECOVERY_FINGERPRINT,
            recoveryRollbackFingerprint: before.fingerprint,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: dbUser.tenantId,
          centerId: CENTER_ID,
          userId: dbUser.id,
          action: "billing.invoice.voided_recovery_rollback",
          resource: "Invoice",
          resourceId: current.id,
          metadata: {
            familyId: target.familyId,
            invoiceNumber: current.number,
            amountCents: reversalCents,
            reason: REASON,
            ledgerEntryId: ledger.id,
            recoveryManifestFingerprint: RECOVERY_FINGERPRINT,
            recoveryRollbackFingerprint: before.fingerprint,
            refundedPaymentId: target.refundPaymentId,
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }

  const [afterInvoices, afterAccounts, refundedPayments] = await Promise.all([
    prisma.invoice.findMany({ where: { id: { in: before.targets.map((target) => target.id) } }, select: { id: true, status: true, ledgerEntries: { select: { amountCents: true } } } }),
    prisma.billingAccount.findMany({ where: { id: { in: before.accountBalances.map((account) => account.billingAccountId) } }, select: { id: true, balanceCents: true } }),
    prisma.payment.findMany({ where: { id: { in: refunds.map((target) => target.refundPaymentId).filter((id): id is string => Boolean(id)) } }, select: { id: true, status: true, amountCents: true, customFields: true } }),
  ]);
  invariant(afterInvoices.length === before.targets.length && afterInvoices.every((invoice) => invoice.status === PaymentStatus.VOID), "Not every recovery invoice is void after rollback.");
  invariant(refundedPayments.length === refunds.length && refundedPayments.every((payment) => payment.status === PaymentStatus.REFUNDED && numeric(object(payment.customFields).stripeAmountRefundedCents) >= payment.amountCents), "Not every duplicate Stripe payment is fully refunded.");
  for (const account of before.accountBalances) {
    const openDuplicateCents = before.targets
      .filter((target) => target.billingAccountId === account.billingAccountId && target.disposition === "void")
      .reduce((sum, target) => sum + target.ledgerNetCents, 0);
    invariant(afterAccounts.find((item) => item.id === account.billingAccountId)?.balanceCents === account.balanceCents - openDuplicateCents, `${account.familyName} balance did not return to its pre-recovery value.`);
  }
  console.log(JSON.stringify({
    ok: true,
    invoicesVoided: pending.length,
    familiesRestored: new Set(pending.map((target) => target.familyId)).size,
    duplicateInvoiceCentsRemoved: summary.duplicateInvoiceCents,
    stripeRefundsIssued: refunds.length,
    stripeRefundCents: summary.refundCents,
    preRecoveryCheckoutPreserved: YOUNG_PENDING_PAYMENT_ID,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
