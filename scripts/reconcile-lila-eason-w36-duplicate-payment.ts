import { createHash } from "node:crypto";
import { PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { issueFamilyRefund } from "@/lib/family-refunds";
import { invoiceLedgerBalanceCents } from "@/lib/invoice-void";

const prisma = new PrismaClient();
const CENTER_ID = "cmp4ew8yo001e6alw32jneo3w";
const FAMILY_ID = "cmrw6d14c003hl704dubujz13";
const CHILD_ID = "cms87m90s00326aq0v2hjyjul";
const PRESERVED_INVOICE_ID = "cmt7a1brt000qju04v5tdav5q";
const DUPLICATE_INVOICE_ID = "cmtbjqrsm00p0lb04iiihzxwt";
const DUPLICATE_PAYMENT_ID = "cmtbomvu4002pky04ze6usp5g";
const APPLY = "--apply-reviewed-lila-w36-refund";
const FINGERPRINT_PREFIX = "--reviewed-fingerprint=";
const REASON = "Refund and void the later duplicate W36 tuition payment; preserve the earlier paid W36 invoice.";
const ORIGINAL_RECONCILIATION_FINGERPRINT = "bc292a041bfcfe494847e03b0b895def6752868fd4dbbaec021d8084191ce9cd";

function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); return value; }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function loadState() {
  const [preserved, duplicate, payment, center] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: PRESERVED_INVOICE_ID }, include: { ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } } } }),
    prisma.invoice.findUnique({ where: { id: DUPLICATE_INVOICE_ID }, include: { ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, balanceCents: true, family: { select: { id: true, centerId: true } } } } } }),
    prisma.payment.findUnique({ where: { id: DUPLICATE_PAYMENT_ID }, select: { id: true, billingAccountId: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, paidAt: true, customFields: true, ledgerEntries: { select: { id: true, invoiceId: true, type: true, amountCents: true } } } }),
    prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, organization: { select: { tenantId: true } } } }),
  ]);
  invariant(preserved && duplicate && payment && center, "Exact Lila Eason reconciliation state is incomplete.");
  const preservedFields = object(preserved.customFields);
  const duplicateFields = object(duplicate.customFields);
  const paymentFields = object(payment.customFields);
  invariant(duplicate.billingAccount.family.id === FAMILY_ID && duplicate.billingAccount.family.centerId === CENTER_ID, "Duplicate invoice family or school changed.");
  invariant(preserved.status === PaymentStatus.PAID && (duplicate.status === PaymentStatus.PAID || duplicate.status === PaymentStatus.OPEN || duplicate.status === PaymentStatus.VOID) && preserved.totalCents === 6_000 && duplicate.totalCents === 6_000, "Lila invoice amount or status changed.");
  invariant(preservedFields.billingPeriod === "2026-W36" && duplicateFields.billingPeriod === "2026-W36" && preservedFields.childId === CHILD_ID && duplicateFields.childId === CHILD_ID, "Lila W36 child scope changed.");
  invariant(preserved.ledgerEntries.some((entry) => entry.paymentId && entry.amountCents === -6_000), "Earlier Lila payment is not present to preserve.");
  invariant(duplicate.ledgerEntries.filter((entry) => entry.paymentId).length === 1, "Later Lila invoice is not linked to exactly one payment.");
  invariant((payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) && payment.provider === "stripe" && payment.amountCents === 6_000 && payment.billingAccountId === duplicate.billingAccountId, "Later Lila payment is not the exact reviewed Stripe payment.");
  invariant(paymentFields.invoiceId === DUPLICATE_INVOICE_ID && paymentFields.invoiceNumber === duplicate.number && String(paymentFields.stripePaymentIntentId ?? "").startsWith("pi_"), "Later Lila payment identity changed.");
  const refunded = payment.status === PaymentStatus.REFUNDED && numeric(paymentFields.stripeAmountRefundedCents) >= 6_000;
  const completed = refunded && duplicate.status === PaymentStatus.VOID && duplicateFields.reconciliationFingerprint === ORIGINAL_RECONCILIATION_FINGERPRINT && duplicate.ledgerEntries.some((entry) => entry.type === "invoice_void" && entry.amountCents === -6_000);
  invariant(completed || (refunded && duplicate.status === PaymentStatus.OPEN) || (payment.status === PaymentStatus.PAID && duplicate.status === PaymentStatus.PAID && numeric(paymentFields.stripeAmountRefundedCents) === 0 && paymentFields.stripePaymentIntentStatus === "succeeded" && invoiceLedgerBalanceCents(duplicate.ledgerEntries) === 0), "Lila reconciliation is neither pending, resumable, nor complete.");
  const snapshot = { center, preserved: { id: preserved.id, number: preserved.number, status: preserved.status, totalCents: preserved.totalCents, customFields: preserved.customFields, ledgerEntries: preserved.ledgerEntries }, duplicate: { id: duplicate.id, number: duplicate.number, status: duplicate.status, totalCents: duplicate.totalCents, customFields: duplicate.customFields, ledgerEntries: duplicate.ledgerEntries, billingAccountId: duplicate.billingAccountId, balanceCents: duplicate.billingAccount.balanceCents }, payment };
  return { center, preserved, duplicate, payment, refunded, completed, snapshot, fingerprint: fingerprint(snapshot) };
}

