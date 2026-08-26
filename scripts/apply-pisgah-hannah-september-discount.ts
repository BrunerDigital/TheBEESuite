import "./load-env";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-fingerprint";
const CENTER_ID = "cmp4ewg8w004k6alwid0bwiur";
const CENTER_NAME = "Kid City USA - Pisgah Forest";
const FAMILY_ID = "cms7g820e002m6a44ldfjt9rd";
const CHILD_ID = "cms7g82v7006s6a44lemwlrye";
const CHILD_NAME = 'Smith, Tyler "TJ"';
const ACCOUNT_ID = "cmsdircbm001a6adgjn2mqmr7";
const PLAN_NAME = "Barnett Monthly Tuition $185.00";
const PLAN_AMOUNT_CENTS = 18_500;
const EMPLOYEE_DISCOUNT_CENTS = 9_250;
const NET_AMOUNT_CENTS = 9_250;
const BILLING_START_PERIOD = "2026-09";
const BILLING_DAY = 1;
const REQUEST_THREAD_ID = "1a03559611f22e0d";
const RATE_SOURCE_MESSAGE_ID = "19fde5df6770a3ce";
const RATE_SOURCE_FILE = "Brenden Balance Spreadsheet.xlsx";
const UPDATED_BY = "system:pisgah-email-evidence-2026-08-24";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadState(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [center, child, account, plan, staffMatches] = await Promise.all([
    db.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, organization: { select: { tenantId: true } } } }),
    db.child.findUnique({ where: { id: CHILD_ID }, select: { id: true, familyId: true, fullName: true, ageGroup: true, enrollmentStatus: true, customFields: true, family: { select: { id: true, centerId: true, name: true } } } }),
    db.billingAccount.findUnique({ where: { id: ACCOUNT_ID }, select: { id: true, familyId: true, balanceCents: true, autopayPlaceholder: true, customFields: true, invoices: { select: { id: true, number: true, status: true, totalCents: true, customFields: true }, orderBy: { id: "asc" } }, payments: { select: { id: true, status: true, provider: true, amountCents: true }, orderBy: { id: "asc" } } } }),
    db.tuitionPlan.findFirst({ where: { centerId: CENTER_ID, name: PLAN_NAME }, select: { id: true, centerId: true, name: true, ageGroup: true, cadence: true, amountCents: true } }),
    db.staffProfile.findMany({ where: { centerId: CENTER_ID, user: { OR: [{ name: { contains: "Hannah", mode: "insensitive" } }, { email: { contains: "hannah", mode: "insensitive" } }] } }, select: { id: true, userId: true } }),
  ]);

  invariant(center?.name === CENTER_NAME, "Pisgah Forest center identity changed.");
  invariant(child?.familyId === FAMILY_ID && child.fullName === CHILD_NAME && child.family.centerId === CENTER_ID, "Tyler Smith family identity changed.");
  invariant(["enrolled", "active", "current"].includes(child.enrollmentStatus.toLowerCase()), "Tyler Smith is no longer currently enrolled.");
  invariant(account?.familyId === FAMILY_ID, "Barnett billing account identity changed.");
  invariant(!plan || (plan.centerId === CENTER_ID && plan.ageGroup === child.ageGroup && plan.cadence === "monthly" && plan.amountCents === PLAN_AMOUNT_CENTS), "An incompatible Pisgah Barnett tuition plan already exists.");

  return { center, child, account, plan, staffMatches };
}

function reviewedState(state: Awaited<ReturnType<typeof loadState>>) {
  return {
    centerId: state.center.id,
    familyId: state.child.familyId,
    child: { id: state.child.id, name: state.child.fullName, ageGroup: state.child.ageGroup, enrollmentStatus: state.child.enrollmentStatus, customFields: state.child.customFields },
    account: { id: state.account.id, balanceCents: state.account.balanceCents, autopayPlaceholder: state.account.autopayPlaceholder, customFields: state.account.customFields, invoices: state.account.invoices, payments: state.account.payments },
    plan: state.plan,
    staffProfileIds: state.staffMatches.map((staff) => staff.id).sort(),
  };
}

