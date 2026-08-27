import "./load-env";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";

const APPLY = process.argv.includes("--apply");
const ACKNOWLEDGE = process.argv.includes("--acknowledge-zero-balance-account-creation");
const FINGERPRINT_PREFIX = "--confirm-fingerprint=";
function fields(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function fingerprint(rows: Array<{ familyId: string; centerId: string; tenantId: string }>) {
  return createHash("sha256")
    .update(rows.map((row) => `${row.tenantId}|${row.centerId}|${row.familyId}`).sort().join("\n"))
    .digest("hex");
}

async function buildPlan(db: Pick<Prisma.TransactionClient, "center" | "family"> = prisma) {
  const centers = await db.center.findMany({
    where: { status: "active" },
    select: { id: true, name: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  const eligible = centers.filter((center) => {
    const custom = fields(center.customFields);
    return custom.livePaymentsEnabled === true
      && custom.tuitionBillingEnabled === true
      && stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name }).approved;
  });
  const centerById = new Map(eligible.map((center) => [center.id, center]));
  const families = await db.family.findMany({
    where: {
      centerId: { in: eligible.map((center) => center.id) },
      billingAccount: null,
      children: { some: currentlyEnrolledChildWhere() },
    },
    select: { id: true, centerId: true },
    orderBy: { id: "asc" },
  });
  const rows = families.flatMap((family) => {
    if (!family.centerId) return [];
    const center = centerById.get(family.centerId);
    return center ? [{ familyId: family.id, centerId: center.id, tenantId: center.organization.tenantId, school: center.name }] : [];
  });
  return { rows, fingerprint: fingerprint(rows) };
}

async function main() {
  const plan = await buildPlan();
  const supplied = process.argv.find((arg) => arg.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length).trim();
  if (!APPLY) {
    console.log(JSON.stringify({
      mode: "read_only_preview",
      missingAccounts: plan.rows.length,
      fingerprint: plan.fingerprint,
      targets: plan.rows.map((row) => ({ school: row.school, familyIdHash: hash(row.familyId) })),
      effects: { accountsCreatedAtZeroBalance: plan.rows.length, invoicesCreated: 0, paymentsCreated: 0, chargesCreated: 0, invitationsSent: 0, autopayChanged: 0 },
    }, null, 2));
    return;
  }
  if (!ACKNOWLEDGE || !supplied || supplied !== plan.fingerprint) {
    throw new Error(`Apply requires --acknowledge-zero-balance-account-creation ${FINGERPRINT_PREFIX}${plan.fingerprint}.`);
  }
  const applied = await prisma.$transaction(async (tx) => {
    const fresh = await buildPlan(tx);
    if (fresh.fingerprint !== plan.fingerprint) throw new Error("Target set changed inside the transaction; rerun preview.");
    for (const row of fresh.rows) {
      const account = await tx.billingAccount.create({ data: { familyId: row.familyId, balanceCents: 0, autopayPlaceholder: false } });
      await tx.auditLog.create({
        data: {
          tenantId: row.tenantId,
          centerId: row.centerId,
          action: "billing.current_family.account_prepared",
          resource: "BillingAccount",
          resourceId: account.id,
          metadata: { familyIdHash: hash(row.familyId), reason: "parent_payment_readiness", balanceCents: 0, chargesCreated: 0, invitationsSent: 0 },
        },
      });
    }
    return fresh.rows.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
  console.log(JSON.stringify({ mode: "apply", applied, fingerprint: plan.fingerprint, balanceCents: 0, invoicesCreated: 0, paymentsCreated: 0, chargesCreated: 0, invitationsSent: 0, autopayChanged: 0 }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
