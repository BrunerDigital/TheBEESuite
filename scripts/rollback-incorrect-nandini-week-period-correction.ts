import "./load-env";

import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const EXPECTED = {
  tenantId: "cmp4evl4v00006arspz79fggn",
  centerId: "cmp4ewh78004y6alwu6s3bsv4",
  familyId: "cms9fbxyq003r6asg3rdwmwgq",
  childId: "cms9fc3d8004d6asgiy5s0zee",
  accountId: "cmsqggt16000rla04kma3pw7q",
  invoiceId: "cmsrjjqqw0060l204kn47ullc",
  paymentId: "cmsxsvtts000kjr04huhu5szm",
  paymentIntentId: "pi_3U5YxvGTSvJ4xnyr2Nx6K5U7",
  sourceLedgerId: "cmsthg0h800016ax87me4no7h",
  sourceSha256: "6c95575a1aa967606605904e24e29135ef533f0dd47a10f0aa811d22e2afe418",
  weekCents: 13_500,
  paymentCents: 27_000,
} as const;

const CORRECTION_EXTERNAL_ID = `garland-nandini-w34-period-correction:${EXPECTED.invoiceId}`;
const ROLLBACK_EXTERNAL_ID = `${CORRECTION_EXTERNAL_ID}:rollback`;
const APPLY = "--apply";
const CONFIRM = "--confirm-rollback-incorrect-nandini-correction";
const FP = "--confirm-fingerprint=";

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function input(value: Record<string, unknown>) {
  return value as Prisma.InputJsonObject;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function inspect() {
  const [account, invoice, payment, correction, rollback, correctionAudit, rollbackAudit] = await Promise.all([
    prisma.billingAccount.findUniqueOrThrow({
      where: { id: EXPECTED.accountId },
      select: { balanceCents: true, customFields: true, family: { select: { id: true, centerId: true, children: { where: { id: EXPECTED.childId }, select: { id: true } } } }, ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, balanceAfterCents: true } } },
    }),
    prisma.invoice.findUniqueOrThrow({ where: { id: EXPECTED.invoiceId }, select: { status: true, totalCents: true, customFields: true } }),
    prisma.payment.findUniqueOrThrow({ where: { id: EXPECTED.paymentId }, select: { status: true, amountCents: true, provider: true, paidAt: true, customFields: true, ledgerEntries: { select: { id: true, amountCents: true, externalId: true } } } }),
    prisma.ledgerEntry.findUniqueOrThrow({ where: { sourceSystem_externalId: { sourceSystem: "bee_suite", externalId: CORRECTION_EXTERNAL_ID } }, select: { id: true, amountCents: true, balanceAfterCents: true } }),
    prisma.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "bee_suite", externalId: ROLLBACK_EXTERNAL_ID } }, select: { id: true, amountCents: true, balanceAfterCents: true } }),
    prisma.auditLog.findFirst({ where: { action: "billing.garland_nandini_weekly_period_corrected", resourceId: EXPECTED.invoiceId }, select: { id: true } }),
    prisma.auditLog.findFirst({ where: { action: "billing.garland_nandini_weekly_period_correction_reversed", resourceId: EXPECTED.invoiceId }, select: { id: true } }),
  ]);
  const invoiceFields = object(invoice.customFields);
  const paymentFields = object(payment.customFields);
  const accountFields = object(account.customFields);
  const responsibility = object(accountFields.garlandAccountReflectionReconciliation as Prisma.JsonValue | undefined);
  const state = {
    account: { balanceCents: account.balanceCents, familyId: account.family.id, centerId: account.family.centerId, childCount: account.family.children.length, latestLedgerId: account.ledgerEntries[0]?.id ?? null, latestBalanceCents: account.ledgerEntries[0]?.balanceAfterCents ?? null },
    invoice: { status: invoice.status, totalCents: invoice.totalCents, paymentId: clean(invoiceFields.paymentId), paymentIntentId: clean(invoiceFields.stripePaymentIntentId), paidByBalancePayment: invoiceFields.paidByBalancePayment === true, correction: invoiceFields.weeklyPeriodCorrection ?? null },
    payment: { status: payment.status, amountCents: payment.amountCents, provider: payment.provider, paidAt: payment.paidAt?.toISOString() ?? null, paymentIntentId: clean(paymentFields.stripePaymentIntentId), appliedInvoiceIds: Array.isArray(paymentFields.appliedInvoiceIds) ? paymentFields.appliedInvoiceIds : [], appliedInvoiceCount: Number(paymentFields.appliedInvoiceCount ?? 0), applicationStatus: clean(paymentFields.invoiceApplicationStatus), correction: paymentFields.weeklyPeriodCorrection ?? null, ledger: payment.ledgerEntries },
    responsibility: { balanceCents: Number(responsibility.familyResponsibilityBalanceCents ?? 0), ledgerId: clean(responsibility.familyResponsibilityConfirmationLedgerEntryId), correction: responsibility.weeklyPeriodCorrection ?? null },
    correction,
    rollback,
    correctionAudit,
    rollbackAudit,
  };
  return { state, fingerprint: hash(state), accountFields, invoiceFields, paymentFields, responsibility };
}

