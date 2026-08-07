import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_NAME = "Kid City USA - Kokomo";
const FAMILY_NAME = "Richardson Family";
const CHILD_NAME = "Ava Richardson";
const PERIOD = "2026-W33";
const CONFIRMED_CENTS = 20_250;
const PREVIOUS_SNAPSHOT_CENTS = 23_400;
const APPLY = "--apply";
const CONFIRM = "--confirm-kokomo-ava-rate";
const FINGERPRINT = "--confirm-fingerprint=";

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
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
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const center = await client.center.findFirst({ where: { name: CENTER_NAME, status: { not: "closed" } }, select: { id: true, name: true } });
  invariant(center, "Active Kokomo center was not found.");
  const child = await client.child.findFirst({
    where: {
      fullName: CHILD_NAME,
      family: { is: { name: FAMILY_NAME, centerId: center.id } },
    },
    select: {
      id: true,
      fullName: true,
      enrollmentStatus: true,
      classroomId: true,
      customFields: true,
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
          billingAccount: {
            select: {
              id: true,
              balanceCents: true,
              payments: { select: { id: true, status: true, amountCents: true, provider: true }, orderBy: { id: "asc" } },
              ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, balanceAfterCents: true } },
              invoices: {
                where: { status: { not: PaymentStatus.VOID } },
                select: { id: true, number: true, status: true, totalCents: true, customFields: true, items: { select: { amountCents: true } }, ledgerEntries: { select: { type: true, amountCents: true, paymentId: true } } },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  });
  invariant(child && child.family.billingAccount, "Kokomo Ava Richardson billing state was not found.");
  invariant(["enrolled", "active", "current"].includes(child.enrollmentStatus.toLowerCase()) && child.classroomId, "Ava Richardson is no longer a current classroom-assigned child.");
  const fields = object(child.customFields);
  invariant(fields.tuitionBillingEnabled === true, "Ava Richardson tuition billing is not enabled.");
  invariant(fields.tuitionPlanAmountCents === PREVIOUS_SNAPSHOT_CENTS, `Ava saved tuition snapshot changed from $234.00 to ${String(fields.tuitionPlanAmountCents)}.`);
  const planId = typeof fields.tuitionPlanId === "string" ? fields.tuitionPlanId : "";
  invariant(planId, "Ava selected tuition plan is missing.");
  const plan = await client.tuitionPlan.findUnique({ where: { id: planId }, select: { id: true, centerId: true, name: true, cadence: true, amountCents: true, ageGroup: true } });
  invariant(plan && plan.centerId === center.id && plan.cadence === "weekly" && plan.amountCents === CONFIRMED_CENTS, "Ava selected plan is no longer the confirmed Kokomo $202.50 weekly plan.");
  const invoices = child.family.billingAccount.invoices.filter((invoice) => {
    const invoiceFields = object(invoice.customFields);
    return invoiceFields.childId === child.id && (invoiceFields.billingPeriod === PERIOD || invoiceFields.coverageStartsPeriod === PERIOD);
  });
  invariant(invoices.length === 1, `Expected one active Ava ${PERIOD} invoice; found ${invoices.length}.`);
  const invoice = invoices[0];
  invariant(invoice.status === PaymentStatus.OPEN && invoice.totalCents === CONFIRMED_CENTS, "Ava W33 invoice is no longer the confirmed open $202.50 charge.");
  invariant(invoice.items.reduce((sum, item) => sum + item.amountCents, 0) === CONFIRMED_CENTS, "Ava W33 invoice items no longer total $202.50.");
  invariant(invoice.ledgerEntries.filter((entry) => ["invoice", "tuition_charge", "tuition_credit", "invoice_adjustment"].includes(entry.type)).reduce((sum, entry) => sum + entry.amountCents, 0) === CONFIRMED_CENTS, "Ava W33 charge ledger no longer totals $202.50.");
  invariant(child.family.billingAccount.ledgerEntries[0]?.balanceAfterCents === child.family.billingAccount.balanceCents, "Ava family balance does not match its latest ledger balance.");
  const snapshot = { center, child, plan, invoice };
  return { snapshot, fingerprint: createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex") };
}

async function applyRepair(expectedFingerprint: string) {
  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true } });
  invariant(user, "Brenden application user was not found for audit attribution.");
  return prisma.$transaction(async (tx) => {
    const before = await loadState(tx);
    invariant(before.fingerprint === expectedFingerprint, "Kokomo Ava state changed; rerun the dry run and review the new fingerprint.");
    const { center, child, plan, invoice } = before.snapshot;
    invariant(child.family.billingAccount, "Ava billing account disappeared.");
    const updatedAt = new Date().toISOString();
    await tx.child.update({
      where: { id: child.id },
      data: {
        customFields: {
          ...object(child.customFields),
          tuitionPlanId: plan.id,
          tuitionPlanName: plan.name,
          tuitionPlanAgeGroup: plan.ageGroup,
          tuitionPlanCadence: plan.cadence,
          tuitionBillingCadence: plan.cadence,
          tuitionPlanAmountCents: CONFIRMED_CENTS,
          tuitionNetAmountCents: CONFIRMED_CENTS,
          tuitionBillingUpdatedAt: updatedAt,
          tuitionBillingUpdatedBy: "Brenden Bruner - Kokomo director rate confirmation 2026-08-07",
          tuitionRateEvidence: {
            source: "director_reply",
            confirmedAt: updatedAt,
            note: "Kokomo assistant director confirmed Ava Richardson's correct weekly rate is $202.50; existing W33 invoice retained.",
          },
        } as Prisma.InputJsonObject,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        centerId: center.id,
        userId: user.id,
        action: "billing.tuition_assignment.director_confirmed_snapshot",
        resource: "Child",
        resourceId: child.id,
        metadata: {
          familyId: child.family.id,
          childId: child.id,
          previousSnapshotCents: PREVIOUS_SNAPSHOT_CENTS,
          confirmedAmountCents: CONFIRMED_CENTS,
          planId: plan.id,
          retainedInvoiceId: invoice.id,
          retainedInvoiceNumber: invoice.number,
          balanceChanged: false,
          noPaymentSubmitted: true,
          evidence: "Kokomo Reply All 2026-08-07",
        },
      },
    });
    return {
      child: child.fullName,
      plan: plan.name,
      confirmedAmountCents: CONFIRMED_CENTS,
      invoice: invoice.number,
      invoiceCents: invoice.totalCents,
      balanceBeforeCents: child.family.billingAccount.balanceCents,
      paymentSnapshot: child.family.billingAccount.payments,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

async function verify(result: Awaited<ReturnType<typeof applyRepair>>) {
  const center = await prisma.center.findFirstOrThrow({ where: { name: CENTER_NAME, status: { not: "closed" } }, select: { id: true } });
  const child = await prisma.child.findFirstOrThrow({
    where: { fullName: CHILD_NAME, family: { is: { name: FAMILY_NAME, centerId: center.id } } },
    select: {
      customFields: true,
      family: {
        select: {
          billingAccount: {
            select: {
              balanceCents: true,
              payments: { select: { id: true, status: true, amountCents: true, provider: true }, orderBy: { id: "asc" } },
              ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1, select: { balanceAfterCents: true } },
              invoices: { where: { number: result.invoice }, select: { status: true, totalCents: true } },
            },
          },
        },
      },
    },
  });
  invariant(child.family.billingAccount, "Ava billing account disappeared during verification.");
  invariant(object(child.customFields).tuitionPlanAmountCents === CONFIRMED_CENTS, "Ava assignment snapshot was not corrected to $202.50.");
  invariant(child.family.billingAccount.balanceCents === result.balanceBeforeCents, "Ava family balance changed during the snapshot-only correction.");
  invariant(child.family.billingAccount.ledgerEntries[0]?.balanceAfterCents === child.family.billingAccount.balanceCents, "Ava family balance does not match its latest ledger balance after correction.");
  invariant(child.family.billingAccount.invoices.length === 1 && child.family.billingAccount.invoices[0].status === PaymentStatus.OPEN && child.family.billingAccount.invoices[0].totalCents === CONFIRMED_CENTS, "Ava confirmed W33 invoice was not preserved.");
  invariant(JSON.stringify(child.family.billingAccount.payments) === JSON.stringify(result.paymentSnapshot), "Ava family payment records changed during the correction.");
  return {
    savedAssignmentCents: CONFIRMED_CENTS,
    invoiceCents: CONFIRMED_CENTS,
    balanceCents: child.family.billingAccount.balanceCents,
    latestLedgerBalanceCents: child.family.billingAccount.ledgerEntries[0]?.balanceAfterCents,
    paymentRecordsChanged: false,
  };
}

async function main() {
  const apply = process.argv.includes(APPLY);
  if (!apply) {
    const state = await loadState();
    const { center, child, plan, invoice } = state.snapshot;
    console.log(JSON.stringify({
      mode: "dry-run",
      fingerprint: state.fingerprint,
      school: center.name,
      family: child.family.name,
      child: child.fullName,
      savedAssignmentCents: object(child.customFields).tuitionPlanAmountCents,
      confirmedPlanCents: plan.amountCents,
      retainedInvoice: invoice.number,
      retainedInvoiceCents: invoice.totalCents,
      balanceCents: child.family.billingAccount?.balanceCents,
      latestLedgerBalanceCents: child.family.billingAccount?.ledgerEntries[0]?.balanceAfterCents,
      action: "update assignment snapshot only; preserve invoice, balance, ledger, and payments",
    }, null, 2));
    return;
  }
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expectedFingerprint = argument(FINGERPRINT);
  invariant(expectedFingerprint, `Apply requires ${FINGERPRINT}<value>.`);
  const result = await applyRepair(expectedFingerprint);
  console.log(JSON.stringify({ ok: true, result, verification: await verify(result) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