async function main() {
  const before = await loadState();
  if (before.completed) {
    console.log(JSON.stringify({ ok: true, alreadyCompleted: true, refundCents: 6_000, duplicateInvoiceStatus: before.duplicate.status, duplicatePaymentStatus: before.payment.status, preservedInvoiceStatus: before.preserved.status }, null, 2));
    return;
  }
  const apply = process.argv.includes(APPLY);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", fingerprint: before.fingerprint, familyId: FAMILY_ID, childId: CHILD_ID, preservedInvoice: before.preserved.number, duplicateInvoice: before.duplicate.number, stripePaymentId: before.payment.id, refundCents: 6_000 }, null, 2));
  if (!apply) return;
  const reviewed = process.argv.find((value) => value.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length);
  invariant(reviewed === before.fingerprint, "Apply requires the exact current dry-run fingerprint.");
  const dbUser = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true, email: true, name: true, role: true, organizationId: true } });
  invariant(dbUser && dbUser.tenantId === before.center.organization.tenantId, "Billing audit actor or tenant changed.");
  const actor = { ...dbUser, mustResetPassword: false, centerIds: [CENTER_ID], primaryCenterId: CENTER_ID, assignedClassroomId: null, deviceSessionId: null, accessScope: "center", accessGrantCount: 1, profilePhotoUrl: null, branding: {} } as CurrentUser;
  if (!before.refunded) {
    const refunded = await issueFamilyRefund(actor, { familyId: FAMILY_ID, amountCents: 6_000, reason: REASON, preferredPaymentIds: [DUPLICATE_PAYMENT_ID], operationId: `lila-eason-w36-duplicate:${DUPLICATE_INVOICE_ID}`, tenantId: dbUser.tenantId });
    invariant(refunded.ok, `Lila duplicate refund failed: ${refunded.ok ? "unknown" : refunded.error}`);
    invariant(refunded.totalCents === 6_000 && refunded.allocations.length === 1 && refunded.allocations[0].paymentId === DUPLICATE_PAYMENT_ID, "Refund allocation did not match the exact duplicate payment.");
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findUniqueOrThrow({ where: { id: DUPLICATE_INVOICE_ID }, include: { ledgerEntries: { select: { amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, family: { select: { id: true, centerId: true } } } } } });
    invariant(current.status === PaymentStatus.OPEN && current.billingAccount.family.id === FAMILY_ID && current.billingAccount.family.centerId === CENTER_ID, "Duplicate invoice did not reopen after refund.");
    const currentPaymentIds = [...new Set(current.ledgerEntries.map((entry) => entry.paymentId).filter((id): id is string => Boolean(id)))];
    const payments = await tx.payment.findMany({ where: { id: { in: currentPaymentIds } }, select: { id: true, status: true, amountCents: true, customFields: true } });
    invariant(payments.some((item) => item.id === DUPLICATE_PAYMENT_ID && item.status === PaymentStatus.REFUNDED && numeric(object(item.customFields).stripeAmountRefundedCents) >= 6_000), "Duplicate payment is not fully refunded in the ledger.");
    const reversalCents = invoiceLedgerBalanceCents(current.ledgerEntries);
    invariant(reversalCents === 6_000, "Duplicate invoice does not net to $60 after refund.");
    const updated = await tx.invoice.updateMany({ where: { id: current.id, status: PaymentStatus.OPEN }, data: { status: PaymentStatus.VOID, customFields: { ...object(current.customFields), voidedAt: new Date().toISOString(), voidedByUserId: dbUser.id, voidedByEmail: dbUser.email, voidReason: REASON, duplicateOfInvoiceId: PRESERVED_INVOICE_ID, duplicateOfInvoiceNumber: before.preserved.number, reconciliationFingerprint: before.fingerprint } as Prisma.InputJsonObject } });
    invariant(updated.count === 1, "Duplicate invoice changed before void.");
    const account = await tx.billingAccount.update({ where: { id: current.billingAccount.id }, data: { balanceCents: { decrement: reversalCents } }, select: { balanceCents: true } });
    const ledger = await tx.ledgerEntry.create({ data: { billingAccountId: current.billingAccount.id, invoiceId: current.id, type: "invoice_void", description: `Voided refunded duplicate ${current.number}; preserved ${before.preserved.number}.`, amountCents: -reversalCents, balanceAfterCents: account.balanceCents, sourceSystem: "bee_suite_manual", externalId: `invoice-void:${current.id}`, metadata: { refundedPaymentId: DUPLICATE_PAYMENT_ID, duplicateOfInvoiceId: PRESERVED_INVOICE_ID, reconciliationFingerprint: before.fingerprint } } });
    await tx.auditLog.create({ data: { tenantId: dbUser.tenantId, centerId: CENTER_ID, userId: dbUser.id, action: "billing.invoice.duplicate_payment_refunded_and_voided", resource: "Invoice", resourceId: current.id, metadata: { familyId: FAMILY_ID, childId: CHILD_ID, invoiceNumber: current.number, refundCents: 6_000, refundedPaymentId: DUPLICATE_PAYMENT_ID, preservedInvoiceId: PRESERVED_INVOICE_ID, ledgerEntryId: ledger.id, reconciliationFingerprint: before.fingerprint } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  const [duplicateAfter, paymentAfter, preservedAfter] = await Promise.all([prisma.invoice.findUnique({ where: { id: DUPLICATE_INVOICE_ID }, select: { status: true } }), prisma.payment.findUnique({ where: { id: DUPLICATE_PAYMENT_ID }, select: { status: true, customFields: true } }), prisma.invoice.findUnique({ where: { id: PRESERVED_INVOICE_ID }, select: { status: true } })]);
  invariant(duplicateAfter?.status === PaymentStatus.VOID && paymentAfter?.status === PaymentStatus.REFUNDED && preservedAfter?.status === PaymentStatus.PAID, "Lila reconciliation post-verification failed.");
  console.log(JSON.stringify({ ok: true, refundCents: 6_000, duplicateInvoiceStatus: duplicateAfter.status, duplicatePaymentStatus: paymentAfter.status, preservedInvoiceStatus: preservedAfter.status }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