function assertPayment(state: Awaited<ReturnType<typeof inspect>>["state"]) {
  invariant(state.payment.status === PaymentStatus.PAID && state.payment.amountCents === EXPECTED.paymentCents && state.payment.provider === "stripe", "Succeeded payment changed.");
  invariant(state.payment.paymentIntentId === EXPECTED.paymentIntentId && state.payment.ledger.length === 1 && state.payment.ledger[0].amountCents === -EXPECTED.paymentCents && state.payment.ledger[0].externalId === EXPECTED.paymentIntentId, "Payment ledger changed.");
}

function assertNeedsRollback(review: Awaited<ReturnType<typeof inspect>>) {
  const state = review.state;
  invariant(state.account.familyId === EXPECTED.familyId && state.account.centerId === EXPECTED.centerId && state.account.childCount === 1, "Nandini scope changed.");
  invariant(state.account.balanceCents === EXPECTED.weekCents && state.account.latestBalanceCents === EXPECTED.weekCents && state.account.latestLedgerId === state.correction.id, "Incorrect correction is not the latest balance state.");
  invariant(state.invoice.status === PaymentStatus.OPEN && state.invoice.totalCents === EXPECTED.weekCents && !state.invoice.paymentId && !state.invoice.paymentIntentId, "Invoice changed after the incorrect correction.");
  assertPayment(state);
  invariant(state.payment.appliedInvoiceIds.length === 0 && state.payment.appliedInvoiceCount === 0 && state.payment.applicationStatus === "applied_to_prior_balance", "Payment allocation changed after the incorrect correction.");
  invariant(state.correction.amountCents === EXPECTED.weekCents && state.correction.balanceAfterCents === EXPECTED.weekCents && state.correctionAudit, "Incorrect correction evidence is incomplete.");
  invariant(!state.rollback && !state.rollbackAudit, "Rollback is partially present.");
}

function assertRolledBack(review: Awaited<ReturnType<typeof inspect>>) {
  const state = review.state;
  invariant(state.account.balanceCents === 0 && state.account.latestBalanceCents === 0 && state.account.latestLedgerId === state.rollback?.id, "Rollback balance is not restored.");
  invariant(state.invoice.status === PaymentStatus.PAID && state.invoice.paymentId === EXPECTED.paymentId && state.invoice.paymentIntentId === EXPECTED.paymentIntentId && state.invoice.paidByBalancePayment, "Invoice payment allocation was not restored.");
  assertPayment(state);
  invariant(state.payment.appliedInvoiceIds.length === 1 && state.payment.appliedInvoiceIds[0] === EXPECTED.invoiceId && state.payment.appliedInvoiceCount === 1 && state.payment.applicationStatus === "applied_to_open_invoices", "Payment invoice allocation was not restored.");
  invariant(state.rollback?.amountCents === -EXPECTED.weekCents && state.rollback.balanceAfterCents === 0 && state.rollbackAudit, "Rollback evidence is incomplete.");
}

