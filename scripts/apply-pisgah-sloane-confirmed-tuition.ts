import "./load-env";

import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-fingerprint";
const CENTER_ID = "cmp4ewg8w004k6alwid0bwiur";
const CENTER_NAME = "Kid City USA - Pisgah Forest";
const FAMILY_ID = "cms7g820e003d6a44w4gtdz44";
const CHILD_ID = "cmta4xzkj000ql2047bsalb8t";
const CHILD_NAME = "Sloane Baggaley";
const PLAN_NAME = "Baggaley Monthly Tuition $1,200.00";
const MONTHLY_AMOUNT_CENTS = 120_000;
const AUGUST_PRORATION_CENTS = 27_700;
const START_DATE = "2026-08-24";
const BILLING_START_PERIOD = "2026-09";
const BILLING_DAY = 1;
const EVIDENCE_MESSAGE_ID = "1a03f1b8985f5d08";
const UPDATED_BY = "system:pisgah-email-evidence-2026-08-26";
const PRORATION_DEDUPE_KEY = `pisgah-sloane-proration:${FAMILY_ID}:${START_DATE}:${EVIDENCE_MESSAGE_ID}`;

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
  const [center, family, plans] = await Promise.all([
    db.center.findUnique({
      where: { id: CENTER_ID },
      select: { id: true, name: true, organization: { select: { tenantId: true } } },
    }),
    db.family.findUnique({
      where: { id: FAMILY_ID },
      select: {
        id: true,
        name: true,
        centerId: true,
        children: {
          where: { id: CHILD_ID },
          select: {
            id: true,
            fullName: true,
            ageGroup: true,
            enrollmentStatus: true,
            startDate: true,
            customFields: true,
          },
        },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            autopayPlaceholder: true,
            customFields: true,
            invoices: {
              select: {
                id: true,
                number: true,
                status: true,
                totalCents: true,
                dueDate: true,
                customFields: true,
                items: { select: { description: true, amountCents: true } },
              },
              orderBy: { id: "asc" },
            },
            payments: {
              select: { id: true, status: true, provider: true, amountCents: true },
              orderBy: { id: "asc" },
            },
            ledgerEntries: {
              select: { id: true, type: true, amountCents: true, balanceAfterCents: true, invoiceId: true, paymentId: true, externalId: true, metadata: true },
              orderBy: { id: "asc" },
            },
          },
        },
      },
    }),
    db.tuitionPlan.findMany({
      where: { centerId: CENTER_ID, name: PLAN_NAME },
      select: { id: true, centerId: true, name: true, ageGroup: true, cadence: true, amountCents: true },
      orderBy: { id: "asc" },
    }),
  ]);

  invariant(center?.name === CENTER_NAME, "Pisgah Forest center identity changed.");
  invariant(family?.centerId === CENTER_ID && family.children.length === 1, "Sloane's family association changed.");
  const child = family.children[0];
  invariant(child.id === CHILD_ID && child.fullName === CHILD_NAME, "Sloane's child identity changed.");
  invariant(["enrolled", "active", "current"].includes(child.enrollmentStatus.toLowerCase()), "Sloane is no longer currently enrolled.");
  invariant(child.startDate?.toISOString().slice(0, 10) === START_DATE, "Sloane's confirmed start date changed.");
  invariant(plans.length <= 1, "Multiple Sloane tuition plans already exist.");
  invariant(!plans[0] || (plans[0].centerId === CENTER_ID && plans[0].ageGroup === child.ageGroup && plans[0].cadence === "monthly" && plans[0].amountCents === MONTHLY_AMOUNT_CENTS), "An incompatible Sloane tuition plan already exists.");

  return { center, family, child, account: family.billingAccount, plan: plans[0] ?? null };
}

function reviewedState(state: Awaited<ReturnType<typeof loadState>>) {
  return {
    centerId: state.center.id,
    family: { id: state.family.id, name: state.family.name },
    child: {
      id: state.child.id,
      name: state.child.fullName,
      ageGroup: state.child.ageGroup,
      enrollmentStatus: state.child.enrollmentStatus,
      startDate: state.child.startDate,
      customFields: state.child.customFields,
    },
    account: state.account,
    plan: state.plan,
  };
}

function matchingInvoice(state: Awaited<ReturnType<typeof loadState>>) {
  return state.account?.invoices.find((invoice) => record(invoice.customFields).dedupeKey === PRORATION_DEDUPE_KEY) ?? null;
}

