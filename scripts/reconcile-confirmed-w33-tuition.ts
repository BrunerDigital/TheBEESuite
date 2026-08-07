import "./load-env";
import { createHash, randomUUID } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import {
  billingDedupeKey,
  WEEKLY_TUITION_AUTOBILL_DAY,
  weeklyTuitionChargeDateForPeriod,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";
import { tuitionInvoiceItems, type TuitionCredit } from "@/lib/tuition-credits";

const PERIOD = "2026-W33";
const APPLY = "--apply";
const CONFIRM = "--confirm-reviewed-w33-tuition";
const FINGERPRINT = "--confirm-fingerprint=";

type Target = {
  schoolId: string;
  schoolName: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  planId: string;
  expectedPlanAmountCents: number;
  credits: TuitionCredit[];
  fundingType: "family" | "voucher";
  evidence: string;
  expectedExistingPlanId: string | null;
};

const targets: Target[] = [
  {
    schoolId: "cmp4ew8yo001e6alw32jneo3w",
    schoolName: "Kid City USA - Beach Blvd",
    familyId: "cmrw6cwpe002fl704wq6ejmht",
    familyName: "Chastian",
    childId: "cms87louu001m6aq0ntcsdfpv",
    childName: "Bailynn Chastain",
    planId: "cms6c6v840003lb04xs04u1e0",
    expectedPlanAmountCents: 30000,
    credits: [{ category: "agency_discount", amountCents: 23170 }],
    fundingType: "family",
    evidence: "Beach Blvd contract billing reconciliation and assignment audit: $300.00 gross less $231.70 agency discount = $68.30 family responsibility.",
    expectedExistingPlanId: "cmsi0svx500036ao48m6fvbe0",
  },
  {
    schoolId: "cmp4ew8yo001e6alw32jneo3w",
    schoolName: "Kid City USA - Beach Blvd",
    familyId: "cmrw6cxr2002ol704qac7xjae",
    familyName: "Davis",
    childId: "cms87m2uv002n6aq0p2zudf47",
    childName: "ZyMir Davis",
    planId: "cmrvyiiem001djr04pazdseel",
    expectedPlanAmountCents: 28000,
    credits: [{ category: "agency_discount", amountCents: 19335 }],
    fundingType: "family",
    evidence: "Beach Blvd contract billing reconciliation and assignment audit: $280.00 gross less $193.35 agency discount = $86.65 family responsibility.",
    expectedExistingPlanId: "cmsi0sw6n00056ao4a85mogeu",
  },
  {
    schoolId: "cmp4ew6f3000a6alwmz62n7w2",
    schoolName: "Kid City USA - Longmont",
    familyId: "cmq9wf7ma003jk10a1trpta97",
    familyName: "Baeverstad, Mercedes Household",
    childId: "cmq9wf7zo003nk10ak4o12zas",
    childName: "Lauren E Baeverstad",
    planId: "cmse26hp0007j6amsnw5zpyeh",
    expectedPlanAmountCents: 44000,
    credits: [],
    fundingType: "family",
    evidence: "Longmont director Reply All on 2026-08-07: $440.00/week.",
    expectedExistingPlanId: null,
  },
  {
    schoolId: "cmp4ewhge00526alw7t62nwg4",
    schoolName: "Kid City USA - Granbury",
    familyId: "cms6lg2fe01ip6a6cuzeb8vpu",
    familyName: "Snyder Household*",
    childId: "cms6lg7ai01j56a6c2v1diej9",
    childName: "McKenzie Snyder",
    planId: "cmsgildpp000pl1047zlrwzw1",
    expectedPlanAmountCents: 0,
    credits: [],
    fundingType: "voucher",
    evidence: "Granbury director Reply All on 2026-08-07: listed children have $0 subsidy responsibility and the family amount is billed to the youngest child.",
    expectedExistingPlanId: null,
  },
];

const longmontZeroChildren = [
  ["cmq9wgol400k0k10axcw70raf", "Dobler, Madeline Household", "cmq9wgpc900k8k10at3hiuk97", "Molly Dobler"],
  ["cmq9wl6vn023mk10ait3ine4l", "Martinez, Monica Household", "cmq9wl7pu023wk10ah4m8xhrj", "Anaya Trejo"],
  ["cmq9wl6vn023mk10ait3ine4l", "Martinez, Monica Household", "cmq9wl86p023yk10anprpkcvr", "Armias Trejo"],
  ["cmq9wl6vn023mk10ait3ine4l", "Martinez, Monica Household", "cmq9wl792023sk10awt0wiysy", "Emilio James Torres"],
  ["cmq9wl6vn023mk10ait3ine4l", "Martinez, Monica Household", "cmq9wl8nn0240k10avw6xk6rf", "Millie Trejo"],
  ["cms99o2wr00036awsfrp0mazf", "Zito V Family", "cms99o31f00056awsmr2lyy1d", "Zito V, Sebastian"],
  ["cms99o2wr00036awsfrp0mazf", "Zito V Family", "cms99o65i000x6awswso6c6nd", "Zito, Raegan"],
] as const;

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function inputObject(value: Prisma.JsonObject) {
  return value as Prisma.InputJsonObject;
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function arg(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

async function ensureLongmontZeroPlan(apply: boolean) {
  const existing = await prisma.tuitionPlan.findFirst({
    where: { centerId: "cmp4ew6f3000a6alwmz62n7w2", name: "Staff discount - $0 family responsibility", amountCents: 0, cadence: "weekly" },
    orderBy: { id: "asc" },
  });
  if (existing || !apply) return existing;
  return prisma.tuitionPlan.create({
    data: {
      centerId: "cmp4ew6f3000a6alwmz62n7w2",
      name: "Staff discount - $0 family responsibility",
      ageGroup: "All programs",
      cadence: "weekly",
      amountCents: 0,
    },
  });
}

async function loadState() {
  const zeroPlan = await ensureLongmontZeroPlan(false);
  const effectiveTargets: Target[] = [
    ...targets,
    ...longmontZeroChildren.map(([familyId, familyName, childId, childName]) => ({
      schoolId: "cmp4ew6f3000a6alwmz62n7w2",
      schoolName: "Kid City USA - Longmont",
      familyId,
      familyName,
      childId,
      childName,
      planId: zeroPlan?.id ?? "pending-longmont-zero-plan",
      expectedPlanAmountCents: 0,
      credits: [],
      fundingType: "voucher" as const,
      evidence: "Longmont director Reply All on 2026-08-07: $0 staff discount.",
      expectedExistingPlanId: null,
    })),
  ];

  const schools = await prisma.center.findMany({ where: { id: { in: [...new Set(effectiveTargets.map((item) => item.schoolId))] } }, select: { id: true, name: true, status: true, customFields: true } });
  const plans = await prisma.tuitionPlan.findMany({ where: { id: { in: effectiveTargets.map((item) => item.planId).filter((id) => id !== "pending-longmont-zero-plan") } } });
  const children = await prisma.child.findMany({
    where: { id: { in: effectiveTargets.map((item) => item.childId) } },
    select: { id: true, familyId: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true, family: { select: { name: true, centerId: true } } },
  });
  const familyIds = [...new Set(effectiveTargets.map((item) => item.familyId))];
  const invoices = await prisma.invoice.findMany({
    where: { billingAccount: { familyId: { in: familyIds } }, status: { not: PaymentStatus.VOID }, customFields: { path: ["billingPeriod"], equals: PERIOD } },
    select: { id: true, number: true, totalCents: true, billingAccount: { select: { familyId: true } }, customFields: true },
  });

  for (const target of effectiveTargets) {
    const school = schools.find((item) => item.id === target.schoolId);
    invariant(school?.name === target.schoolName && school.status !== "closed", `${target.schoolName} center identity or status changed.`);
    const schoolFields = object(school.customFields);
    invariant(schoolFields.tuitionBillingEnabled === true && schoolFields.livePaymentsEnabled === true && schoolFields.stripeBillingApproved === true, `${target.schoolName} billing approval is not active.`);
    const child = children.find((item) => item.id === target.childId);
    invariant(child && child.familyId === target.familyId && child.family.name === target.familyName && child.family.centerId === target.schoolId, `${target.childName} family or school identity changed.`);
    invariant(["enrolled", "active", "current"].includes(child.enrollmentStatus) && child.classroomId, `${target.childName} is no longer a current classroom-assigned child.`);
    const fields = object(child.customFields);
    if (target.expectedExistingPlanId) {
      invariant(fields.tuitionPlanId === target.expectedExistingPlanId || fields.tuitionPlanId === target.planId, `${target.childName} assignment changed after review.`);
    } else {
      invariant(fields.tuitionBillingEnabled !== true || fields.tuitionPlanId === target.planId, `${target.childName} gained a different enabled assignment.`);
    }
    if (target.planId !== "pending-longmont-zero-plan") {
      const plan = plans.find((item) => item.id === target.planId);
      invariant(plan && plan.centerId === target.schoolId && plan.amountCents === target.expectedPlanAmountCents && plan.cadence === "weekly", `${target.childName} target plan changed.`);
    }
    const existingW33 = invoices.filter((invoice) => {
      const invoiceFields = object(invoice.customFields);
      return invoice.billingAccount.familyId === target.familyId && invoiceFields.childId === target.childId && invoiceFields.chargeSource === "tuitionPlan";
    });
    if (target.fundingType === "family" && existingW33.length) {
      const expectedNet = target.expectedPlanAmountCents - target.credits.reduce((sum, item) => sum + item.amountCents, 0);
      invariant(existingW33.length === 1 && existingW33[0].totalCents === expectedNet && object(existingW33[0].customFields).sourceId === target.planId, `${target.childName} already has a conflicting non-void W33 tuition invoice.`);
    }
  }

  const state = {
    period: PERIOD,
    zeroPlanId: zeroPlan?.id ?? null,
    targets: effectiveTargets.map((target) => {
      const child = children.find((item) => item.id === target.childId)!;
      return { ...target, currentCustomFields: child.customFields };
    }),
    existingInvoices: invoices.map((invoice) => ({ id: invoice.id, number: invoice.number, totalCents: invoice.totalCents, familyId: invoice.billingAccount.familyId, customFields: invoice.customFields })),
  };
  return { state, fingerprint: fingerprint(state), effectiveTargets };
}

async function applyTarget(target: Target, user: { id: string; tenantId: string }, resolvedPlanId: string) {
  const plan = await prisma.tuitionPlan.findUnique({ where: { id: resolvedPlanId } });
  invariant(plan && plan.centerId === target.schoolId && plan.amountCents === target.expectedPlanAmountCents, `${target.childName} resolved plan is invalid.`);
  const netAmountCents = plan.amountCents - target.credits.reduce((sum, credit) => sum + credit.amountCents, 0);
  invariant(target.fundingType === "voucher" ? netAmountCents === 0 : netAmountCents > 0, `${target.childName} net amount is invalid.`);

  const current = await prisma.child.findUnique({ where: { id: target.childId }, select: { customFields: true } });
  invariant(current, `${target.childName} disappeared before apply.`);
  const currentFields = object(current.customFields);
  const assignmentExact = currentFields.tuitionBillingEnabled === true
    && currentFields.tuitionPlanId === plan.id
    && currentFields.tuitionPlanAmountCents === plan.amountCents
    && currentFields.tuitionCreditsTotalCents === plan.amountCents - netAmountCents
    && currentFields.tuitionNetAmountCents === netAmountCents
    && currentFields.tuitionFundingType === target.fundingType
    && currentFields.tuitionBillingStartsPeriod === PERIOD;
  const existingInvoice = target.fundingType === "family" ? await prisma.invoice.findFirst({
    where: {
      billingAccount: { familyId: target.familyId },
      status: { not: PaymentStatus.VOID },
      customFields: { path: ["dedupeKey"], equals: billingDedupeKey({ familyId: target.familyId, chargeSource: "tuitionPlan", sourceId: plan.id, billingPeriod: PERIOD, batchTarget: "recurring-child", childIds: [target.childId] }) },
    },
    select: { totalCents: true },
  }) : null;
  if (assignmentExact && (target.fundingType === "voucher" || existingInvoice?.totalCents === netAmountCents)) return false;

  await prisma.$transaction(async (tx) => {
    const child = await tx.child.findUnique({ where: { id: target.childId }, select: { customFields: true } });
    invariant(child, `${target.childName} disappeared during apply.`);
    const fields = object(child.customFields);
    const updatedAt = new Date().toISOString();
    const updatedFields = inputObject({
      ...fields,
      tuitionBillingEnabled: true,
      tuitionPlanId: plan.id,
      tuitionPlanName: plan.name,
      tuitionPlanAgeGroup: plan.ageGroup,
      tuitionPlanCadence: "weekly",
      tuitionBillingCadence: "weekly",
      tuitionPlanAmountCents: plan.amountCents,
      tuitionCredits: target.credits,
      tuitionCreditsTotalCents: plan.amountCents - netAmountCents,
      tuitionNetAmountCents: netAmountCents,
      tuitionFundingType: target.fundingType,
      tuitionAutobillEligible: target.fundingType === "family",
      tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
      tuitionBillingStartsPeriod: PERIOD,
      tuitionBillingDescription: plan.name,
      tuitionBillingUpdatedAt: updatedAt,
      tuitionBillingUpdatedBy: "Brenden Bruner - confirmed W33 tuition reconciliation 2026-08-07",
      tuitionRateEvidence: { source: "director_or_audit_confirmation", confirmedAt: updatedAt, note: target.evidence },
    });
    await tx.child.update({ where: { id: target.childId }, data: { customFields: updatedFields } });

    const account = await tx.billingAccount.upsert({
      where: { familyId: target.familyId },
      update: {},
      create: { familyId: target.familyId, balanceCents: 0, autopayPlaceholder: false },
      select: { id: true, customFields: true },
    });
    if (target.fundingType === "family") {
      const accountFields = object(account.customFields);
      await tx.billingAccount.update({
        where: { id: account.id },
        data: { customFields: inputObject({
          ...accountFields,
          tuitionAutobillEnabled: true,
          tuitionAutobillCadence: "weekly",
          tuitionAutobillBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
          tuitionAutobillStartsPeriod: PERIOD,
          tuitionAutobillPlanId: plan.id,
          tuitionAutobillPlanName: plan.name,
          tuitionAutobillAmountCents: plan.amountCents,
          tuitionAutobillUpdatedAt: updatedAt,
          tuitionAutobillUpdatedBy: "Brenden Bruner - confirmed W33 tuition reconciliation 2026-08-07",
        }) },
      });
      const dedupeKey = billingDedupeKey({
        familyId: target.familyId,
        chargeSource: "tuitionPlan",
        sourceId: plan.id,
        billingPeriod: PERIOD,
        batchTarget: "recurring-child",
        childIds: [target.childId],
      });
      const description = `${plan.name} - ${target.childName}`;
      const invoice = await createBillingInvoiceForFamily(tx, {
        familyId: target.familyId,
        dueDate: weeklyTuitionChargeDateForPeriod(PERIOD),
        description,
        items: tuitionInvoiceItems({ description, grossAmountCents: plan.amountCents, credits: target.credits }),
        customFields: {
          mode: "recurring",
          billingPeriod: PERIOD,
          billingCadence: "weekly",
          scheduledChargeDate: weeklyTuitionChargeDateForPeriod(PERIOD).toISOString(),
          centerId: target.schoolId,
          childId: target.childId,
          childName: target.childName,
          chargeSource: "tuitionPlan",
          sourceId: plan.id,
          tuitionPlanName: plan.name,
          tuitionPlanCadence: "weekly",
          invoiceWeekCount: 1,
          coverageStartsPeriod: PERIOD,
          grossTuitionCents: plan.amountCents,
          tuitionCredits: target.credits,
          tuitionCreditsTotalCents: plan.amountCents - netAmountCents,
          netTuitionCents: netAmountCents,
          dedupeKey,
          noPaymentSubmitted: true,
          reconciliationEvidence: target.evidence,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          centerId: target.schoolId,
          userId: user.id,
          action: invoice.created ? "billing.invoice.created" : "billing.invoice.skipped_duplicate",
          resource: "Invoice",
          resourceId: invoice.invoice.id,
          metadata: { familyId: target.familyId, childId: target.childId, amountCents: invoice.invoice.totalCents, billingPeriod: PERIOD, noPaymentSubmitted: true, evidence: target.evidence },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        centerId: target.schoolId,
        userId: user.id,
        action: "billing.tuition_assignment.confirmed_reconciliation",
        resource: "Child",
        resourceId: target.childId,
        metadata: { familyId: target.familyId, childId: target.childId, planId: plan.id, amountCents: plan.amountCents, netAmountCents, fundingType: target.fundingType, billingPeriod: PERIOD, evidence: target.evidence },
      },
    });
  }, { maxWait: 10000, timeout: 30000 });
  return true;
}

async function main() {
  const apply = process.argv.includes(APPLY);
  invariant(!apply || process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expectedFingerprint = arg(FINGERPRINT);
  invariant(!apply || expectedFingerprint, `Apply requires ${FINGERPRINT}<value>.`);
  const before = await loadState();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", fingerprint: before.fingerprint, targets: before.effectiveTargets.map(({ childName, familyName, schoolName, expectedPlanAmountCents, credits, fundingType, evidence }) => ({ schoolName, familyName, childName, grossAmountCents: expectedPlanAmountCents, creditsCents: credits.reduce((sum, item) => sum + item.amountCents, 0), netAmountCents: expectedPlanAmountCents - credits.reduce((sum, item) => sum + item.amountCents, 0), fundingType, willCreateInvoice: fundingType === "family", evidence })) }, null, 2));
  if (!apply) return;
  invariant(expectedFingerprint === before.fingerprint, "Reviewed state changed; rerun the dry run and review the new fingerprint.");

  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true } });
  invariant(user, "Brenden application user was not found for audit attribution.");
  const zeroPlan = await ensureLongmontZeroPlan(true);
  invariant(zeroPlan, "Longmont $0 staff plan could not be resolved.");
  let applied = 0;
  for (const target of before.effectiveTargets) {
    if (await applyTarget(target, user, target.planId === "pending-longmont-zero-plan" ? zeroPlan.id : target.planId)) applied += 1;
  }
  console.log(JSON.stringify({ ok: true, applied, alreadyReconciled: before.effectiveTargets.length - applied, invoiceTargets: before.effectiveTargets.filter((item) => item.fundingType === "family").length, noPaymentsSubmitted: true, runId: randomUUID() }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
