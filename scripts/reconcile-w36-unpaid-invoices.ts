import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { invoiceLedgerBalanceCents } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";

const PERIOD = "2026-W36";
const AVON_ID = "cmp4ewd6p00386alw2ngcihed";
const DUPLICATE_IDS = [
  "cmtbjq28t009ilb04alm3d07y",
  "cmtbjq2av009olb04ufkjkcoh",
  "cmtbjsman01uclb04qa80wolq",
  "cmtcz5ue1000hih04q4r0ptlp",
  "cmtcz63i8000qih04kqbm8lbv",
];
const APPLY = "--apply-reviewed-w36-unpaid-reconciliation";
const FINGERPRINT_PREFIX = "--reviewed-fingerprint=";
const ORIGINAL_RECONCILIATION_FINGERPRINT = "17070c275b8a401c0e3520c5b3e4acc4826c00d3065b7ce096ac427ef4aee124";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function loadState(client = prisma) {
  const avonAll = await client.invoice.findMany({
    where: {
      billingAccount: { family: { centerId: AVON_ID } },
      AND: [
        { customFields: { path: ["billingPeriod"], equals: PERIOD } },
        { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
      ],
    },
    include: { ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, balanceCents: true, family: { select: { id: true, name: true, centerId: true } } } } },
    orderBy: { number: "asc" },
  });
  invariant(avonAll.length === 46, `Expected 46 Avon W36 invoices; found ${avonAll.length}.`);
  invariant(avonAll.reduce((sum, invoice) => sum + invoice.totalCents, 0) === 666_000, "Avon W36 total changed.");
  for (const invoice of avonAll.filter((item) => item.status === PaymentStatus.VOID)) {
    invariant(object(invoice.customFields).reconciliationFingerprint === ORIGINAL_RECONCILIATION_FINGERPRINT, `${invoice.number} was voided outside this reconciliation.`);
    invariant(invoice.ledgerEntries.some((entry) => entry.type === "invoice_void" && entry.amountCents === -invoice.totalCents), `${invoice.number} is missing its exact compensating ledger entry.`);
  }
  invariant(avonAll.every((invoice) => invoice.status === PaymentStatus.OPEN || invoice.status === PaymentStatus.VOID), "An Avon invoice has an unexpected status.");
  const avon = avonAll.filter((invoice) => invoice.status === PaymentStatus.OPEN);

  const duplicates = await client.invoice.findMany({
    where: { id: { in: DUPLICATE_IDS } },
    include: { ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, balanceCents: true, family: { select: { id: true, name: true, centerId: true } } } } },
    orderBy: { number: "asc" },
  });
  invariant(duplicates.length === DUPLICATE_IDS.length, "One or more exact duplicate invoices is missing.");

  const targets = [...avon.map((invoice) => ({ invoice, reason: "Avon W36 tuition invoice rollback: live parent billing was not activated for this school." })), ...duplicates.map((invoice) => ({ invoice, reason: "W36 duplicate rollback: an earlier active invoice already billed the same child and period." }))];
  for (const target of targets) {
    const fields = object(target.invoice.customFields);
    invariant(target.invoice.status === PaymentStatus.OPEN, `${target.invoice.number} is no longer open.`);
    invariant(fields.billingPeriod === PERIOD && fields.chargeSource === "tuitionPlan", `${target.invoice.number} is outside W36 tuition scope.`);
    invariant(target.invoice.ledgerEntries.every((entry) => !entry.paymentId), `${target.invoice.number} gained a payment.`);
    invariant(invoiceLedgerBalanceCents(target.invoice.ledgerEntries) === target.invoice.totalCents, `${target.invoice.number} is not an exactly reversible unpaid invoice.`);
    if (DUPLICATE_IDS.includes(target.invoice.id)) {
      const childId = String(fields.childId ?? "");
      invariant(childId, `${target.invoice.number} has no child identity.`);
      const earlier = await client.invoice.findFirst({
        where: {
          id: { not: target.invoice.id },
          status: { not: PaymentStatus.VOID },
          createdAt: { lt: target.invoice.createdAt },
          billingAccountId: target.invoice.billingAccountId,
          AND: [
            { customFields: { path: ["billingPeriod"], equals: PERIOD } },
            { customFields: { path: ["childId"], equals: childId } },
          ],
        },
        select: { id: true, number: true, status: true, totalCents: true },
      });
      invariant(earlier && earlier.totalCents === target.invoice.totalCents, `${target.invoice.number} no longer has its exact earlier invoice.`);
      fields.duplicateOfInvoiceId = earlier.id;
      fields.duplicateOfInvoiceNumber = earlier.number;
    }
  }

  const snapshot = targets.map(({ invoice, reason }) => ({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    totalCents: invoice.totalCents,
    createdAt: invoice.createdAt.toISOString(),
    billingAccountId: invoice.billingAccountId,
    balanceCents: invoice.billingAccount.balanceCents,
    familyId: invoice.billingAccount.family.id,
    centerId: invoice.billingAccount.family.centerId,
    customFields: invoice.customFields,
    ledgerEntries: invoice.ledgerEntries,
    reason,
  }));
  return { targets, snapshot, fingerprint: fingerprint(snapshot) };
}

