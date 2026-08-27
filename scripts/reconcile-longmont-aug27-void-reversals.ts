import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessCenter, canManageBilling } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const TENANT_ID = "cmp4evl4v00006arspz79fggn";
const APPLY = "--apply";
const CONFIRM = "--confirm-longmont-aug27-void-reversals";
const targets = new Map<string, readonly [familyId: string, requestedSurname: string, amountCents: number]>([
  ["INV-20260813-15E30F82", ["cmq9wfv0o00awk10adwcdx9l3", "Calvo", 44000]],
  ["INV-20260813-701F9FD2", ["cmq9wg0ur00d0k10al9q5snf8", "Castillo", 28925]],
  ["INV-20260813-BECC71EC", ["cms99o47f000e6awsu2q6ehnm", "Chum", 44000]],
  ["INV-20260813-6FBF7246", ["cmq9wkdlm01suk10aqge0ir5u", "Rose", 41000]],
  ["INV-20260813-0BDB8A39", ["cmq9wkdlm01suk10aqge0ir5u", "Rose", 21600]],
  ["INV-20260813-77D2A504", ["cms99o3au00066aws9025bjxt", "Wenzl", 39500]],
  ["INV-20260813-00A1CB42", ["cms99o3au00066aws9025bjxt", "Wenzl", 43000]],
  ["INV-20260813-24C21C00", ["cmq9wi9jk013vk10ao41q0wxb", "Keane", 38500]],
  ["INV-20260813-652522B6", ["cmq9wi9jk013vk10ao41q0wxb", "Keane", 14400]],
  ["INV-20260813-FC038B3F", ["cmq9wjq1w01ljk10avz4j9qia", "Pastrana", 15000]],
  ["INV-20260813-EF3F2FAC", ["cmq9wi453011tk10ajbv1xl3m", "Jensen", 37500]],
  ["INV-20260813-0BEA7F6D", ["cmq9wive701b0k10a780tj3xs", "Maclean", 7200]],
  ["INV-20260813-76B67FC0", ["cmq9wjl2x01k3k10atrk7g0sc", "Ortiz", 35000]],
  ["INV-20260813-6A0255AC", ["cms99o3or00096awsxm3x77xs", "Yancy", 39500]],
]);

function object(value: Prisma.JsonValue | null) { return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {}; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])); return value; }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function externalId(id: string) { return `invoice-reinstatement:${id}:longmont-2026-08-27-request`; }

async function load(db: Prisma.TransactionClient | typeof prisma) {
  const invoices = await db.invoice.findMany({ where: { number: { in: [...targets.keys()] } }, orderBy: { number: "asc" }, select: {
    id: true, number: true, status: true, totalCents: true, customFields: true,
    billingAccount: { select: { id: true, balanceCents: true, family: { select: { id: true, name: true, centerId: true } }, payments: { orderBy: { paidAt: "asc" }, select: { id: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true } }, invoices: { select: { id: true, status: true, customFields: true } } } },
    ledgerEntries: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true, amountCents: true, balanceAfterCents: true, paymentId: true, sourceSystem: true, externalId: true } },
  } });
  invariant(invoices.length === targets.size, `Expected ${targets.size} exact invoices; found ${invoices.length}.`);
  for (const invoice of invoices) {
    const expected = targets.get(invoice.number)!;
    const fields = object(invoice.customFields);
    invariant(invoice.billingAccount.family.id === expected[0], `${invoice.number} moved to a different family than the reviewed ${expected[1]} target.`);
    invariant(invoice.totalCents === expected[2], `${invoice.number} amount changed.`);
    invariant(invoice.billingAccount.family.centerId === CENTER_ID, `${invoice.number} moved outside Longmont.`);
    invariant(fields.billingPeriod === "2026-W34" && fields.voidReason === "Longmont August 13 duplicate billing run rollback.", `${invoice.number} is not the requested August 14 void.`);
    const restore = invoice.ledgerEntries.filter((entry) => entry.externalId === externalId(invoice.id));
    const net = invoice.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
    invariant((invoice.status === PaymentStatus.VOID && restore.length === 0 && net === 0) || (invoice.status !== PaymentStatus.VOID && restore.length === 1 && net === invoice.totalCents), `${invoice.number} is outside the guarded before/after state.`);
    invariant(invoice.ledgerEntries.every((entry) => !entry.paymentId), `${invoice.number} has invoice-linked payment activity.`);
    const childId = String(fields.childId || "");
    invariant(!invoice.billingAccount.invoices.some((other) => other.id !== invoice.id && other.status !== PaymentStatus.VOID && object(other.customFields).billingPeriod === "2026-W34" && object(other.customFields).childId === childId), `${invoice.number} has another active W34 invoice.`);
  }
  const state = invoices.map((invoice) => ({ id: invoice.id, number: invoice.number, status: invoice.status, totalCents: invoice.totalCents, accountId: invoice.billingAccount.id, balanceCents: invoice.billingAccount.balanceCents, family: invoice.billingAccount.family, ledgerEntries: invoice.ledgerEntries, payments: invoice.billingAccount.payments }));
  return { invoices, state, fingerprint: hash(state) };
}