function assignmentApplied(state: Awaited<ReturnType<typeof loadState>>) {
  const fields = record(state.child.customFields);
  if (!state.plan || typeof fields.tuitionPlanId !== "string" || !fields.tuitionPlanId) return false;
  const credits = Array.isArray(fields.tuitionCredits) ? fields.tuitionCredits : [];
  const employeeCredit = credits.length === 1 ? record(credits[0] as Prisma.JsonValue) : {};
  return fields.tuitionBillingEnabled === true
    && fields.tuitionPlanId === state.plan.id
    && fields.tuitionPlanAmountCents === PLAN_AMOUNT_CENTS
    && fields.tuitionBillingCadence === "monthly"
    && fields.tuitionBillingDay === BILLING_DAY
    && fields.tuitionBillingStartsPeriod === BILLING_START_PERIOD
    && employeeCredit.category === "employee_discount"
    && employeeCredit.amountCents === EMPLOYEE_DISCOUNT_CENTS
    && Array.isArray(fields.tuitionAdditionalCharges)
    && fields.tuitionAdditionalCharges.length === 0
    && fields.tuitionGrossAmountCents === PLAN_AMOUNT_CENTS
    && fields.tuitionCreditsTotalCents === EMPLOYEE_DISCOUNT_CENTS
    && fields.tuitionNetAmountCents === NET_AMOUNT_CENTS;
}

