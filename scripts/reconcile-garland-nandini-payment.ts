import "./load-env";

import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import {
  getStripeSecretKey,
  retrieveStripeCheckoutSession,
  retrieveStripePaymentIntent,
} from "../src/lib/integrations";
import { prisma } from "../src/lib/prisma";
import { applySucceededStripeFamilyBalancePayment } from "../src/lib/stripe-payment-application";

const EXPECTED = {
  centerId: "cmp4ewh78004y6alwu6s3bsv4",
  centerName: "Kid City USA - Garland",
  familyId: "cms9fbxyq003r6asg3rdwmwgq",
  childId: "cms9fc3d8004d6asgiy5s0zee",
  childName: "Nandini Anand",
  billingAccountId: "cmsqggt16000rla04kma3pw7q",
  paymentId: "cmsxsvtts000kjr04huhu5szm",
  invoiceId: "cmsrjjqqw0060l204kn47ullc",
  amountCents: 27_000,
  invoiceAmountCents: 13_500,
  stripeCheckoutSessionId: "cs_live_a101Mj15XOjC7ThmM7S5SaRNKKFLmwaBWe9rUpq32SOtULGYlHEbzU6NSL",
  stripePaymentIntentId: "pi_3U5YxvGTSvJ4xnyr2Nx6K5U7",
} as const;

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-nandini-payment-reconciliation";

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function inspect() {
  const center = await prisma.center.findUniqueOrThrow({
    where: { id: EXPECTED.centerId },
    select: {
      id: true,
      name: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: EXPECTED.familyId },
    select: {
      id: true,
      centerId: true,
      children: { where: { id: EXPECTED.childId }, select: { id: true, fullName: true } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          ledgerEntries: {
            orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: { id: true, balanceAfterCents: true },
          },
        },
      },
    },
  });
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: EXPECTED.paymentId },
    select: {
      id: true,
      billingAccountId: true,
      amountCents: true,
      status: true,
      provider: true,
      paidAt: true,
      externalIdPlaceholder: true,
      customFields: true,
      ledgerEntries: {
        select: { id: true, externalId: true, amountCents: true, balanceAfterCents: true },
      },
    },
  });
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: EXPECTED.invoiceId },
    select: { id: true, billingAccountId: true, status: true, totalCents: true },
  });
  const candidateInvoices = await prisma.invoice.findMany({
    where: {
      billingAccountId: EXPECTED.billingAccountId,
      status: PaymentStatus.OPEN,
      totalCents: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, billingAccountId: true, status: true, totalCents: true },
  });
  const intentLedger = await prisma.ledgerEntry.findFirst({
    where: { sourceSystem: "stripe", externalId: EXPECTED.stripePaymentIntentId },
    select: { id: true, paymentId: true, amountCents: true, balanceAfterCents: true },
  });

  const centerFields = jsonRecord(center.customFields);
  const connectedAccountId = typeof centerFields.stripeConnectAccountId === "string"
    ? centerFields.stripeConnectAccountId
    : null;
  const session = await retrieveStripeCheckoutSession({
    sessionId: EXPECTED.stripeCheckoutSessionId,
    connectedAccountId,
    tenantId: center.organization.tenantId,
  });
  const intent = await retrieveStripePaymentIntent({
    paymentIntentId: EXPECTED.stripePaymentIntentId,
    connectedAccountId,
    tenantId: center.organization.tenantId,
  });
  const intentRaw = jsonRecord(intent.paymentIntent?.raw);
  const latestChargeId = typeof intentRaw.latest_charge === "string" ? intentRaw.latest_charge : null;
  const stripeKey = await getStripeSecretKey({ tenantId: center.organization.tenantId });
  let charge: {
    ok: boolean;
    id: string | null;
    status: string | null;
    paid: boolean;
    amountCents: number | null;
    amountRefundedCents: number | null;
    refunded: boolean;
    disputed: boolean;
    paymentIntentId: string | null;
    createdAt: string | null;
  } = {
    ok: false,
    id: null,
    status: null,
    paid: false,
    amountCents: null,
    amountRefundedCents: null,
    refunded: false,
    disputed: false,
    paymentIntentId: null,
    createdAt: null,
  };
  if (stripeKey && connectedAccountId && latestChargeId?.startsWith("ch_")) {
    const response = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(latestChargeId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}`, "Stripe-Account": connectedAccountId },
      signal: AbortSignal.timeout(10_000),
    });
    const raw = await response.json().catch(() => null) as Record<string, unknown> | null;
    charge = {
      ok: response.ok && raw?.id === latestChargeId,
      id: typeof raw?.id === "string" ? raw.id : null,
      status: typeof raw?.status === "string" ? raw.status : null,
      paid: raw?.paid === true,
      amountCents: typeof raw?.amount === "number" ? raw.amount : null,
      amountRefundedCents: typeof raw?.amount_refunded === "number" ? raw.amount_refunded : null,
      refunded: raw?.refunded === true,
      disputed: raw?.disputed === true,
      paymentIntentId: typeof raw?.payment_intent === "string" ? raw.payment_intent : null,
      createdAt: typeof raw?.created === "number" ? new Date(raw.created * 1000).toISOString() : null,
    };
  }

  const paymentFields = jsonRecord(payment.customFields);
  const state = {
    centerId: center.id,
    centerName: center.name,
    familyId: family.id,
    familyCenterId: family.centerId,
    child: family.children[0] ?? null,
    billingAccountId: family.billingAccount?.id ?? null,
    balanceCents: family.billingAccount?.balanceCents ?? null,
    latestLedgerEntryId: family.billingAccount?.ledgerEntries[0]?.id ?? null,
    latestLedgerBalanceCents: family.billingAccount?.ledgerEntries[0]?.balanceAfterCents ?? null,
    payment: {
      id: payment.id,
      billingAccountId: payment.billingAccountId,
      amountCents: payment.amountCents,
      status: payment.status,
      provider: payment.provider,
      paidAt: payment.paidAt?.toISOString() ?? null,
      externalIdPlaceholder: payment.externalIdPlaceholder,
      stripeCheckoutSessionId: paymentFields.stripeCheckoutSessionId ?? null,
      stripePaymentIntentId: paymentFields.stripePaymentIntentId ?? null,
      familyId: paymentFields.familyId ?? null,
      centerId: paymentFields.centerId ?? null,
      ledgerEntries: payment.ledgerEntries,
    },
    invoice,
    candidateInvoices,
    intentLedger,
    stripe: {
      sessionOk: session.ok,
      sessionStatus: session.session?.status ?? null,
      sessionPaymentStatus: session.session?.paymentStatus ?? null,
      sessionAmountCents: session.session?.amountTotalCents ?? null,
      sessionPaymentIntentId: session.session?.paymentIntentId ?? null,
      intentOk: intent.ok,
      intentStatus: intent.paymentIntent?.status ?? null,
      intentAmountCents: intent.paymentIntent?.amountCents ?? null,
      intentId: intent.paymentIntent?.id ?? null,
      charge,
    },
  };

  return { center, family, payment, invoice, paymentFields, intent, state, fingerprint: fingerprint(state) };
}

function assertUncorrected(review: Awaited<ReturnType<typeof inspect>>) {
  const { state } = review;
  const mismatches = [
    state.centerId === EXPECTED.centerId && state.centerName === EXPECTED.centerName,
    state.familyId === EXPECTED.familyId && state.familyCenterId === EXPECTED.centerId,
    state.child?.id === EXPECTED.childId && state.child.fullName === EXPECTED.childName,
    state.billingAccountId === EXPECTED.billingAccountId,
    state.balanceCents === EXPECTED.amountCents,
    state.latestLedgerBalanceCents === EXPECTED.amountCents,
    state.payment.id === EXPECTED.paymentId,
    state.payment.billingAccountId === EXPECTED.billingAccountId,
    state.payment.amountCents === EXPECTED.amountCents,
    state.payment.status === PaymentStatus.FAILED,
    state.payment.provider === "stripe",
    state.payment.paidAt === null,
    state.payment.externalIdPlaceholder === EXPECTED.stripeCheckoutSessionId,
    state.payment.stripeCheckoutSessionId === EXPECTED.stripeCheckoutSessionId,
    state.payment.stripePaymentIntentId === EXPECTED.stripePaymentIntentId,
    state.payment.familyId === EXPECTED.familyId,
    state.payment.centerId === EXPECTED.centerId,
    state.payment.ledgerEntries.length === 0,
    state.invoice.id === EXPECTED.invoiceId,
    state.invoice.billingAccountId === EXPECTED.billingAccountId,
    state.invoice.status === PaymentStatus.OPEN,
    state.invoice.totalCents === EXPECTED.invoiceAmountCents,
    state.candidateInvoices.length === 1,
    state.candidateInvoices[0]?.id === EXPECTED.invoiceId,
    state.candidateInvoices[0]?.billingAccountId === EXPECTED.billingAccountId,
    state.candidateInvoices[0]?.status === PaymentStatus.OPEN,
    state.candidateInvoices[0]?.totalCents === EXPECTED.invoiceAmountCents,
    state.intentLedger === null,
    state.stripe.sessionOk,
    state.stripe.sessionStatus === "complete",
    state.stripe.sessionPaymentStatus === "paid",
    state.stripe.sessionAmountCents === EXPECTED.amountCents,
    state.stripe.sessionPaymentIntentId === EXPECTED.stripePaymentIntentId,
    state.stripe.intentOk,
    state.stripe.intentStatus === "succeeded",
    state.stripe.intentAmountCents === EXPECTED.amountCents,
    state.stripe.intentId === EXPECTED.stripePaymentIntentId,
    state.stripe.charge.ok,
    state.stripe.charge.status === "succeeded",
    state.stripe.charge.paid,
    state.stripe.charge.amountCents === EXPECTED.amountCents,
    state.stripe.charge.amountRefundedCents === 0,
    !state.stripe.charge.refunded,
    !state.stripe.charge.disputed,
    state.stripe.charge.paymentIntentId === EXPECTED.stripePaymentIntentId,
    state.stripe.charge.createdAt !== null,
  ];
  if (mismatches.some((matches) => !matches)) {
    throw new Error("Live state no longer matches the reviewed Nandini payment correction plan.");
  }
}

function assertApplied(review: Awaited<ReturnType<typeof inspect>>) {
  const { state } = review;
  const ledger = state.payment.ledgerEntries[0];
  const matches = [
    state.payment.status === PaymentStatus.PAID,
    state.payment.paidAt === state.stripe.charge.createdAt,
    state.balanceCents === 0,
    state.latestLedgerBalanceCents === 0,
    state.payment.ledgerEntries.length === 1,
    ledger?.externalId === EXPECTED.stripePaymentIntentId,
    ledger?.amountCents === -EXPECTED.amountCents,
    ledger?.balanceAfterCents === 0,
    state.intentLedger?.id === ledger?.id,
    state.intentLedger?.paymentId === EXPECTED.paymentId,
    state.intentLedger?.amountCents === -EXPECTED.amountCents,
    state.intentLedger?.balanceAfterCents === 0,
    state.invoice.status === PaymentStatus.PAID,
    state.candidateInvoices.length === 0,
    state.stripe.sessionOk,
    state.stripe.sessionStatus === "complete",
    state.stripe.sessionPaymentStatus === "paid",
    state.stripe.sessionAmountCents === EXPECTED.amountCents,
    state.stripe.sessionPaymentIntentId === EXPECTED.stripePaymentIntentId,
    state.stripe.intentOk,
    state.stripe.intentStatus === "succeeded",
    state.stripe.intentAmountCents === EXPECTED.amountCents,
    state.stripe.intentId === EXPECTED.stripePaymentIntentId,
    state.stripe.charge.ok,
    state.stripe.charge.status === "succeeded",
    state.stripe.charge.paid,
    state.stripe.charge.amountCents === EXPECTED.amountCents,
    state.stripe.charge.amountRefundedCents === 0,
    !state.stripe.charge.refunded,
    !state.stripe.charge.disputed,
    state.stripe.charge.paymentIntentId === EXPECTED.stripePaymentIntentId,
  ];
  if (matches.some((matchesExpected) => !matchesExpected)) {
    throw new Error("Applied payment no longer matches the exact ledger and Stripe provider state.");
  }
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  const suppliedFingerprint = process.argv.find((arg) => arg.startsWith("--confirm-fingerprint="))?.split("=")[1] ?? "";
  const review = await inspect();

  if (
    review.state.payment.status === PaymentStatus.PAID
    && review.state.balanceCents === 0
    && review.state.latestLedgerBalanceCents === 0
    && review.state.payment.ledgerEntries.length === 1
    && review.state.invoice.status === PaymentStatus.PAID
  ) {
    assertApplied(review);
    console.log(JSON.stringify({ ok: true, mode: "already_applied", state: review.state }, null, 2));
    return;
  }

  assertUncorrected(review);
  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      mode: "preview",
      fingerprint: review.fingerprint,
      expectedResult: {
        paymentStatus: PaymentStatus.PAID,
        balanceCents: 0,
        latestLedgerBalanceCents: 0,
        invoiceStatus: PaymentStatus.PAID,
        newCharges: 0,
        refunds: 0,
      },
      state: review.state,
    }, null, 2));
    return;
  }
  if (!confirmed || suppliedFingerprint !== review.fingerprint) {
    throw new Error(`Apply requires ${CONFIRM_FLAG} and --confirm-fingerprint=${review.fingerprint}`);
  }

  const appliedAt = new Date(review.state.stripe.charge.createdAt!);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${EXPECTED.billingAccountId} FOR UPDATE`);
    const locked = await tx.payment.findUniqueOrThrow({
      where: { id: EXPECTED.paymentId },
      select: { status: true, billingAccountId: true, amountCents: true, customFields: true, ledgerEntries: { select: { id: true } } },
    });
    const lockedAccount = await tx.billingAccount.findUniqueOrThrow({
      where: { id: EXPECTED.billingAccountId },
      select: { balanceCents: true },
    });
    const lockedCandidateInvoices = await tx.invoice.findMany({
      where: {
        billingAccountId: EXPECTED.billingAccountId,
        status: PaymentStatus.OPEN,
        totalCents: { gt: 0 },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, totalCents: true },
    });
    const lockedFields = jsonRecord(locked.customFields);
    if (
      locked.status !== PaymentStatus.FAILED
      || locked.billingAccountId !== EXPECTED.billingAccountId
      || locked.amountCents !== EXPECTED.amountCents
      || lockedAccount.balanceCents !== EXPECTED.amountCents
      || locked.ledgerEntries.length !== 0
      || lockedFields.stripePaymentIntentId !== EXPECTED.stripePaymentIntentId
      || lockedCandidateInvoices.length !== 1
      || lockedCandidateInvoices[0]?.id !== EXPECTED.invoiceId
      || lockedCandidateInvoices[0]?.totalCents !== EXPECTED.invoiceAmountCents
    ) {
      throw new Error("Locked payment state changed after preview; correction aborted.");
    }

    const application = await applySucceededStripeFamilyBalancePayment(tx, {
      paymentId: EXPECTED.paymentId,
      externalId: EXPECTED.stripeCheckoutSessionId,
      stripePaymentIntentId: EXPECTED.stripePaymentIntentId,
      stripePaymentStatus: "paid",
      stripePaymentIntentStatus: "succeeded",
      stripeAmountTotalCents: EXPECTED.amountCents,
      stripeEventId: typeof lockedFields.stripeEventId === "string" ? lockedFields.stripeEventId : null,
      metadata: lockedFields,
      descriptionFallback: "Director card payment",
      appliedAt,
    });
    if (
      !application.applied
      || application.appliedInvoiceIds?.length !== 1
      || application.appliedInvoiceIds[0] !== EXPECTED.invoiceId
    ) {
      throw new Error(`Payment application failed: ${application.reason ?? "invoice_not_applied"}`);
    }

    await tx.auditLog.create({
      data: {
        tenantId: review.center.organization.tenantId,
        centerId: EXPECTED.centerId,
        action: "billing.garland_nandini_payment_reconciled",
        resource: "Payment",
        resourceId: EXPECTED.paymentId,
        metadata: {
          familyId: EXPECTED.familyId,
          billingAccountId: EXPECTED.billingAccountId,
          invoiceId: EXPECTED.invoiceId,
          amountCents: EXPECTED.amountCents,
          stripePaymentIntentId: EXPECTED.stripePaymentIntentId,
          stripeCheckoutSessionId: EXPECTED.stripeCheckoutSessionId,
          sourceFingerprint: review.fingerprint,
          providerVerifiedSucceeded: true,
          paymentHistoryPreserved: true,
          newChargeCreated: false,
          refundCreated: false,
        },
      },
    });
    await tx.center.update({ where: { id: EXPECTED.centerId }, data: { updatedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const verified = await inspect();
  assertApplied(verified);
  console.log(JSON.stringify({ ok: true, mode: "applied", state: verified.state }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