function alreadyApplied(state: Awaited<ReturnType<typeof loadState>>) {
  const childFields = record(state.child.customFields);
  const accountFields = record(state.account?.customFields);
  const invoice = matchingInvoice(state);
  return Boolean(
    state.plan
    && state.account
    && state.account.autopayPlaceholder === false
    && childFields.tuitionBillingEnabled === true
    && childFields.tuitionPlanId === state.plan.id
    && childFields.tuitionPlanAmountCents === MONTHLY_AMOUNT_CENTS
    && childFields.tuitionBillingCadence === "monthly"
    && childFields.tuitionBillingStartsPeriod === BILLING_START_PERIOD
    && accountFields.tuitionAutobillEnabled === true
    && accountFields.tuitionAutobillStartsPeriod === BILLING_START_PERIOD
    && invoice?.status === PaymentStatus.OPEN
    && invoice.totalCents === AUGUST_PRORATION_CENTS
    && record(invoice.customFields).noPaymentSubmitted === true
    && record(invoice.customFields).autopaySuppressed === true,
  );
}

async function main() {
  const before = await loadState();
  const reviewed = reviewedState(before);
  const planFingerprint = fingerprint(reviewed);

  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({
      mode: "preview",
      alreadyApplied: alreadyApplied(before),
      planFingerprint,
      reviewed: {
        centerId: before.center.id,
        familyId: before.family.id,
        familyName: before.family.name,
        childId: before.child.id,
        childName: before.child.fullName,
        ageGroup: before.child.ageGroup,
        enrollmentStatus: before.child.enrollmentStatus,
        startDate: before.child.startDate,
        billingAccount: before.account,
        existingPlan: before.plan,
      },
      evidence: {
        messageId: EVIDENCE_MESSAGE_ID,
        confirmedMonthlyAmountCents: MONTHLY_AMOUNT_CENTS,
        confirmedAugustProrationCents: AUGUST_PRORATION_CENTS,
        confirmedStartDate: START_DATE,
      },
      planned: {
        createBillingAccountIfMissing: true,
        recurringInvoiceStartPeriod: BILLING_START_PERIOD,
        augustOpenInvoiceCents: AUGUST_PRORATION_CENTS,
        chargesCreated: 0,
        paymentsCreated: 0,
        refundsCreated: 0,
        paymentAutopayChanged: false,
      },
    }, null, 2));
    return;
  }

  invariant(option(CONFIRM_FLAG) === planFingerprint, `Pass ${CONFIRM_FLAG} ${planFingerprint} after reviewing the current preview.`);

  await prisma.$transaction(async (tx) => {
    const current = await loadState(tx);
    invariant(fingerprint(reviewedState(current)) === planFingerprint, "Production state changed after preview; no Pisgah billing change was applied.");
    if (alreadyApplied(current)) return;

    const childFields = record(current.child.customFields);
    invariant(!childFields.tuitionPlanId && childFields.tuitionBillingEnabled !== true, "Sloane received another tuition assignment after review.");
    invariant(!current.account || (current.account.autopayPlaceholder === false && current.account.invoices.length === 0 && current.account.payments.length === 0 && current.account.ledgerEntries.length === 0 && current.account.balanceCents === 0), "Sloane's billing account gained activity after review.");

    const plan = current.plan ?? await tx.tuitionPlan.create({
      data: {
        centerId: CENTER_ID,
        name: PLAN_NAME,
        ageGroup: current.child.ageGroup,
        cadence: "monthly",
        amountCents: MONTHLY_AMOUNT_CENTS,
      },
      select: { id: true, centerId: true, name: true, ageGroup: true, cadence: true, amountCents: true },
    });

    const updatedAt = new Date().toISOString();
    await tx.child.update({
      where: { id: CHILD_ID },
      data: { customFields: {
        ...childFields,
        tuitionBillingEnabled: true,
        tuitionPlanId: plan.id,
        tuitionPlanName: plan.name,
        tuitionPlanAgeGroup: plan.ageGroup,
        tuitionPlanCadence: "monthly",
        tuitionBillingCadence: "monthly",
        tuitionPlanAmountCents: MONTHLY_AMOUNT_CENTS,
        tuitionAdditionalCharges: [],
        tuitionAdditionalChargesTotalCents: 0,
        tuitionCredits: [],
        tuitionCreditsTotalCents: 0,
        tuitionGrossAmountCents: MONTHLY_AMOUNT_CENTS,
        tuitionNetAmountCents: MONTHLY_AMOUNT_CENTS,
        tuitionFundingType: "family",
        tuitionAutobillEligible: true,
        tuitionBillingDay: BILLING_DAY,
        tuitionBillingStartsPeriod: BILLING_START_PERIOD,
        tuitionBillingDescription: PLAN_NAME,
        tuitionBillingUpdatedAt: updatedAt,
        tuitionBillingUpdatedBy: UPDATED_BY,
        tuitionRateEvidence: {
          source: "director_email_reply",
          messageId: EVIDENCE_MESSAGE_ID,
          confirmedMonthlyAmountCents: MONTHLY_AMOUNT_CENTS,
          confirmedAugustProrationCents: AUGUST_PRORATION_CENTS,
          confirmedStartDate: START_DATE,
        },
      } as Prisma.InputJsonObject },
    });

    const account = await tx.billingAccount.upsert({
      where: { familyId: FAMILY_ID },
      update: {},
      create: { familyId: FAMILY_ID, balanceCents: 0, autopayPlaceholder: false },
      select: { id: true, customFields: true, autopayPlaceholder: true },
    });
    invariant(account.autopayPlaceholder === false, "Sloane's payment autopay state changed before billing setup.");
    await tx.billingAccount.update({
      where: { id: account.id },
      data: { customFields: {
        ...record(account.customFields),
        tuitionAutobillEnabled: true,
        tuitionAutobillCadence: "monthly",
        tuitionAutobillBillingDay: BILLING_DAY,
        tuitionAutobillStartsPeriod: BILLING_START_PERIOD,
        tuitionAutobillPlanId: plan.id,
        tuitionAutobillPlanName: plan.name,
        tuitionAutobillAmountCents: MONTHLY_AMOUNT_CENTS,
        tuitionAutobillUpdatedAt: updatedAt,
        tuitionAutobillUpdatedBy: UPDATED_BY,
      } as Prisma.InputJsonObject },
    });

    const description = `Prorated August tuition - ${CHILD_NAME}`;
    const invoice = await createBillingInvoiceForFamily(tx, {
      familyId: FAMILY_ID,
      dueDate: new Date("2026-08-24T12:00:00.000Z"),
      description,
      items: [{ description, amountCents: AUGUST_PRORATION_CENTS, ledgerType: "tuition_charge" }],
      customFields: {
        mode: "director_confirmed_prorated_start",
        billingPeriod: "2026-08-prorated",
        billingCadence: "one_time",
        centerId: CENTER_ID,
        childId: CHILD_ID,
        childName: CHILD_NAME,
        chargeSource: "director_confirmation",
        coverageStartDate: START_DATE,
        coverageEndDate: "2026-08-31",
        grossTuitionCents: AUGUST_PRORATION_CENTS,
        tuitionCredits: [],
        tuitionCreditsTotalCents: 0,
        netTuitionCents: AUGUST_PRORATION_CENTS,
        dedupeKey: PRORATION_DEDUPE_KEY,
        autopaySuppressed: true,
        autopaySuppressedReason: "director_confirmed_one_time_proration",
        noPaymentSubmitted: true,
        evidenceMessageId: EVIDENCE_MESSAGE_ID,
      },
    });
    invariant(invoice.created && invoice.invoice.totalCents === AUGUST_PRORATION_CENTS, "The exact Sloane proration invoice was not created once.");

    await tx.auditLog.create({
      data: {
        tenantId: current.center.organization.tenantId,
        centerId: CENTER_ID,
        action: "billing.pisgah_sloane_confirmed_tuition_configured",
        resource: "Child",
        resourceId: CHILD_ID,
        metadata: {
          familyId: FAMILY_ID,
          childId: CHILD_ID,
          planId: plan.id,
          invoiceId: invoice.invoice.id,
          invoiceNumber: invoice.invoice.number,
          monthlyAmountCents: MONTHLY_AMOUNT_CENTS,
          augustProrationCents: AUGUST_PRORATION_CENTS,
          billingStartPeriod: BILLING_START_PERIOD,
          evidenceMessageId: EVIDENCE_MESSAGE_ID,
          noPaymentSubmitted: true,
          paymentAutopayChanged: false,
          chargeCreated: false,
          refundCreated: false,
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  const after = await loadState();
  invariant(alreadyApplied(after), "Sloane's confirmed tuition setup did not persist exactly.");
  invariant(after.account?.balanceCents === AUGUST_PRORATION_CENTS, "Sloane's post-apply balance is not the exact confirmed August proration.");
  invariant(after.account.autopayPlaceholder === false, "Payment autopay was enabled unexpectedly.");
  invariant(after.account.payments.length === 0, "A payment was created unexpectedly.");
  invariant(after.account.invoices.length === 1 && after.account.ledgerEntries.length === 1, "Sloane's invoice or ledger entry was duplicated.");

  console.log(JSON.stringify({
    mode: "applied",
    familyId: FAMILY_ID,
    childId: CHILD_ID,
    billingAccountId: after.account.id,
    tuitionPlanId: after.plan?.id,
    invoiceId: matchingInvoice(after)?.id,
    invoiceNumber: matchingInvoice(after)?.number,
    balanceCents: after.account.balanceCents,
    monthlyAmountCents: MONTHLY_AMOUNT_CENTS,
    recurringBillingStartPeriod: BILLING_START_PERIOD,
    paymentsCreated: 0,
    chargesCreated: 0,
    refundsCreated: 0,
    paymentAutopayChanged: false,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