async function main() {
  const before = await loadState();
  const apply = process.argv.includes(APPLY);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", fingerprint: before.fingerprint, invoicesToVoid: before.targets.length, avonInvoices: before.targets.filter((target) => target.invoice.billingAccount.family.centerId === AVON_ID).length, duplicateInvoices: DUPLICATE_IDS.length, centsToRemove: before.targets.reduce((sum, target) => sum + target.invoice.totalCents, 0), refunds: 0 }, null, 2));
  if (!apply) return;
  const reviewed = process.argv.find((value) => value.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length);
  invariant(reviewed === before.fingerprint, "Apply requires the exact current dry-run fingerprint.");
  const actor = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true, email: true } });
  invariant(actor, "Billing audit actor was not found.");
  const appliedAt = new Date();

  for (const target of before.targets) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findUniqueOrThrow({ where: { id: target.invoice.id }, include: { ledgerEntries: { select: { amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, family: { select: { id: true, centerId: true } } } } } });
      invariant(current.status === PaymentStatus.OPEN && current.ledgerEntries.every((entry) => !entry.paymentId), `${current.number} changed before reconciliation.`);
      const reversalCents = invoiceLedgerBalanceCents(current.ledgerEntries);
      invariant(reversalCents === current.totalCents, `${current.number} is no longer exactly reversible.`);
      const updated = await tx.invoice.updateMany({ where: { id: current.id, status: PaymentStatus.OPEN }, data: { status: PaymentStatus.VOID, customFields: { ...object(current.customFields), voidedAt: appliedAt.toISOString(), voidedByUserId: actor.id, voidedByEmail: actor.email, voidReason: target.reason, reconciliationFingerprint: before.fingerprint } as Prisma.InputJsonObject } });
      invariant(updated.count === 1, `${current.number} changed during reconciliation.`);
      const account = await tx.billingAccount.update({ where: { id: current.billingAccount.id }, data: { balanceCents: { decrement: reversalCents } }, select: { balanceCents: true } });
      const ledger = await tx.ledgerEntry.create({ data: { billingAccountId: current.billingAccount.id, invoiceId: current.id, type: "invoice_void", description: `Voided ${current.number}: ${target.reason}`, amountCents: -reversalCents, balanceAfterCents: account.balanceCents, sourceSystem: "bee_suite_manual", externalId: `invoice-void:${current.id}`, metadata: { reason: target.reason, reconciliationFingerprint: before.fingerprint } } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, centerId: current.billingAccount.family.centerId, userId: actor.id, action: "billing.invoice.w36_reconciled", resource: "Invoice", resourceId: current.id, metadata: { familyId: current.billingAccount.family.id, invoiceNumber: current.number, amountCents: reversalCents, reason: target.reason, ledgerEntryId: ledger.id, reconciliationFingerprint: before.fingerprint } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }
  const after = await prisma.invoice.findMany({ where: { id: { in: before.targets.map((target) => target.invoice.id) } }, select: { id: true, status: true } });
  invariant(after.length === before.targets.length && after.every((invoice) => invoice.status === PaymentStatus.VOID), "Not every reviewed invoice is void.");
  console.log(JSON.stringify({ ok: true, voided: after.length, centsRemoved: before.targets.reduce((sum, target) => sum + target.invoice.totalCents, 0), refunds: 0 }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
