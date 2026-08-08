import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PaymentStatus } from "@prisma/client";

loadEnvConfig(process.env.BEE_RECOVERY_ENV_DIR || process.cwd());

async function main() {
const [
  { createBillingInvoiceForFamily },
  { stripeSchoolBillingApproval },
  { billingDedupeKey, normalizeBillingCadence, weeklyTuitionChargeDateForPeriod },
  { currentlyEnrolledChildWhere },
  { prisma },
  { normalizeTuitionCredits, totalTuitionCreditsCents, tuitionInvoiceItems },
] = await Promise.all([
  import("@/lib/billing-invoices"),
  import("@/lib/stripe-billing-approval"),
  import("@/lib/billing-workflows"),
  import("@/lib/enrollment-status"),
  import("@/lib/prisma"),
  import("@/lib/tuition-credits"),
]);

const CONCURRENCY = 5;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function argumentValue(name: string) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  return argument ? argument.slice(name.length + 1).trim() : "";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const period = argumentValue("--period").toUpperCase();
const apply = process.argv.includes("--apply");
const confirmedRecovery = process.argv.includes("--confirm-missing-weekly-tuition-recovery");
const confirmedFingerprint = argumentValue("--confirm-fingerprint").toLowerCase();

if (!/^20\d{2}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(period)) {
  throw new Error("Pass an explicit weekly period such as --period=2026-W33.");
}
if (apply && (!confirmedRecovery || !confirmedFingerprint)) {
  throw new Error("Apply requires --confirm-missing-weekly-tuition-recovery and --confirm-fingerprint=<dry-run fingerprint>.");
}

const assignedChildren = await prisma.child.findMany({
  where: {
    ...currentlyEnrolledChildWhere(),
    customFields: { path: ["tuitionBillingEnabled"], equals: true },
    family: { is: { centerId: { not: null } } },
  },
  orderBy: [{ family: { centerId: "asc" } }, { family: { name: "asc" } }, { fullName: "asc" }],
  take: 1500,
  select: {
    id: true,
    familyId: true,
    fullName: true,
    customFields: true,
    family: {
      select: {
        name: true,
        centerId: true,
      },
    },
  },
});

const centerIds = Array.from(new Set(assignedChildren.map((child) => child.family.centerId).filter((value): value is string => Boolean(value))));
const centers = await prisma.center.findMany({
  where: { id: { in: centerIds }, status: { not: "closed" } },
  select: { id: true, name: true, customFields: true },
});
const centerEligibility = centers.map((center) => {
  const fields = jsonRecord(center.customFields);
  const billingApproval = stripeSchoolBillingApproval({ customFields: fields, centerName: center.name });
  const approved = billingApproval.approved
    && fields.livePaymentsEnabled === true
    && fields.tuitionBillingEnabled === true;
  return { center, approved, blockingReason: approved ? null : billingApproval.blockingReason || "School live-payment or tuition billing approval is not active." };
});
const centerNamesById = new Map(centerEligibility.filter((item) => item.approved).map(({ center }) => [center.id, center.name]));

const planIds = Array.from(new Set(assignedChildren.map((child) => clean(jsonRecord(child.customFields).tuitionPlanId)).filter(Boolean)));
const plans = planIds.length
  ? await prisma.tuitionPlan.findMany({ where: { id: { in: planIds } } })
  : [];
const plansById = new Map(plans.map((plan) => [plan.id, plan]));

const existingInvoices = await prisma.invoice.findMany({
  where: {
    status: { not: PaymentStatus.VOID },
    AND: [
      { customFields: { path: ["billingPeriod"], equals: period } },
      { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
    ],
  },
  select: { id: true, customFields: true },
  take: 5000,
});
const coveredChildIds = new Set(existingInvoices.map((invoice) => clean(jsonRecord(invoice.customFields).childId)).filter(Boolean));

const invalidCreditAssignments: Array<{ center: string; family: string; child: string }> = [];
const targets = assignedChildren.flatMap((child) => {
  const fields = jsonRecord(child.customFields);
  const planId = clean(fields.tuitionPlanId);
  const plan = plansById.get(planId);
  const centerName = child.family.centerId ? centerNamesById.get(child.family.centerId) : undefined;
  if (!plan || !child.family.centerId || !centerName || plan.centerId !== child.family.centerId || plan.amountCents <= 0) return [];
  const cadence = normalizeBillingCadence(fields.tuitionBillingCadence ?? plan.cadence ?? fields.tuitionPlanCadence);
  if (cadence !== "weekly") return [];
  const startsPeriod = clean(fields.tuitionBillingStartsPeriod);
  if (startsPeriod && startsPeriod > period) return [];
  if (coveredChildIds.has(child.id)) return [];

  const tuitionCredits = normalizeTuitionCredits(fields.tuitionCredits);
  const tuitionCreditsTotalCents = totalTuitionCreditsCents(tuitionCredits);
  if (tuitionCreditsTotalCents >= plan.amountCents) {
    invalidCreditAssignments.push({ center: centerName, family: child.family.name, child: child.fullName });
    return [];
  }
  const description = clean(fields.tuitionBillingDescription) || plan.name || clean(fields.tuitionPlanName) || "Tuition";
  const lineDescription = `${description} - ${child.fullName}`;
  const dueDate = weeklyTuitionChargeDateForPeriod(period);
  const dedupeKey = billingDedupeKey({
    familyId: child.familyId,
    chargeSource: "tuitionPlan",
    sourceId: plan.id,
    billingPeriod: period,
    batchTarget: "recurring-child",
    childIds: [child.id],
  });
  const items = tuitionInvoiceItems({ description: lineDescription, grossAmountCents: plan.amountCents, credits: tuitionCredits });
  return [{
    centerId: child.family.centerId,
    centerName,
    familyId: child.familyId,
    familyName: child.family.name,
    childId: child.id,
    childName: child.fullName,
    planId: plan.id,
    planName: plan.name,
    amountCents: plan.amountCents,
    startsPeriod,
    period,
    dueDate,
    tuitionCredits,
    tuitionCreditsTotalCents,
    description: lineDescription,
    items,
    dedupeKey,
  }];
});

const manifest = targets.map((target) => ({
  centerId: target.centerId,
  familyId: target.familyId,
  childId: target.childId,
  planId: target.planId,
  amountCents: target.amountCents,
  startsPeriod: target.startsPeriod,
  period: target.period,
  dueDate: target.dueDate.toISOString(),
  tuitionCredits: target.tuitionCredits,
  dedupeKey: target.dedupeKey,
}));
const manifestFingerprint = fingerprint(manifest);
const bySchool = Array.from(targets.reduce((summary, target) => {
  const current = summary.get(target.centerName) ?? { invoices: 0, totalCents: 0 };
  current.invoices += 1;
  current.totalCents += target.items.reduce((total, item) => total + item.amountCents, 0);
  summary.set(target.centerName, current);
  return summary;
}, new Map<string, { invoices: number; totalCents: number }>()).entries()).map(([school, summary]) => ({ school, ...summary }));

console.log(JSON.stringify({
  ok: true,
  mode: apply ? "apply" : "dry-run",
  period,
  manifestFingerprint,
  targetInvoices: targets.length,
  targetTotalCents: bySchool.reduce((total, school) => total + school.totalCents, 0),
  bySchool,
  excludedSchools: centerEligibility
    .filter((item) => !item.approved)
    .map(({ center, blockingReason }) => ({ centerId: center.id, school: center.name, blockingReason })),
  excludedInvalidCreditAssignments: invalidCreditAssignments,
}, null, 2));

if (!apply) {
  await prisma.$disconnect();
  process.exit(0);
}
if (confirmedFingerprint !== manifestFingerprint) {
  await prisma.$disconnect();
  throw new Error(`Manifest fingerprint changed. Expected ${confirmedFingerprint}; current ${manifestFingerprint}. Run dry-run again.`);
}

const createdInvoiceIds: string[] = [];
let skipped = 0;
const failures: Array<{ center: string; family: string; child: string; error: string }> = [];

for (let index = 0; index < targets.length; index += CONCURRENCY) {
  const batch = targets.slice(index, index + CONCURRENCY);
  const results = await Promise.allSettled(batch.map((target) => prisma.$transaction(async (tx) => {
    const equivalentInvoice = await tx.invoice.findFirst({
      where: {
        status: { not: PaymentStatus.VOID },
        billingAccount: { familyId: target.familyId },
        AND: [
          { customFields: { path: ["billingPeriod"], equals: target.period } },
          { customFields: { path: ["childId"], equals: target.childId } },
          { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
        ],
      },
      select: { id: true },
    });
    if (equivalentInvoice) return { created: false as const, invoiceId: equivalentInvoice.id };

    const invoice = await createBillingInvoiceForFamily(tx, {
      familyId: target.familyId,
      dueDate: target.dueDate,
      description: target.description,
      items: target.items,
      customFields: {
        mode: "recurring",
        billingPeriod: target.period,
        billingCadence: "weekly",
        scheduledChargeDate: target.dueDate.toISOString(),
        centerId: target.centerId,
        childId: target.childId,
        childName: target.childName,
        chargeSource: "tuitionPlan",
        sourceId: target.planId,
        tuitionPlanName: target.planName,
        tuitionPlanCadence: "weekly",
        invoiceWeekCount: 1,
        coverageStartsPeriod: target.period,
        grossTuitionCents: target.amountCents,
        tuitionCredits: target.tuitionCredits,
        tuitionCreditsTotalCents: target.tuitionCreditsTotalCents,
        netTuitionCents: target.amountCents - target.tuitionCreditsTotalCents,
        dedupeKey: target.dedupeKey,
        autopaySuppressed: true,
        autopaySuppressedReason: "weekly_tuition_recovery_review",
        noPaymentSubmitted: true,
        recoveryManifestFingerprint: manifestFingerprint,
      },
    });
    return { created: invoice.created, invoiceId: invoice.invoice.id };
  }, { maxWait: 10_000, timeout: 30_000 })));

  for (const [batchIndex, result] of results.entries()) {
    const target = batch[batchIndex];
    if (result.status === "fulfilled") {
      if (result.value.created) createdInvoiceIds.push(result.value.invoiceId);
      else skipped += 1;
      continue;
    }
    failures.push({
      center: target.centerName,
      family: target.familyName,
      child: target.childName,
      error: result.reason instanceof Error ? result.reason.message.slice(0, 500) : "Invoice recovery failed.",
    });
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, created: createdInvoiceIds.length, skipped, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}

const [createdInvoices, createdLedgerEntries] = await Promise.all([
  prisma.invoice.findMany({
    where: { id: { in: createdInvoiceIds } },
    select: { id: true, customFields: true },
  }),
  prisma.ledgerEntry.count({ where: { invoiceId: { in: createdInvoiceIds } } }),
]);
const unsuppressed = createdInvoices.filter((invoice) => {
  const fields = jsonRecord(invoice.customFields);
  return fields.autopaySuppressed !== true || fields.noPaymentSubmitted !== true || clean(fields.recoveryManifestFingerprint) !== manifestFingerprint;
});
if (createdInvoices.length !== createdInvoiceIds.length || createdLedgerEntries < createdInvoiceIds.length || unsuppressed.length) {
  console.error(JSON.stringify({
    ok: false,
    expectedInvoices: createdInvoiceIds.length,
    foundInvoices: createdInvoices.length,
    createdLedgerEntries,
    unsuppressed: unsuppressed.length,
  }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  mode: "applied",
  period,
  manifestFingerprint,
  created: createdInvoiceIds.length,
  skipped,
  ledgerEntries: createdLedgerEntries,
  noPaymentSubmitted: true,
  autopaySuppressed: true,
}, null, 2));

await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
