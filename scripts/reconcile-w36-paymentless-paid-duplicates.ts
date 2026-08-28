import { createHash } from "node:crypto";
import { PaymentStatus, Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGETS = [
  { duplicateId: "cmtbjqheg00irlb04mgyee2re", preservedId: "cmt7a6te60007l504k0wkn8by" },
  { duplicateId: "cmtayavco0003l7043e0xcd8q", preservedId: "cmtbjpyqm007olb04bl4a9ae9" },
];
const APPLY = "--apply-reviewed-w36-paymentless-duplicates";
const FINGERPRINT_PREFIX = "--reviewed-fingerprint=";
const ORIGINAL_RECONCILIATION_FINGERPRINT = "0fd84f78ef839b47bf8730ac0866d094d2a491e9c7061e9ba6ff33b83984d2b3";
function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); return value; }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function loadState() {
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: TARGETS.flatMap((target) => [target.duplicateId, target.preservedId]) } },
    include: { ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, balanceCents: true, family: { select: { id: true, name: true, centerId: true } } } } },
  });
  const resolved = TARGETS.map((target) => {
    const duplicate = invoices.find((invoice) => invoice.id === target.duplicateId);
    const preserved = invoices.find((invoice) => invoice.id === target.preservedId);
    invariant(duplicate && preserved, "A reviewed duplicate pair is missing.");
    const duplicateFields = object(duplicate.customFields);
    const preservedFields = object(preserved.customFields);
    const alreadyCompleted = duplicate.status === PaymentStatus.VOID && object(duplicate.customFields).reconciliationFingerprint === ORIGINAL_RECONCILIATION_FINGERPRINT && duplicate.ledgerEntries.some((entry) => entry.type === "invoice_void" && entry.amountCents === -duplicate.totalCents);
    invariant(alreadyCompleted || (duplicate.status === PaymentStatus.PAID && duplicate.ledgerEntries.every((entry) => !entry.paymentId)), `${duplicate.number} is neither a pending nor completed reviewed duplicate.`);
    if (!alreadyCompleted) invariant(duplicate.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0) === duplicate.totalCents, `${duplicate.number} ledger changed.`);
    invariant(preserved.status === PaymentStatus.PAID && preserved.ledgerEntries.some((entry) => entry.paymentId && entry.amountCents === -preserved.totalCents), `${preserved.number} is not the exact paid invoice to preserve.`);
    invariant(duplicate.billingAccountId === preserved.billingAccountId && duplicate.totalCents === preserved.totalCents, "Duplicate pair account or amount changed.");
    invariant(duplicateFields.billingPeriod === "2026-W36" && preservedFields.billingPeriod === "2026-W36" && duplicateFields.childId === preservedFields.childId, "Duplicate pair period or child changed.");
    return { duplicate, preserved, alreadyCompleted };
  }).filter((item) => !item.alreadyCompleted);
  const snapshot = resolved.map(({ duplicate, preserved }) => ({ duplicate: { id: duplicate.id, number: duplicate.number, status: duplicate.status, totalCents: duplicate.totalCents, customFields: duplicate.customFields, ledgerEntries: duplicate.ledgerEntries, balanceCents: duplicate.billingAccount.balanceCents }, preserved: { id: preserved.id, number: preserved.number, status: preserved.status, totalCents: preserved.totalCents, ledgerEntries: preserved.ledgerEntries } }));
  return { resolved, snapshot, fingerprint: fingerprint(snapshot) };
}