async function main() {
  const before = await loadState();
  const reviewed = reviewedState(before);
  const planFingerprint = fingerprint(reviewed);
  const alreadyApplied = assignmentApplied(before);

  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({
      mode: "preview",
      alreadyApplied,
      planFingerprint,
      reviewed: {
        centerId: reviewed.centerId,
        familyId: reviewed.familyId,
        childId: reviewed.child.id,
        childName: reviewed.child.name,
        ageGroup: reviewed.child.ageGroup,
        enrollmentStatus: reviewed.child.enrollmentStatus,
        currentBalanceCents: reviewed.account.balanceCents,
        autopayEnabled: reviewed.account.autopayPlaceholder,
        invoiceIds: reviewed.account.invoices.map((invoice) => invoice.id),
        paymentIds: reviewed.account.payments.map((payment) => payment.id),
        existingPlan: reviewed.plan,
        existingStaffProfileIds: reviewed.staffProfileIds,
      },
      evidence: {
        discountRequestThreadId: REQUEST_THREAD_ID,
        effectivePeriod: BILLING_START_PERIOD,
        rateSourceMessageId: RATE_SOURCE_MESSAGE_ID,
        rateSourceFilename: RATE_SOURCE_FILE,
        monthlyGrossCents: PLAN_AMOUNT_CENTS,
        discountPercent: 50,
      },
      planned: {
        monthlyGrossCents: PLAN_AMOUNT_CENTS,
        employeeDiscountCents: EMPLOYEE_DISCOUNT_CENTS,
        monthlyFamilyResponsibilityCents: NET_AMOUNT_CENTS,
        billingStartPeriod: BILLING_START_PERIOD,
        augustInvoicesChanged: 0,
        accountBalanceChanged: false,
        paymentsChanged: 0,
        chargesCreated: 0,
        paymentAutopayChanged: false,
        staffAccessChanged: false,
      },
    }, null, 2));
    return;
  }

  invariant(option(CONFIRM_FLAG) === planFingerprint, `Pass ${CONFIRM_FLAG} ${planFingerprint} after reviewing the current preview.`);

  await prisma.$transaction(async (tx) => {
    const current = await loadState(tx);
    invariant(fingerprint(reviewedState(current)) === planFingerprint, "Production state changed after preview; no Pisgah assignment was applied.");
    if (assignmentApplied(current)) return;

    const childFields = record(current.child.customFields);
    invariant(!childFields.tuitionPlanId && !childFields.tuitionBillingEnabled, "Tyler received another tuition assignment after review.");
    invariant(current.account.autopayPlaceholder === false, "Payment autopay state changed before the Pisgah assignment.");
    invariant(!current.account.invoices.some((invoice) => record(invoice.customFields).billingPeriod === BILLING_START_PERIOD && record(invoice.customFields).childId === CHILD_ID), "A September Tyler invoice already exists.");

    const plan = current.plan ?? await tx.tuitionPlan.create({ data: {
      centerId: CENTER_ID,
      name: PLAN_NAME,
      ageGroup: current.child.ageGroup,
      cadence: "monthly",
      amountCents: PLAN_AMOUNT_CENTS,
    }, select: { id: true, centerId: true, name: true, ageGroup: true, cadence: true, amountCents: true } });

    const updatedAt = new Date().toISOString();
    await tx.child.update({ where: { id: CHILD_ID }, data: { customFields: {
      ...childFields,
      tuitionBillingEnabled: true,
      tuitionPlanId: plan.id,
      tuitionPlanName: plan.name,
      tuitionPlanAgeGroup: plan.ageGroup,
      tuitionPlanCadence: "monthly",
      tuitionBillingCadence: "monthly",
      tuitionPlanAmountCents: PLAN_AMOUNT_CENTS,
      tuitionAdditionalCharges: [],
      tuitionAdditionalChargesTotalCents: 0,
      tuitionCredits: [{ category: "employee_discount", amountCents: EMPLOYEE_DISCOUNT_CENTS }],
      tuitionCreditsTotalCents: EMPLOYEE_DISCOUNT_CENTS,
      tuitionGrossAmountCents: PLAN_AMOUNT_CENTS,
      tuitionNetAmountCents: NET_AMOUNT_CENTS,
      tuitionFundingType: "family",
      tuitionAutobillEligible: true,
      tuitionBillingDay: BILLING_DAY,
      tuitionBillingStartsPeriod: BILLING_START_PERIOD,
      tuitionBillingDescription: PLAN_NAME,
      tuitionBillingUpdatedAt: updatedAt,
      tuitionBillingUpdatedBy: UPDATED_BY,
      tuitionRateEvidence: {
        source: "director_spreadsheet_and_email",
        rateSourceMessageId: RATE_SOURCE_MESSAGE_ID,
        rateSourceFilename: RATE_SOURCE_FILE,
        discountRequestThreadId: REQUEST_THREAD_ID,
        effectivePeriod: BILLING_START_PERIOD,
        augustBillingChanged: false,
      },
    } as Prisma.InputJsonObject } });

    const accountFields = record(current.account.customFields);
    await tx.billingAccount.update({ where: { id: ACCOUNT_ID }, data: { customFields: {
      ...accountFields,
      tuitionAutobillEnabled: true,
      tuitionAutobillCadence: "monthly",
      tuitionAutobillBillingDay: BILLING_DAY,
      tuitionAutobillStartsPeriod: BILLING_START_PERIOD,
      tuitionAutobillPlanId: plan.id,
      tuitionAutobillPlanName: plan.name,
      tuitionAutobillAmountCents: PLAN_AMOUNT_CENTS,
      tuitionAutobillUpdatedAt: updatedAt,
      tuitionAutobillUpdatedBy: UPDATED_BY,
    } as Prisma.InputJsonObject } });

    await tx.auditLog.create({ data: {
      tenantId: current.center.organization.tenantId,
      centerId: CENTER_ID,
      action: "billing.tuition_assignment.enabled",
      resource: "Child",
      resourceId: CHILD_ID,
      metadata: {
        familyId: FAMILY_ID,
        childId: CHILD_ID,
        tuitionPlanId: plan.id,
        monthlyGrossCents: PLAN_AMOUNT_CENTS,
        tuitionCredits: [{ category: "employee_discount", amountCents: EMPLOYEE_DISCOUNT_CENTS }],
        tuitionCreditsTotalCents: EMPLOYEE_DISCOUNT_CENTS,
        monthlyFamilyResponsibilityCents: NET_AMOUNT_CENTS,
        cadence: "monthly",
        billingDay: BILLING_DAY,
        billingStartPeriod: BILLING_START_PERIOD,
        discountRequestThreadId: REQUEST_THREAD_ID,
        rateSourceMessageId: RATE_SOURCE_MESSAGE_ID,
        augustInvoicesChanged: false,
        accountBalanceChanged: false,
        paymentAutopayChanged: false,
        staffAccessChanged: false,
        chargeCreated: false,
      },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  const after = await loadState();
  invariant(assignmentApplied(after), "Tyler's September 50% employee discount assignment did not persist.");
  invariant(after.account.balanceCents === before.account.balanceCents && after.account.autopayPlaceholder === before.account.autopayPlaceholder, "Pisgah balance or payment autopay changed during assignment.");
  invariant(JSON.stringify(after.account.invoices) === JSON.stringify(before.account.invoices), "An existing Pisgah invoice changed during assignment.");
  invariant(JSON.stringify(after.account.payments) === JSON.stringify(before.account.payments), "A Pisgah payment changed during assignment.");
  invariant(JSON.stringify(after.staffMatches) === JSON.stringify(before.staffMatches), "Hannah's staff access changed during tuition assignment.");

  console.log(JSON.stringify({
    mode: alreadyApplied ? "already_applied" : "applied",
    childId: CHILD_ID,
    tuitionPlanId: after.plan?.id,
    billingStartPeriod: BILLING_START_PERIOD,
    monthlyGrossCents: PLAN_AMOUNT_CENTS,
    employeeDiscountCents: EMPLOYEE_DISCOUNT_CENTS,
    monthlyFamilyResponsibilityCents: NET_AMOUNT_CENTS,
    augustInvoicesChanged: 0,
    balanceChanged: false,
    paymentsChanged: 0,
    chargesCreated: 0,
    paymentAutopayChanged: false,
    staffAccessChanged: false,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