async function applyRollback(review: Awaited<ReturnType<typeof inspect>>) {
  const at = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${EXPECTED.accountId} FOR UPDATE`);
    const existingRollback = await tx.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "bee_suite", externalId: ROLLBACK_EXTERNAL_ID } }, select: { id: true } });
    invariant(!existingRollback, "Rollback already exists.");
    const [account, invoice, payment] = await Promise.all([
      tx.billingAccount.findUniqueOrThrow({ where: { id: EXPECTED.accountId }, select: { balanceCents: true, customFields: true } }),
      tx.invoice.findUniqueOrThrow({ where: { id: EXPECTED.invoiceId }, select: { status: true, totalCents: true, customFields: true } }),
      tx.payment.findUniqueOrThrow({ where: { id: EXPECTED.paymentId }, select: { status: true, amountCents: true, customFields: true } }),
    ]);
    invariant(account.balanceCents === EXPECTED.weekCents && invoice.status === PaymentStatus.OPEN && invoice.totalCents === EXPECTED.weekCents && payment.status === PaymentStatus.PAID && payment.amountCents === EXPECTED.paymentCents, "Rollback state changed after preview.");
    const invoiceFields = object(invoice.customFields);
    const paymentFields = object(payment.customFields);
    delete invoiceFields.weeklyPeriodCorrection;
    delete paymentFields.weeklyPeriodCorrection;
    await tx.invoice.update({ where: { id: EXPECTED.invoiceId }, data: { status: PaymentStatus.PAID, customFields: input({ ...invoiceFields, status: "paid", paidAt: review.state.payment.paidAt, paymentId: EXPECTED.paymentId, paidByBalancePayment: true, stripePaymentIntentId: EXPECTED.paymentIntentId, stripeCheckoutSessionId: null }) } });
    await tx.payment.update({ where: { id: EXPECTED.paymentId }, data: { customFields: input({ ...paymentFields, appliedInvoiceIds: [EXPECTED.invoiceId], appliedInvoiceCount: 1, invoiceApplicationStatus: "applied_to_open_invoices", status: "paid" }) } });
    const updated = await tx.billingAccount.update({ where: { id: EXPECTED.accountId }, data: { balanceCents: { decrement: EXPECTED.weekCents } }, select: { balanceCents: true } });
    invariant(updated.balanceCents === 0, "Rollback did not restore zero balance.");
    const rollback = await tx.ledgerEntry.create({ data: { billingAccountId: EXPECTED.accountId, type: "billing_correction", description: "Reversed incorrectly scoped Nandini W34 period correction", amountCents: -EXPECTED.weekCents, balanceAfterCents: 0, effectiveAt: at, sourceSystem: "bee_suite", externalId: ROLLBACK_EXTERNAL_ID, metadata: { reversedLedgerEntryId: review.state.correction.id, reason: "The Centennial FTE question was mistakenly applied to an unrelated Garland family.", paymentPreserved: true, newChargeCreated: false, refundCreated: false, reviewedFingerprint: review.fingerprint } }, select: { id: true } });
    const accountFields = object(account.customFields);
    const responsibility = object(accountFields.garlandAccountReflectionReconciliation as Prisma.JsonValue | undefined);
    delete responsibility.weeklyPeriodCorrection;
    await tx.billingAccount.update({ where: { id: EXPECTED.accountId }, data: { customFields: input({ ...accountFields, garlandAccountReflectionReconciliation: { ...responsibility, familyResponsibilityBalanceCents: EXPECTED.paymentCents, familyResponsibilityConfirmationLedgerEntryId: EXPECTED.sourceLedgerId } }) } });
    await tx.auditLog.create({ data: { tenantId: EXPECTED.tenantId, centerId: EXPECTED.centerId, action: "billing.garland_nandini_weekly_period_correction_reversed", resource: "Invoice", resourceId: EXPECTED.invoiceId, metadata: { familyId: EXPECTED.familyId, childId: EXPECTED.childId, paymentId: EXPECTED.paymentId, reversedLedgerEntryId: review.state.correction.id, rollbackLedgerEntryId: rollback.id, reason: "Centennial FTE reporting clarification was unrelated to Garland.", paymentPreserved: true, newChargeCreated: false, refundCreated: false, reviewedFingerprint: review.fingerprint } } });
    await tx.center.update({ where: { id: EXPECTED.centerId }, data: { updatedAt: at } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 60_000 });
}

async function main() {
  const review = await inspect();
  if (review.state.rollback || review.state.rollbackAudit) {
    assertRolledBack(review);
    console.log(JSON.stringify({ ok: true, mode: "already_rolled_back", balanceCents: 0, invoiceStatus: PaymentStatus.PAID, paymentStatus: PaymentStatus.PAID }, null, 2));
    return;
  }
  assertNeedsRollback(review);
  if (!process.argv.includes(APPLY)) {
    console.log(JSON.stringify({ ok: true, mode: "preview", fingerprint: review.fingerprint, result: { balanceCents: 0, invoiceStatus: PaymentStatus.PAID, paymentStatus: PaymentStatus.PAID, newCharges: 0, refunds: 0 } }, null, 2));
    return;
  }
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(process.argv.includes(`${FP}${review.fingerprint}`), `Apply requires ${FP}${review.fingerprint}`);
  await applyRollback(review);
  const after = await inspect();
  assertRolledBack(after);
  console.log(JSON.stringify({ ok: true, mode: "rolled_back", balanceCents: 0, invoiceStatus: PaymentStatus.PAID, paymentStatus: PaymentStatus.PAID, paymentPreserved: true, newCharges: 0, refunds: 0 }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
