import "./load-env";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");
const ACKNOWLEDGE = process.argv.includes("--acknowledge-empty-account-removal");
const FINGERPRINT_PREFIX = "--confirm-fingerprint=";
const CREATE_ACTION = "billing.current_family.account_prepared";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function fingerprint(rows: Array<{ accountId: string; familyId: string; auditId: string }>) {
  return createHash("sha256")
    .update(rows.map((row) => `${row.accountId}|${row.familyId}|${row.auditId}`).sort().join("\n"))
    .digest("hex");
}

async function buildPlan(db: Pick<Prisma.TransactionClient, "auditLog" | "billingAccount"> = prisma) {
  const creationAudits = await db.auditLog.findMany({
    where: { action: CREATE_ACTION, resource: "BillingAccount", resourceId: { not: null } },
    select: { id: true, tenantId: true, centerId: true, resourceId: true },
    orderBy: { id: "asc" },
  });
  const accounts = await db.billingAccount.findMany({
    where: { id: { in: creationAudits.flatMap((audit) => audit.resourceId ? [audit.resourceId] : []) } },
    select: {
      id: true,
      familyId: true,
      balanceCents: true,
      autopayPlaceholder: true,
      ledgerSyncedAt: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      _count: { select: { invoices: true, payments: true, ledgerEntries: true } },
      family: { select: { children: { where: currentlyEnrolledChildWhere(), select: { id: true } } } },
    },
  });
  const auditByAccountId = new Map(creationAudits.flatMap((audit) => audit.resourceId ? [[audit.resourceId, audit] as const] : []));
  const rows = accounts.flatMap((account) => {
    const audit = auditByAccountId.get(account.id);
    const empty = account.balanceCents === 0
      && account.autopayPlaceholder === false
      && account.ledgerSyncedAt === null
      && account.sourceSystem === null
      && account.externalId === null
      && account.customFields === null
      && account._count.invoices === 0
      && account._count.payments === 0
      && account._count.ledgerEntries === 0;
    return audit && empty && account.family.children.length === 0
      ? [{ accountId: account.id, familyId: account.familyId, auditId: audit.id, tenantId: audit.tenantId, centerId: audit.centerId }]
      : [];
  });
  return { rows, fingerprint: fingerprint(rows) };
}

async function main() {
  const plan = await buildPlan();
  const supplied = process.argv.find((arg) => arg.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length).trim();
  if (!APPLY) {
    console.log(JSON.stringify({
      mode: "read_only_preview",
      removableAccounts: plan.rows.length,
      fingerprint: plan.fingerprint,
      accountHashes: plan.rows.map((row) => hash(row.accountId)),
      boundaries: { requiresOriginalRepairAudit: true, requiresEmptyAccount: true, requiresNoCurrentClassroomChild: true },
    }, null, 2));
    return;
  }
  if (!ACKNOWLEDGE || !supplied || supplied !== plan.fingerprint) {
    throw new Error(`Apply requires --acknowledge-empty-account-removal ${FINGERPRINT_PREFIX}${plan.fingerprint}.`);
  }
  const removed = await prisma.$transaction(async (tx) => {
    const fresh = await buildPlan(tx);
    if (fresh.fingerprint !== plan.fingerprint) throw new Error("Removal target set changed inside the transaction; rerun preview.");
    for (const row of fresh.rows) {
      await tx.billingAccount.delete({ where: { id: row.accountId } });
      await tx.auditLog.create({
        data: {
          tenantId: row.tenantId,
          centerId: row.centerId,
          action: "billing.incomplete_enrollment.empty_account_removed",
          resource: "Family",
          resourceId: row.familyId,
          metadata: { removedAccountHash: hash(row.accountId), sourceAuditId: row.auditId, invoices: 0, payments: 0, ledgerEntries: 0, balanceCents: 0 },
        },
      });
    }
    return fresh.rows.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
  console.log(JSON.stringify({ mode: "apply", removed, fingerprint: plan.fingerprint, invoicesRemoved: 0, paymentsRemoved: 0, ledgerEntriesRemoved: 0, balanceRemovedCents: 0 }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