async function main() {
  const before = await loadState();
  const apply = process.argv.includes(APPLY);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", fingerprint: before.fingerprint, invoicesToVoid: before.resolved.length, centsToRemove: before.resolved.reduce((sum, item) => sum + item.duplicate.totalCents, 0), paymentsPreserved: before.resolved.length, refunds: 0 }, null, 2));
  if (!apply) return;
  const reviewed = process.argv.find((value) => value.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length);
  invariant(reviewed === before.fingerprint, "Apply requires the exact current dry-run fingerprint.");
  const actor = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true, email: true } });
  invariant(actor, "Billing audit actor was not found.");
  const targetCenterIds = [...new Set(before.resolved.map(({ duplicate }) => duplicate.billingAccount.family.centerId).filter((centerId): centerId is string => Boolean(centerId)))];
  invariant(targetCenterIds.length === new Set(before.resolved.map(({ duplicate }) => duplicate.billingAccount.family.centerId)).size, "A target invoice has no school scope.");
  const ownedCenters = await prisma.center.count({ where: { id: { in: targetCenterIds }, organization: { tenantId: actor.tenantId } } });
  invariant(ownedCenters === targetCenterIds.length, "Billing audit actor does not own every target school tenant.");
  const appliedAt = new Date();
  for (const { duplicate, preserved } of before.resolved) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findUniqueOrThrow({ where: { id: duplicate.id }, include: { ledgerEntries: { select: { amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, family: { select: { id: true, centerId: true } } } } } });
      invariant(current.status === PaymentStatus.PAID && current.ledgerEntries.every((entry) => !entry.paymentId), `${current.number} changed before reconciliation.`);
      const currentCenter = current.billingAccount.family.centerId ? await tx.center.findUnique({ where: { id: current.billingAccount.family.centerId }, select: { organization: { select: { tenantId: true } } } }) : null;
      invariant(currentCenter?.organization.tenantId === actor.tenantId, `${current.number} moved outside the audit actor tenant.`);
      const reversalCents = current.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
      invariant(reversalCents === current.totalCents, `${current.number} is no longer exactly reversible.`);
      const updated = await tx.invoice.updateMany({ where: { id: current.id, status: PaymentStatus.PAID }, data: { status: PaymentStatus.VOID, customFields: { ...object(current.customFields), voidedAt: appliedAt.toISOString(), voidedByUserId: actor.id, voidedByEmail: actor.email, voidReason: "W36 paymentless duplicate rollback; the paired invoice contains the actual successful payment.", duplicateOfInvoiceId: preserved.id, duplicateOfInvoiceNumber: preserved.number, reconciliationFingerprint: ORIGINAL_RECONCILIATION_FINGERPRINT } as Prisma.InputJsonObject } });
      invariant(updated.count === 1, `${current.number} changed during reconciliation.`);
      const account = await tx.billingAccount.update({ where: { id: current.billingAccount.id }, data: { balanceCents: { decrement: reversalCents } }, select: { balanceCents: true } });
      const ledger = await tx.ledgerEntry.create({ data: { billingAccountId: current.billingAccount.id, invoiceId: current.id, type: "invoice_void", description: `Voided paymentless duplicate ${current.number}; preserved ${preserved.number}.`, amountCents: -reversalCents, balanceAfterCents: account.balanceCents, sourceSystem: "bee_suite_manual", externalId: `invoice-void:${current.id}`, metadata: { duplicateOfInvoiceId: preserved.id, duplicateOfInvoiceNumber: preserved.number, reconciliationFingerprint: ORIGINAL_RECONCILIATION_FINGERPRINT } } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, centerId: current.billingAccount.family.centerId, userId: actor.id, action: "billing.invoice.paymentless_duplicate_reconciled", resource: "Invoice", resourceId: current.id, metadata: { familyId: current.billingAccount.family.id, invoiceNumber: current.number, amountCents: reversalCents, preservedInvoiceId: preserved.id, preservedInvoiceNumber: preserved.number, ledgerEntryId: ledger.id, reconciliationFingerprint: before.fingerprint } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }
  const after = await prisma.invoice.findMany({ where: { id: { in: TARGETS.map((target) => target.duplicateId) } }, select: { id: true, status: true } });
  invariant(after.every((invoice) => invoice.status === PaymentStatus.VOID), "Not every paymentless duplicate is void.");
  console.log(JSON.stringify({ ok: true, voided: after.length, paymentsPreserved: before.resolved.length, refunds: 0 }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