async function main() {
  const before = await load(prisma);
  const pending = before.invoices.filter((invoice) => invoice.status === PaymentStatus.VOID);
  console.log(JSON.stringify({ mode: process.argv.includes(APPLY) ? "apply" : "dry-run", fingerprint: before.fingerprint, invoiceCount: before.invoices.length, familyCount: new Set(before.invoices.map((i) => i.billingAccount.family.id)).size, centsToRestore: pending.reduce((s, i) => s + i.totalCents, 0), before: before.state.map((i) => ({ family: i.family.name, invoice: i.number, amountCents: i.totalCents, status: i.status, balanceCents: i.balanceCents, postedPayments: i.payments.filter((p) => p.status === PaymentStatus.PAID).length })) }, null, 2));
  if (!process.argv.includes(APPLY)) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(process.argv.includes(`--confirm-fingerprint=${before.fingerprint}`), "Apply fingerprint is missing or stale.");
  const accessAsOf = new Date();
  const actor = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: {
    id: true, tenantId: true, isActive: true, role: true,
    staffProfile: { select: { centerId: true } },
    accessGrants: { where: { tenantId: TENANT_ID, isActive: true, AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: accessAsOf } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: accessAsOf } }] },
    ] }, select: { tenantId: true, centerId: true, scopeType: true } },
  } });
  invariant(actor?.isActive && actor.tenantId === TENANT_ID, "Audit actor is unavailable or outside the Kid City tenant.");
  const directCenterGrant = actor.accessGrants.some((grant) => grant.scopeType === "CENTER" && grant.centerId === CENTER_ID);
  const actorCenterIds = actor.staffProfile?.centerId === CENTER_ID || directCenterGrant ? [CENTER_ID] : [];
  const actorScope = {
    role: actor.role,
    accessScope: actor.role === UserRole.PLATFORM_OWNER
      ? "platform" as const
      : actor.role === UserRole.BRAND_ADMIN || actor.role === UserRole.REGIONAL_MANAGER
        ? "tenant" as const
        : actor.accessGrants.some((grant) => grant.scopeType === "TENANT" && grant.tenantId === TENANT_ID)
          ? "tenant" as const
          : actorCenterIds.length ? "scoped" as const : "none" as const,
    centerIds: actorCenterIds,
  };
  invariant(canManageBilling(actor) && canAccessCenter(actorScope, CENTER_ID), "Audit actor no longer has active Longmont billing access.");
  await prisma.$transaction(async (tx) => {
    const ids = before.invoices.map((i) => i.id).sort();
    const accountIds = [...new Set(before.invoices.map((i) => i.billingAccount.id))].sort();
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" IN (${Prisma.join(accountIds)}) ORDER BY "id" FOR UPDATE`);
    const locked = await load(tx); invariant(locked.fingerprint === before.fingerprint, "Longmont state changed after review.");
    const expectedBalances = new Map(locked.invoices.map((invoice) => [invoice.billingAccount.id, invoice.billingAccount.balanceCents]));
    for (const invoice of locked.invoices.filter((item) => item.status === PaymentStatus.VOID)) {
      const prior = expectedBalances.get(invoice.billingAccount.id)!;
      const account = await tx.billingAccount.update({ where: { id: invoice.billingAccount.id }, data: { balanceCents: { increment: invoice.totalCents } }, select: { balanceCents: true } });
      invariant(account.balanceCents === prior + invoice.totalCents, `${invoice.number} balance changed concurrently.`);
      expectedBalances.set(invoice.billingAccount.id, account.balanceCents);
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: PaymentStatus.OPEN, customFields: { ...object(invoice.customFields), incorrectVoidRestoredAt: new Date().toISOString(), incorrectVoidRestoredByUserId: actor.id, incorrectVoidRestorationReason: "Kayleen Stratton confirmed the August 13 tuition was legitimate and requested reversal of the August 14 void." } } });
      const ledger = await tx.ledgerEntry.create({ data: { billingAccountId: invoice.billingAccount.id, invoiceId: invoice.id, type: "invoice_reinstatement", description: `Restored ${invoice.number}: reversed incorrect August 14 tuition void`, amountCents: invoice.totalCents, balanceAfterCents: account.balanceCents, sourceSystem: "bee_suite_guarded_remediation", externalId: externalId(invoice.id), metadata: { requestedBy: "kayleen@kidcityusa.com", sourceEmailSubject: "Adjustments needed to Longmont accounts", paymentsPreserved: true, noExternalChargeOrRefund: true } } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, centerId: CENTER_ID, userId: actor.id, action: "billing.invoice.reinstated_incorrect_void", resource: "Invoice", resourceId: invoice.id, metadata: { familyId: invoice.billingAccount.family.id, invoiceNumber: invoice.number, amountCents: invoice.totalCents, ledgerEntryId: ledger.id, sourceEmailSubject: "Adjustments needed to Longmont accounts" } } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  const after = await load(prisma);
  invariant(after.invoices.every((invoice) => invoice.status === PaymentStatus.OPEN), "Not all requested invoices are open after restoration.");
  console.log(JSON.stringify({ ok: true, verificationFingerprint: after.fingerprint, after: after.state.map((i) => ({ family: i.family.name, invoice: i.number, status: i.status, balanceCents: i.balanceCents, paymentsPreserved: JSON.stringify(i.payments) === JSON.stringify(before.state.find((b) => b.id === i.id)?.payments) })) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
