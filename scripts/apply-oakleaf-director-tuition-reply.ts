import "./load-env";
import { createHash, randomUUID } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import {
  billingDedupeKey,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
  WEEKLY_TUITION_AUTOBILL_DAY,
  weeklyTuitionChargeDateForPeriod,
} from "@/lib/billing-workflows";
import { currentlyEnrolledStatusValues, isCurrentlyEnrolledStatus } from "@/lib/enrollment-status";
import {
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { verifyStripeConnectAccountBinding } from "@/lib/stripe-connect-setup";
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const PERIOD = "2026-W33";
const APPLY = "--apply";
const CONFIRM = "--confirm-oakleaf-director-reply";
const FINGERPRINT = "--confirm-fingerprint=";
const DIRECTOR_EVIDENCE = "Oakleaf director Tayler Baxter Reply All on 2026-08-07";

type WithdrawTarget = {
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
};

type TuitionTarget = WithdrawTarget & {
  amountCents: number;
  planName: string;
  ageGroup: string;
  evidence: string;
};

const withdrawnTargets: WithdrawTarget[] = [
  { familyId: "cms6lqiwf01ve6a6cn8nweqyw", familyName: "Anna Finesilver Family", childId: "cms6lqjy901vk6a6c8mnkqor2", childName: "Evelyn parish" },
  { familyId: "cms6lqiwf01ve6a6cn8nweqyw", familyName: "Anna Finesilver Family", childId: "cms88jqbz00tc6aq0854witzv", childName: "Korbin Parish" },
  { familyId: "cms67jdpo00736a40ammo0i7k", familyName: "Caylah Courtenay Family", childId: "cms67jfaa007d6a40s0jgnl0b", childName: "Noir Harris" },
  { familyId: "cms67k98m00aq6a40b4gyc6mu", familyName: "Delon Jenkins Family", childId: "cms67kak100ay6a40978g3wo5", childName: "Charli mickens" },
  { familyId: "cms67hp9i000f6a40y53cbxgt", familyName: "Mikevia Richardson Family", childId: "cms67hqli000p6a403y8ckhh4", childName: "Ariah Anderson" },
  { familyId: "cms67hp9i000f6a40y53cbxgt", familyName: "Mikevia Richardson Family", childId: "cms67txac00sl6a40lgixw399", childName: "Gregory Anderson" },
];

const tuitionTargets: TuitionTarget[] = [
  {
    familyId: "cms67hmf500026a40nlc403ix",
    familyName: "Genesis Vicente Rio Family",
    childId: "cms67hnh8000a6a40rjbzlemp",
    childName: "Mya Acevedo Vicente",
    amountCents: 6_987,
    planName: "Employee child - VPK Wrap",
    ageGroup: "VPK Wrap",
    evidence: `${DIRECTOR_EVIDENCE}: employee child, $69.87 weekly VPK Wrap.`,
  },
  {
    familyId: "cms67lm9200fo6a40cf5fbio8",
    familyName: "Nyasia Smith Family",
    childId: "cms67uj5c00tb6a40hqyek05l",
    childName: "Aiden A Taylor",
    amountCents: 9_750,
    planName: "Employee child - School age",
    ageGroup: "School Age",
    evidence: `${DIRECTOR_EVIDENCE}: employee child, $97.50 weekly school age.`,
  },
];

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function inputObject(value: Prisma.JsonObject) {
  return value as Prisma.InputJsonObject;
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function argument(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function stateFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function exactWithdrawn(child: { enrollmentStatus: string; classroomId: string | null; customFields: Prisma.JsonValue | null }) {
  const fields = object(child.customFields);
  return child.enrollmentStatus === "withdrawn"
    && child.classroomId === null
    && fields.tuitionBillingEnabled === false
    && fields.tuitionAutobillEligible === false;
}

function paymentSnapshot(families: Array<{ billingAccount: { payments: Array<{ id: string; status: PaymentStatus; amountCents: number; provider: string; externalIdPlaceholder: string | null }> } | null }>) {
  return families.flatMap((family) => family.billingAccount?.payments ?? [])
    .map((payment) => ({ ...payment }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function verifyOakleafStripe(center: {
  name: string;
  customFields: Prisma.JsonValue | null;
  organization: { tenantId: string };
}) {
  const accountId = readStripeConnectedAccountId(center.customFields);
  invariant(accountId, `${CENTER_NAME} has no connected Stripe account.`);
  const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: center.organization.tenantId });
  invariant(retrieved.ok && retrieved.account, `${CENTER_NAME} Stripe account is unreachable.`);
  invariant(verifyStripeConnectAccountBinding(accountId, retrieved.account.id).ok, `${CENTER_NAME} Stripe account binding changed.`);
  invariant(stripeConnectReadinessFromSnapshot(retrieved.account).status === "ready", `${CENTER_NAME} Stripe account is not ready.`);
  const banks = await listStripeConnectedAccountPayoutBanks({ accountId, tenantId: center.organization.tenantId });
  invariant(banks.ok && banks.defaultBank?.last4, `${CENTER_NAME} has no confirmed default payout bank.`);
  return accountId;
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const allTargets = [...withdrawnTargets, ...tuitionTargets];
  const familyIds = [...new Set(allTargets.map((target) => target.familyId))];
  const center = await client.center.findUnique({
    where: { id: CENTER_ID },
    select: { id: true, name: true, status: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  invariant(center?.name === CENTER_NAME && center.status === "active", "Oakleaf center identity or status changed.");
  const centerFields = object(center.customFields);
  invariant(
    stripeSchoolBillingApproval({ customFields: centerFields, centerName: center.name }).approved
      && centerFields.livePaymentsEnabled === true
      && centerFields.tuitionBillingEnabled === true,
    "Oakleaf billing approval is no longer active.",
  );

  const families = await client.family.findMany({
    where: { id: { in: familyIds }, centerId: CENTER_ID },
    select: {
      id: true,
      name: true,
      children: {
        select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true },
        orderBy: { id: "asc" },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          invoices: {
            select: { id: true, number: true, status: true, totalCents: true, customFields: true },
            orderBy: { id: "asc" },
          },
          payments: {
            select: { id: true, status: true, amountCents: true, provider: true, externalIdPlaceholder: true },
            orderBy: { id: "asc" },
          },
          ledgerEntries: {
            where: { balanceAfterCents: { not: null } },
            select: { id: true, balanceAfterCents: true },
            orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  invariant(families.length === familyIds.length, `Expected ${familyIds.length} Oakleaf target families; found ${families.length}.`);

  const plans = await client.tuitionPlan.findMany({
    where: { centerId: CENTER_ID, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: { in: tuitionTargets.map((target) => target.amountCents) } },
    select: { id: true, name: true, ageGroup: true, cadence: true, amountCents: true },
    orderBy: { id: "asc" },
  });

  for (const target of allTargets) {
    const family = families.find((candidate) => candidate.id === target.familyId);
    invariant(family?.name === target.familyName, `${target.familyName} identity changed.`);
    invariant(family.billingAccount, `${target.familyName} billing account is missing.`);
    const child = family.children.find((candidate) => candidate.id === target.childId);
    invariant(child?.fullName === target.childName, `${target.childName} identity changed.`);
  }

  for (const target of withdrawnTargets) {
    const family = families.find((candidate) => candidate.id === target.familyId)!;
    const child = family.children.find((candidate) => candidate.id === target.childId)!;
    invariant(
      exactWithdrawn(child) || (isCurrentlyEnrolledStatus(child.enrollmentStatus) && Boolean(child.classroomId)),
      `${target.childName} is neither currently enrolled nor in the exact withdrawn state.`,
    );
    const activeW33 = family.billingAccount!.invoices.filter((invoice) => {
      const fields = object(invoice.customFields);
      return invoice.status !== PaymentStatus.VOID
        && fields.childId === child.id
        && fields.chargeSource === "tuitionPlan"
        && (fields.billingPeriod === PERIOD || fields.coverageStartsPeriod === PERIOD);
    });
    invariant(activeW33.length === 0, `${target.childName} now has a non-void ${PERIOD} tuition invoice that requires separate review.`);
  }

  for (const target of tuitionTargets) {
    const family = families.find((candidate) => candidate.id === target.familyId)!;
    const child = family.children.find((candidate) => candidate.id === target.childId)!;
    invariant(isCurrentlyEnrolledStatus(child.enrollmentStatus) && child.classroomId, `${target.childName} is no longer a current classroom-assigned child.`);
    const fields = object(child.customFields);
    const assignedPlan = plans.find((plan) => plan.id === fields.tuitionPlanId);
    const assignmentExact = fields.tuitionBillingEnabled === true
      && assignedPlan?.amountCents === target.amountCents
      && assignedPlan.cadence === WEEKLY_TUITION_AUTOBILL_CADENCE
      && fields.tuitionPlanAmountCents === target.amountCents
      && fields.tuitionBillingStartsPeriod === PERIOD;
    invariant(fields.tuitionBillingEnabled !== true || assignmentExact, `${target.childName} gained a different enabled tuition assignment.`);
    const activeDrafts = family.billingAccount!.payments.filter((payment) => payment.status === PaymentStatus.DRAFT);
    invariant(activeDrafts.length === 0, `${target.familyName} has an active payment checkout that must be reconciled before adding tuition.`);
    const childW33 = family.billingAccount!.invoices.filter((invoice) => {
      const invoiceFields = object(invoice.customFields);
      return invoice.status !== PaymentStatus.VOID
        && invoiceFields.childId === child.id
        && invoiceFields.chargeSource === "tuitionPlan"
        && (invoiceFields.billingPeriod === PERIOD || invoiceFields.coverageStartsPeriod === PERIOD);
    });
    invariant(
      childW33.length === 0 || (childW33.length === 1 && assignmentExact && childW33[0].totalCents === target.amountCents && object(childW33[0].customFields).sourceId === assignedPlan?.id),
      `${target.childName} has a conflicting ${PERIOD} tuition invoice.`,
    );
  }

  const snapshot = {
    center: {
      id: center.id,
      name: center.name,
      status: center.status,
      tenantId: center.organization.tenantId,
      stripeAccountId: readStripeConnectedAccountId(center.customFields),
      billingApproval: stripeSchoolBillingApproval({ customFields: centerFields, centerName: center.name }),
      livePaymentsEnabled: centerFields.livePaymentsEnabled,
      tuitionBillingEnabled: centerFields.tuitionBillingEnabled,
    },
    period: PERIOD,
    withdrawnTargets,
    tuitionTargets,
    plans,
    families,
  };
  return { center, families, plans, snapshot, fingerprint: stateFingerprint(snapshot) };
}

async function applyWithdrawal(target: WithdrawTarget, user: { id: string; tenantId: string }) {
  return prisma.$transaction(async (tx) => {
    const child = await tx.child.findUnique({
      where: { id: target.childId },
      select: {
        id: true,
        familyId: true,
        fullName: true,
        enrollmentStatus: true,
        classroomId: true,
        customFields: true,
        family: { select: { centerId: true, name: true, billingAccount: { select: { id: true, balanceCents: true, customFields: true } } } },
      },
    });
    invariant(
      child && child.familyId === target.familyId && child.fullName === target.childName
        && child.family.centerId === CENTER_ID && child.family.name === target.familyName,
      `${target.childName} identity changed during apply.`,
    );
    if (exactWithdrawn(child)) return { changed: false, balanceCents: child.family.billingAccount?.balanceCents ?? null };
    invariant(isCurrentlyEnrolledStatus(child.enrollmentStatus) && child.classroomId, `${target.childName} enrollment changed during apply.`);
    const activeW33 = await tx.invoice.count({
      where: {
        billingAccount: { familyId: target.familyId },
        status: { not: PaymentStatus.VOID },
        AND: [
          { customFields: { path: ["childId"], equals: target.childId } },
          { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
          { OR: [
            { customFields: { path: ["billingPeriod"], equals: PERIOD } },
            { customFields: { path: ["coverageStartsPeriod"], equals: PERIOD } },
          ] },
        ],
      },
    });
    invariant(activeW33 === 0, `${target.childName} gained a ${PERIOD} invoice before withdrawal.`);
    const updatedAt = new Date().toISOString();
    await tx.child.update({
      where: { id: target.childId },
      data: {
        enrollmentStatus: "withdrawn",
        classroomId: null,
        customFields: inputObject({
          ...object(child.customFields),
          tuitionBillingEnabled: false,
          tuitionAutobillEligible: false,
          tuitionBillingHoldReason: "Director confirmed withdrawn for the school year; no recurring tuition.",
          tuitionBillingUpdatedAt: updatedAt,
          tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf director reply 2026-08-07",
          enrollmentStatusUpdatedAt: updatedAt,
          enrollmentStatusUpdatedBy: "Brenden Bruner - Oakleaf director reply 2026-08-07",
          enrollmentStatusEvidence: {
            source: "director_reply",
            confirmedAt: updatedAt,
            note: `${DIRECTOR_EVIDENCE}: withdrawn for the school year.`,
          },
        }),
      },
    });
    const remainingEnabledCurrentChildren = await tx.child.count({
      where: {
        familyId: target.familyId,
        enrollmentStatus: { in: currentlyEnrolledStatusValues() },
        classroomId: { not: null },
        customFields: { path: ["tuitionBillingEnabled"], equals: true },
      },
    });
    if (remainingEnabledCurrentChildren === 0 && child.family.billingAccount) {
      await tx.billingAccount.update({
        where: { id: child.family.billingAccount.id },
        data: { customFields: inputObject({
          ...object(child.family.billingAccount.customFields),
          tuitionAutobillEnabled: false,
          tuitionAutobillUpdatedAt: updatedAt,
          tuitionAutobillUpdatedBy: "Brenden Bruner - Oakleaf director reply 2026-08-07",
        }) },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        centerId: CENTER_ID,
        userId: user.id,
        action: "child.enrollment.director_withdrawal_confirmed",
        resource: "Child",
        resourceId: target.childId,
        metadata: {
          familyId: target.familyId,
          childId: target.childId,
          previousEnrollmentStatus: child.enrollmentStatus,
          enrollmentStatus: "withdrawn",
          classroomCleared: true,
          recurringTuitionDisabled: true,
          balancesChanged: false,
          invoicesChanged: false,
          paymentsChanged: false,
          evidence: DIRECTOR_EVIDENCE,
        },
      },
    });
    return { changed: true, balanceCents: child.family.billingAccount?.balanceCents ?? null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

async function applyTuition(target: TuitionTarget, user: { id: string; tenantId: string }, stripeAccountId: string) {
  return prisma.$transaction(async (tx) => {
    const center = await tx.center.findUnique({ where: { id: CENTER_ID }, select: { customFields: true } });
    invariant(center && readStripeConnectedAccountId(center.customFields) === stripeAccountId, "Oakleaf Stripe binding changed during apply.");
    const child = await tx.child.findUnique({
      where: { id: target.childId },
      select: {
        id: true,
        familyId: true,
        fullName: true,
        enrollmentStatus: true,
        classroomId: true,
        customFields: true,
        family: { select: { centerId: true, name: true, billingAccount: { select: { id: true, balanceCents: true, customFields: true } } } },
      },
    });
    invariant(
      child && child.familyId === target.familyId && child.fullName === target.childName
        && child.family.centerId === CENTER_ID && child.family.name === target.familyName,
      `${target.childName} identity changed during apply.`,
    );
    invariant(isCurrentlyEnrolledStatus(child.enrollmentStatus) && child.classroomId, `${target.childName} is no longer currently enrolled.`);
    const activeDrafts = await tx.payment.count({ where: { billingAccount: { familyId: target.familyId }, status: PaymentStatus.DRAFT } });
    invariant(activeDrafts === 0, `${target.familyName} gained an active payment checkout.`);

    let matchingPlans = await tx.tuitionPlan.findMany({
      where: { centerId: CENTER_ID, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: target.amountCents, ageGroup: target.ageGroup },
      orderBy: { id: "asc" },
    });
    invariant(matchingPlans.length <= 1, `${target.childName} has multiple matching Oakleaf tuition plans.`);
    let plan = matchingPlans[0];
    let planCreated = false;
    if (!plan) {
      plan = await tx.tuitionPlan.create({
        data: {
          centerId: CENTER_ID,
          name: target.planName,
          ageGroup: target.ageGroup,
          cadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
          amountCents: target.amountCents,
        },
      });
      planCreated = true;
      matchingPlans = [plan];
    }

    const childFields = object(child.customFields);
    const assignmentExact = childFields.tuitionBillingEnabled === true
      && childFields.tuitionPlanId === plan.id
      && childFields.tuitionPlanAmountCents === target.amountCents
      && childFields.tuitionBillingStartsPeriod === PERIOD;
    invariant(childFields.tuitionBillingEnabled !== true || assignmentExact, `${target.childName} gained a different assignment during apply.`);
    const existingInvoices = await tx.invoice.findMany({
      where: {
        billingAccount: { familyId: target.familyId },
        status: { not: PaymentStatus.VOID },
        AND: [
          { customFields: { path: ["childId"], equals: target.childId } },
          { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
          { OR: [
            { customFields: { path: ["billingPeriod"], equals: PERIOD } },
            { customFields: { path: ["coverageStartsPeriod"], equals: PERIOD } },
          ] },
        ],
      },
      select: { id: true, number: true, totalCents: true, customFields: true },
    });
    invariant(
      existingInvoices.length === 0 || (existingInvoices.length === 1 && existingInvoices[0].totalCents === target.amountCents && object(existingInvoices[0].customFields).sourceId === plan.id),
      `${target.childName} gained a conflicting ${PERIOD} invoice during apply.`,
    );

    const updatedAt = new Date().toISOString();
    if (!assignmentExact) {
      await tx.child.update({
        where: { id: target.childId },
        data: { customFields: inputObject({
          ...childFields,
          tuitionBillingEnabled: true,
          tuitionPlanId: plan.id,
          tuitionPlanName: plan.name,
          tuitionPlanAgeGroup: plan.ageGroup,
          tuitionPlanCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
          tuitionBillingCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
          tuitionPlanAmountCents: target.amountCents,
          tuitionCredits: [],
          tuitionCreditsTotalCents: 0,
          tuitionNetAmountCents: target.amountCents,
          tuitionFundingType: "family",
          tuitionAutobillEligible: true,
          tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
          tuitionBillingStartsPeriod: PERIOD,
          tuitionBillingDescription: plan.name,
          tuitionBillingUpdatedAt: updatedAt,
          tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf director reply 2026-08-07",
          tuitionRateEvidence: {
            source: "director_reply",
            confirmedAt: updatedAt,
            note: target.evidence,
          },
        }) },
      });
    }

    const account = await tx.billingAccount.upsert({
      where: { familyId: target.familyId },
      update: {},
      create: { familyId: target.familyId, balanceCents: 0, autopayPlaceholder: false },
      select: { id: true, balanceCents: true, customFields: true },
    });
    await tx.billingAccount.update({
      where: { id: account.id },
      data: { customFields: inputObject({
        ...object(account.customFields),
        tuitionAutobillEnabled: true,
        tuitionAutobillCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
        tuitionAutobillBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
        tuitionAutobillStartsPeriod: PERIOD,
        tuitionAutobillPlanId: plan.id,
        tuitionAutobillPlanName: plan.name,
        tuitionAutobillAmountCents: target.amountCents,
        tuitionAutobillUpdatedAt: updatedAt,
        tuitionAutobillUpdatedBy: "Brenden Bruner - Oakleaf director reply 2026-08-07",
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
    const invoice = existingInvoices[0]
      ? { invoice: existingInvoices[0], created: false as const, totalCents: 0 }
      : await createBillingInvoiceForFamily(tx, {
        familyId: target.familyId,
        dueDate: weeklyTuitionChargeDateForPeriod(PERIOD),
        description,
        items: [{ description, amountCents: target.amountCents }],
        customFields: {
          mode: "recurring",
          billingPeriod: PERIOD,
          billingCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
          scheduledChargeDate: weeklyTuitionChargeDateForPeriod(PERIOD).toISOString(),
          centerId: CENTER_ID,
          childId: target.childId,
          childName: target.childName,
          chargeSource: "tuitionPlan",
          sourceId: plan.id,
          tuitionPlanName: plan.name,
          tuitionPlanCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
          invoiceWeekCount: 1,
          coverageStartsPeriod: PERIOD,
          grossTuitionCents: target.amountCents,
          tuitionCredits: [],
          tuitionCreditsTotalCents: 0,
          netTuitionCents: target.amountCents,
          dedupeKey,
          autopaySuppressed: true,
          autopaySuppressedReason: "confirmed_director_reply_recovery",
          noPaymentSubmitted: true,
          reconciliationEvidence: target.evidence,
        },
      });

    if (!assignmentExact) {
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          centerId: CENTER_ID,
          userId: user.id,
          action: "billing.tuition_assignment.director_confirmed",
          resource: "Child",
          resourceId: target.childId,
          metadata: {
            familyId: target.familyId,
            childId: target.childId,
            planId: plan.id,
            amountCents: target.amountCents,
            billingPeriod: PERIOD,
            evidence: target.evidence,
          },
        },
      });
    }
    if (invoice.created) {
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          centerId: CENTER_ID,
          userId: user.id,
          action: "billing.invoice.created_from_director_confirmation",
          resource: "Invoice",
          resourceId: invoice.invoice.id,
          metadata: {
            familyId: target.familyId,
            childId: target.childId,
            invoiceNumber: invoice.invoice.number,
            amountCents: target.amountCents,
            billingPeriod: PERIOD,
            noPaymentSubmitted: true,
            evidence: target.evidence,
          },
        },
      });
    }
    return {
      assignmentChanged: !assignmentExact,
      invoiceCreated: invoice.created,
      planCreated,
      planId: plan.id,
      invoiceNumber: invoice.invoice.number,
      balanceBeforeCents: account.balanceCents,
      balanceDeltaCents: invoice.totalCents,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

async function main() {
  const apply = process.argv.includes(APPLY);
  invariant(!apply || process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expectedFingerprint = argument(FINGERPRINT);
  invariant(!apply || expectedFingerprint, `Apply requires ${FINGERPRINT}<value>.`);

  const before = await loadState();
  const stripeAccountId = await verifyOakleafStripe(before.center);
  const withdrawalsToApply = withdrawnTargets.filter((target) => {
    const family = before.families.find((candidate) => candidate.id === target.familyId)!;
    return !exactWithdrawn(family.children.find((candidate) => candidate.id === target.childId)!);
  });
  const tuitionToApply = tuitionTargets.filter((target) => {
    const family = before.families.find((candidate) => candidate.id === target.familyId)!;
    const child = family.children.find((candidate) => candidate.id === target.childId)!;
    const fields = object(child.customFields);
    const plan = before.plans.find((candidate) => candidate.id === fields.tuitionPlanId);
    const assigned = fields.tuitionBillingEnabled === true
      && plan?.amountCents === target.amountCents
      && fields.tuitionPlanAmountCents === target.amountCents
      && fields.tuitionBillingStartsPeriod === PERIOD;
    const invoiced = family.billingAccount!.invoices.some((invoice) => {
      const invoiceFields = object(invoice.customFields);
      return invoice.status !== PaymentStatus.VOID
        && invoice.totalCents === target.amountCents
        && invoiceFields.childId === target.childId
        && invoiceFields.chargeSource === "tuitionPlan"
        && (invoiceFields.billingPeriod === PERIOD || invoiceFields.coverageStartsPeriod === PERIOD);
    });
    return !(assigned && invoiced);
  });

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    fingerprint: before.fingerprint,
    period: PERIOD,
    stripeReady: true,
    defaultPayoutBankConfirmed: true,
    currentState: {
      targetFamilies: before.families.length,
      targetChildren: withdrawnTargets.length + tuitionTargets.length,
      withdrawalsAlreadyExact: withdrawnTargets.length - withdrawalsToApply.length,
      tuitionAlreadyExact: tuitionTargets.length - tuitionToApply.length,
    },
    proposed: {
      withdrawals: withdrawalsToApply.map((target) => ({ family: target.familyName, child: target.childName, balanceChangeCents: 0 })),
      weeklyTuition: tuitionToApply.map((target) => ({ family: target.familyName, child: target.childName, amountCents: target.amountCents, period: PERIOD })),
      expectedInvoiceTotalCents: tuitionToApply.reduce((sum, target) => sum + target.amountCents, 0),
      paymentsToSubmit: 0,
    },
  }, null, 2));
  if (!apply) return;
  invariant(expectedFingerprint === before.fingerprint, "Oakleaf state changed; rerun the dry run and review the new fingerprint.");

  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true } });
  invariant(user && user.tenantId === before.center.organization.tenantId, "Brenden audit user or Oakleaf tenant attribution changed.");
  const beforePayments = paymentSnapshot(before.families);
  const beforeBalances = new Map(before.families.map((family) => [family.id, family.billingAccount!.balanceCents]));
  const withdrawalResults: Array<Awaited<ReturnType<typeof applyWithdrawal>>> = [];
  for (const target of withdrawnTargets) withdrawalResults.push(await applyWithdrawal(target, user));
  const tuitionResults: Array<Awaited<ReturnType<typeof applyTuition>>> = [];
  for (const target of tuitionTargets) tuitionResults.push(await applyTuition(target, user, stripeAccountId));

  const after = await loadState();
  invariant(
    JSON.stringify(stable(beforePayments)) === JSON.stringify(stable(paymentSnapshot(after.families))),
    "Oakleaf payment records changed during apply.",
  );
  for (const target of withdrawnTargets) {
    const family = after.families.find((candidate) => candidate.id === target.familyId)!;
    const child = family.children.find((candidate) => candidate.id === target.childId)!;
    invariant(exactWithdrawn(child), `${target.childName} was not fully withdrawn.`);
    invariant(family.billingAccount!.balanceCents === beforeBalances.get(target.familyId), `${target.familyName} balance changed during withdrawal.`);
  }
  for (const target of tuitionTargets) {
    const family = after.families.find((candidate) => candidate.id === target.familyId)!;
    const child = family.children.find((candidate) => candidate.id === target.childId)!;
    const fields = object(child.customFields);
    const plan = after.plans.find((candidate) => candidate.id === fields.tuitionPlanId);
    invariant(plan?.amountCents === target.amountCents && fields.tuitionBillingEnabled === true && fields.tuitionBillingStartsPeriod === PERIOD, `${target.childName} tuition assignment is not exact.`);
    const invoices = family.billingAccount!.invoices.filter((invoice) => {
      const invoiceFields = object(invoice.customFields);
      return invoice.status !== PaymentStatus.VOID
        && invoiceFields.childId === target.childId
        && invoiceFields.chargeSource === "tuitionPlan"
        && (invoiceFields.billingPeriod === PERIOD || invoiceFields.coverageStartsPeriod === PERIOD);
    });
    invariant(invoices.length === 1 && invoices[0].totalCents === target.amountCents, `${target.childName} does not have one exact ${PERIOD} invoice.`);
    const expectedDelta = tuitionResults[tuitionTargets.indexOf(target)].balanceDeltaCents;
    invariant(family.billingAccount!.balanceCents === beforeBalances.get(target.familyId)! + expectedDelta, `${target.familyName} balance did not change by the exact created invoice amount.`);
    invariant(family.billingAccount!.ledgerEntries[0]?.balanceAfterCents === family.billingAccount!.balanceCents, `${target.familyName} account and latest ledger balance disagree.`);
  }

  console.log(JSON.stringify({
    ok: true,
    runId: randomUUID(),
    fingerprint: before.fingerprint,
    withdrawalsApplied: withdrawalResults.filter((result) => result.changed).length,
    withdrawalsAlreadyExact: withdrawalResults.filter((result) => !result.changed).length,
    tuitionAssignmentsApplied: tuitionResults.filter((result) => result.assignmentChanged).length,
    tuitionInvoicesCreated: tuitionResults.filter((result) => result.invoiceCreated).length,
    tuitionPlansCreated: tuitionResults.filter((result) => result.planCreated).length,
    balanceIncreaseCents: tuitionResults.reduce((sum, result) => sum + result.balanceDeltaCents, 0),
    paymentsSubmitted: 0,
    paymentsChanged: 0,
    finalTuition: tuitionTargets.map((target, index) => ({
      family: target.familyName,
      child: target.childName,
      weeklyCents: target.amountCents,
      invoiceNumber: tuitionResults[index].invoiceNumber,
      finalBalanceCents: after.families.find((family) => family.id === target.familyId)!.billingAccount!.balanceCents,
    })),
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
