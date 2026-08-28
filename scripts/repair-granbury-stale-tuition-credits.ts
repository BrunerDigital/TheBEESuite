import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY_FLAG = "--apply-reviewed-granbury-stale-credit-repair";
const FINGERPRINT_PREFIX = "--reviewed-fingerprint=";
const CENTER_NAME = "Kid City USA - Granbury";
const targets = new Map([
  ["cms6kugo800a66a6cgbo6m7uk", { planId: "cmse1pl4q005r6azg13z3ldiu", staleCreditsCents: 16_500 }],
  ["cms6ksynf005j6a6ctqmrcp49", { planId: "cmsq4v8dq000d6a5s7yszloqn", staleCreditsCents: 17_000 }],
]);

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadState(client: PrismaClient | Prisma.TransactionClient = prisma) {
  const center = await client.center.findFirst({
    where: { name: CENTER_NAME, status: "active" },
    select: { id: true, organization: { select: { tenantId: true } } },
  });
  if (!center) throw new Error("Active Granbury center was not found.");
  const children = await client.child.findMany({
    where: { id: { in: [...targets.keys()] }, family: { is: { centerId: center.id } } },
    orderBy: { id: "asc" },
    select: { id: true, updatedAt: true, customFields: true },
  });
  if (children.length !== targets.size) throw new Error(`Expected ${targets.size} guarded Granbury assignments; found ${children.length}.`);
  const rows = children.map((child) => {
    const expected = targets.get(child.id);
    if (!expected) throw new Error(`Unexpected child ${child.id}.`);
    const fields = object(child.customFields);
    if (fields.tuitionBillingEnabled !== true) throw new Error(`Tuition is no longer enabled for ${child.id}.`);
    if (fields.tuitionPlanId !== expected.planId) throw new Error(`Tuition plan changed for ${child.id}.`);
    if (fields.tuitionPlanAmountCents !== 5_000) throw new Error(`Tuition amount changed for ${child.id}.`);
    if (fields.tuitionCreditsTotalCents !== expected.staleCreditsCents) throw new Error(`Tuition credits changed for ${child.id}.`);
    return {
      id: child.id,
      updatedAt: child.updatedAt.toISOString(),
      planId: fields.tuitionPlanId,
      amountCents: fields.tuitionPlanAmountCents,
      creditsCents: fields.tuitionCreditsTotalCents,
      credits: fields.tuitionCredits ?? null,
      grossCents: fields.tuitionGrossAmountCents ?? null,
      netCents: fields.tuitionNetAmountCents ?? null,
    };
  });
  return { center, children, rows, fingerprint: fingerprint(rows) };
}

async function main() {
  const before = await loadState();
  const apply = process.argv.includes(APPLY_FLAG);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", school: CENTER_NAME, before: before.rows, fingerprint: before.fingerprint }, null, 2));
  if (!apply) return;
  const reviewedFingerprint = process.argv.find((argument) => argument.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length);
  if (!reviewedFingerprint || !/^[a-f0-9]{64}$/.test(reviewedFingerprint)) {
    throw new Error(`Apply requires ${FINGERPRINT_PREFIX}<64-character dry-run fingerprint>.`);
  }
  if (before.fingerprint !== reviewedFingerprint) {
    throw new Error("Granbury tuition assignments changed since the reviewed dry run; do not apply.");
  }

  await prisma.$transaction(async (tx) => {
    const locked = await loadState(tx);
    if (locked.fingerprint !== reviewedFingerprint) throw new Error("Granbury tuition assignments changed after review; rerun the dry run.");
    const repairedAt = new Date().toISOString();
    for (const child of locked.children) {
      const fields = object(child.customFields);
      const result = await tx.child.updateMany({
        where: { id: child.id, updatedAt: child.updatedAt },
        data: {
          customFields: {
            ...fields,
            tuitionCredits: [],
            tuitionCreditsTotalCents: 0,
            tuitionGrossAmountCents: 5_000,
            tuitionNetAmountCents: 5_000,
            tuitionBillingUpdatedAt: repairedAt,
            tuitionBillingUpdatedBy: "urgent stale-credit reconciliation 2026-08-28",
          } as Prisma.InputJsonObject,
        },
      });
      if (result.count !== 1) throw new Error(`Granbury assignment ${child.id} changed during repair.`);
      await tx.auditLog.create({
        data: {
          tenantId: locked.center.organization.tenantId,
          centerId: locked.center.id,
          action: "billing.tuition_assignment.stale_credits_reconciled",
          resource: "Child",
          resourceId: child.id,
          metadata: {
            priorCreditsCents: targets.get(child.id)?.staleCreditsCents,
            retainedWeeklyTuitionCents: 5_000,
            planId: targets.get(child.id)?.planId,
            source: "reviewed audit history 2026-08-06 and 2026-08-12",
            invoicesCreated: false,
            paymentsChanged: false,
            fingerprint: reviewedFingerprint,
          },
        },
      });
    }
  });

  const after = await prisma.child.findMany({
    where: { id: { in: [...targets.keys()] } },
    orderBy: { id: "asc" },
    select: { id: true, customFields: true },
  });
  console.log(JSON.stringify({
    ok: true,
    after: after.map((child) => {
      const fields = object(child.customFields);
      return { id: child.id, planId: fields.tuitionPlanId, amountCents: fields.tuitionPlanAmountCents, creditsCents: fields.tuitionCreditsTotalCents, netCents: fields.tuitionNetAmountCents };
    }),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
