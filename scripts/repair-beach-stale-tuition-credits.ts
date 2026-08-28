import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHILD_ID = "cms87lkvi001c6aq0bf8w3vjh";
const FAMILY_ID = "cmrw6eheo00exl704xtb4ggjz";
const CENTER_ID = "cmp4ew8yo001e6alw32jneo3w";
const PLAN_ID = "cmsq4w6ie002d6a5ssxjk54m3";
const APPLY_FLAG = "--apply-reviewed-beach-stale-credit-repair";
const FINGERPRINT_PREFIX = "--reviewed-fingerprint=";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function state(client: PrismaClient | Prisma.TransactionClient = prisma) {
  const center = await client.center.findUnique({
    where: { id: CENTER_ID },
    select: { id: true, status: true, organization: { select: { tenantId: true } } },
  });
  if (!center || center.status !== "active") throw new Error("Active Beach Blvd center was not found.");
  const plan = await client.tuitionPlan.findUnique({
    where: { id: PLAN_ID },
    select: { id: true, centerId: true, amountCents: true, cadence: true },
  });
  if (!plan || plan.centerId !== CENTER_ID || plan.amountCents !== 2_000 || plan.cadence !== "weekly") {
    throw new Error("Beach Blvd tuition plan no longer matches the reviewed $20 weekly plan.");
  }
  const child = await client.child.findFirst({
    where: { id: CHILD_ID, familyId: FAMILY_ID, family: { is: { centerId: CENTER_ID } } },
    select: { id: true, familyId: true, updatedAt: true, customFields: true },
  });
  if (!child) throw new Error("Exact Beach Blvd child and family scope was not found.");
  const fields = object(child.customFields);
  if (fields.tuitionBillingEnabled !== true || fields.tuitionPlanId !== PLAN_ID || fields.tuitionPlanAmountCents !== 2_000) {
    throw new Error("Beach Blvd tuition assignment no longer matches the reviewed $20 plan.");
  }
  if (fields.tuitionCreditsTotalCents !== 25_000 || fields.tuitionNetAmountCents !== 2_000) {
    throw new Error("Beach Blvd stale-credit state no longer matches the reviewed evidence.");
  }
  const reviewed = {
    id: child.id,
    familyId: child.familyId,
    updatedAt: child.updatedAt.toISOString(),
    planId: fields.tuitionPlanId,
    amountCents: fields.tuitionPlanAmountCents,
    creditsCents: fields.tuitionCreditsTotalCents,
    credits: fields.tuitionCredits ?? null,
    netCents: fields.tuitionNetAmountCents,
    plan: { id: plan.id, centerId: plan.centerId, amountCents: plan.amountCents, cadence: plan.cadence },
  };
  return { center, child, fields, reviewed, fingerprint: createHash("sha256").update(JSON.stringify(reviewed)).digest("hex") };
}

async function main() {
  const before = await state();
  const apply = process.argv.includes(APPLY_FLAG);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", school: "Kid City USA - Beach Blvd", before: before.reviewed, fingerprint: before.fingerprint }, null, 2));
  if (!apply) return;
  const reviewedFingerprint = process.argv.find((argument) => argument.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length);
  if (!reviewedFingerprint || !/^[a-f0-9]{64}$/.test(reviewedFingerprint) || reviewedFingerprint !== before.fingerprint) {
    throw new Error("Apply requires the exact current dry-run fingerprint.");
  }
  await prisma.$transaction(async (tx) => {
    const locked = await state(tx);
    if (locked.fingerprint !== reviewedFingerprint) throw new Error("Beach Blvd assignment changed after review.");
    const result = await tx.child.updateMany({
      where: { id: CHILD_ID, familyId: FAMILY_ID, updatedAt: locked.child.updatedAt },
      data: { customFields: {
        ...locked.fields,
        tuitionCredits: [],
        tuitionCreditsTotalCents: 0,
        tuitionGrossAmountCents: 2_000,
        tuitionNetAmountCents: 2_000,
        tuitionBillingUpdatedAt: new Date().toISOString(),
        tuitionBillingUpdatedBy: "reviewed Beach Blvd stale-credit reconciliation 2026-08-28",
      } as Prisma.InputJsonObject },
    });
    if (result.count !== 1) throw new Error("Beach Blvd assignment changed during repair.");
    await tx.auditLog.create({ data: {
      tenantId: locked.center.organization.tenantId,
      centerId: CENTER_ID,
      action: "billing.tuition_assignment.stale_credits_reconciled",
      resource: "Child",
      resourceId: CHILD_ID,
      metadata: { priorCreditsCents: 25_000, retainedWeeklyTuitionCents: 2_000, planId: PLAN_ID, invoicesCreated: false, paymentsChanged: false, fingerprint: reviewedFingerprint },
    } });
  });
  const after = await prisma.child.findUnique({ where: { id: CHILD_ID }, select: { id: true, customFields: true } });
  const fields = object(after?.customFields);
  console.log(JSON.stringify({ ok: true, after: { id: after?.id, planId: fields.tuitionPlanId, amountCents: fields.tuitionPlanAmountCents, creditsCents: fields.tuitionCreditsTotalCents, netCents: fields.tuitionNetAmountCents } }, null, 2));
}

main().finally(() => prisma.$disconnect());
