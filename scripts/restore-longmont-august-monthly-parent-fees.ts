import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma, PrismaClient, UserRole } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { parentVisibleBillingBalanceCents } from "@/lib/parent-billing-visibility";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const CENTER_NAME = "Kid City USA - Longmont";
const BILLING_PERIOD = "2026-08";
const INCORRECT_VOID_REASON = "Longmont August 13 duplicate billing run rollback.";
const REPAIR_SOURCE = "bee_suite_guarded_remediation";
const REPAIR_ACTION = "billing.invoice.reinstated_incorrect_void";
const APPLY = "--apply";
const CONFIRM = "--confirm-longmont-august-monthly-fee-restoration";
const FINGERPRINT_ARG = "--confirm-fingerprint=";

const expectedInvoices = new Map([
  ["INV-20260813-96981508", 900],
  ["INV-20260813-AD232EBC", 19_300],
  ["INV-20260813-01FFF2D6", 33_600],
  ["INV-20260813-53EFA345", 22_000],
  ["INV-20260813-FA409BD6", 1_700],
  ["INV-20260813-3CCE913F", 18_600],
  ["INV-20260813-0B31F2D3", 4_000],
  ["INV-20260813-12FB5667", 6_800],
  ["INV-20260813-13B23C52", 500],
  ["INV-20260813-600D70D4", 12_100],
  ["INV-20260813-3A96EFE7", 13_600],
  ["INV-20260813-F81B4E7C", 20_400],
  ["INV-20260813-A4AB1D97", 8_000],
  ["INV-20260813-854350E0", 31_600],
  ["INV-20260813-760C3137", 19_100],
  ["INV-20260813-C012BDD4", 21_300],
]);
const EXPECTED_TOTAL_CENTS = 233_500;
const BILLING_MUTATION_ROLES = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
]);
const TENANT_WIDE_BILLING_ROLES = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

type DbClient = PrismaClient | Prisma.TransactionClient;

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function input(value: Prisma.JsonObject) {
  return value as Prisma.InputJsonObject;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function arg(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function restorationExternalId(invoiceId: string) {
  return `invoice-reinstatement:${invoiceId}:longmont-2026-08-monthly-fee`;
}

async function loadState(db: DbClient) {
  const center = await db.center.findUnique({
    where: { id: CENTER_ID },
    select: { id: true, name: true, status: true, customFields: true, organization: { select: { id: true, tenantId: true } } },
  });
  invariant(center?.name === CENTER_NAME && center.status !== "closed", "Longmont center identity or status changed.");
  const centerFields = object(center.customFields);
  const centerBillingApproval = {
    livePaymentsEnabled: centerFields.livePaymentsEnabled === true,
    tuitionBillingEnabled: centerFields.tuitionBillingEnabled === true,
    stripeBillingApproved: centerFields.stripeBillingApproved === true,
  };
  invariant(
    Object.values(centerBillingApproval).every(Boolean),
    "Longmont payment or tuition approval is no longer active.",
  );

  const user = await db.user.findUnique({
    where: { email: "brenden@kidcityusa.com" },
    select: {
      id: true,
      tenantId: true,
      email: true,
      role: true,
      isActive: true,
      accessGrants: {
        where: { isActive: true },
        select: { tenantId: true, centerId: true, scopeType: true, startsAt: true, endsAt: true },
      },
    },
  });
  invariant(user?.isActive, "Brenden application audit user is missing or inactive.");
  invariant(user.tenantId === center.organization.tenantId, "Brenden application audit user moved outside the Longmont tenant.");
  invariant(BILLING_MUTATION_ROLES.has(user.role), "Brenden application audit user no longer has a billing mutation role.");
  const now = new Date();
  const hasActiveLongmontGrant = user.accessGrants.some((grant) =>
    grant.tenantId === center.organization.tenantId
    && grant.scopeType === "CENTER"
    && grant.centerId === CENTER_ID
    && (!grant.startsAt || grant.startsAt <= now)
    && (!grant.endsAt || grant.endsAt > now));
  invariant(
    TENANT_WIDE_BILLING_ROLES.has(user.role) || hasActiveLongmontGrant,
    "Brenden application audit user no longer has Longmont access.",
  );

  const invoices = await db.invoice.findMany({
    where: { number: { in: [...expectedInvoices.keys()] } },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      customFields: true,
      items: { select: { amountCents: true } },
      ledgerEntries: {
        select: { id: true, type: true, amountCents: true, paymentId: true, sourceSystem: true, externalId: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: { select: { id: true, centerId: true } },
          invoices: {
            select: { id: true, number: true, status: true, totalCents: true, customFields: true, createdAt: true },
          },
          payments: {
            select: { id: true, amountCents: true, status: true, provider: true, paidAt: true },
            orderBy: [{ id: "asc" }],
          },
          ledgerEntries: {
            select: { id: true, type: true, amountCents: true, balanceAfterCents: true, sourceSystem: true, createdAt: true },
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
    orderBy: [{ number: "asc" }],
  });
  invariant(invoices.length === expectedInvoices.size, `Expected ${expectedInvoices.size} exact monthly invoices; found ${invoices.length}.`);
  invariant(new Set(invoices.map((invoice) => invoice.billingAccount.id)).size === expectedInvoices.size, "Monthly restoration targets no longer map one-to-one to billing accounts.");

  const childIds = invoices.map((invoice) => clean(object(invoice.customFields).childId));
  invariant(childIds.every(Boolean) && new Set(childIds).size === expectedInvoices.size, "Monthly restoration child scope is incomplete or duplicated.");
  const children = await db.child.findMany({
    where: { id: { in: childIds }, family: { centerId: CENTER_ID }, ...currentlyEnrolledChildWhere() },
    select: { id: true, familyId: true, enrollmentStatus: true, customFields: true },
  });
  invariant(children.length === expectedInvoices.size, "A monthly fee target child is no longer currently enrolled at Longmont.");
  const childById = new Map(children.map((child) => [child.id, child]));
  const planIds = [...new Set(children.map((child) => clean(object(child.customFields).tuitionPlanId)).filter(Boolean))];
  const plans = await db.tuitionPlan.findMany({
    where: { id: { in: planIds } },
    select: { id: true, centerId: true, cadence: true, amountCents: true },
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const targets = invoices.map((invoice) => {
    const expectedCents = expectedInvoices.get(invoice.number);
    invariant(expectedCents === invoice.totalCents, `${invoice.number} amount changed.`);
    invariant(invoice.billingAccount.family.centerId === CENTER_ID, `${invoice.number} moved outside Longmont.`);
    const fields = object(invoice.customFields);
    const childId = clean(fields.childId);
    const child = childById.get(childId);
    invariant(child && child.familyId === invoice.billingAccount.family.id, `${invoice.number} child/family scope changed.`);
    const childFields = object(child.customFields);
    invariant(fields.billingPeriod === BILLING_PERIOD && fields.billingCadence === "monthly" && fields.chargeSource === "tuitionPlan", `${invoice.number} is not the reviewed August monthly parent fee.`);
    invariant(fields.voidReason === INCORRECT_VOID_REASON, `${invoice.number} no longer has the reviewed incorrect-void reason.`);
    invariant(childFields.tuitionBillingEnabled === true, `${invoice.number} current monthly assignment is disabled.`);
    invariant(childFields.tuitionBillingCadence === "monthly" && childFields.tuitionBillingStartsPeriod === BILLING_PERIOD, `${invoice.number} current cadence or start period changed.`);
    const planId = clean(fields.sourceId);
    invariant(clean(childFields.tuitionPlanId) === planId, `${invoice.number} current plan identity changed.`);
    const plan = planById.get(planId);
    invariant(plan?.centerId === CENTER_ID, `${invoice.number} live tuition plan moved outside Longmont or disappeared.`);
    invariant(clean(plan.cadence).toLowerCase() === "monthly", `${invoice.number} live tuition plan cadence changed.`);
    const positiveItemCents = invoice.items.filter((item) => item.amountCents > 0).reduce((sum, item) => sum + item.amountCents, 0);
    invariant(Number(childFields.tuitionPlanAmountCents) === positiveItemCents, `${invoice.number} current plan amount no longer matches the reviewed gross charge.`);
    invariant(plan.amountCents === positiveItemCents, `${invoice.number} live tuition plan amount no longer matches the reviewed gross charge.`);
    invariant(invoice.items.reduce((sum, item) => sum + item.amountCents, 0) === invoice.totalCents, `${invoice.number} items no longer net to the invoice total.`);

    const alternatives = invoice.billingAccount.invoices.filter((candidate) => {
      if (candidate.id === invoice.id || candidate.status === PaymentStatus.VOID) return false;
      const candidateFields = object(candidate.customFields);
      return candidateFields.childId === childId
        && candidateFields.billingPeriod === BILLING_PERIOD
        && candidateFields.billingCadence === "monthly"
        && candidateFields.chargeSource === "tuitionPlan";
    });
    invariant(alternatives.length === 0, `${invoice.number} now has another active August monthly invoice.`);

    const restoreEntries = invoice.ledgerEntries.filter((entry) => entry.externalId === restorationExternalId(invoice.id));
    const ledgerCents = invoice.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
    const pending = invoice.status === PaymentStatus.VOID && restoreEntries.length === 0 && ledgerCents === 0;
    const restored = invoice.status !== PaymentStatus.VOID
      && restoreEntries.length === 1
      && restoreEntries[0].amountCents === invoice.totalCents
      && restoreEntries[0].sourceSystem === REPAIR_SOURCE
      && ledgerCents === invoice.totalCents
      && clean(fields.incorrectVoidRestoredAt).length > 0;
    invariant(pending || restored, `${invoice.number} is in neither the exact pre-repair nor post-repair state.`);
    invariant(invoice.ledgerEntries.every((entry) => !entry.paymentId), `${invoice.number} gained invoice-linked payment activity.`);
    const latestLedger = invoice.billingAccount.ledgerEntries.at(-1) ?? null;
    if (latestLedger?.balanceAfterCents !== null && latestLedger?.balanceAfterCents !== undefined) {
      invariant(latestLedger.balanceAfterCents === invoice.billingAccount.balanceCents, `${invoice.number} account balance does not match its latest ledger balance.`);
    }
    const agencyLedgerEntries = invoice.billingAccount.ledgerEntries.map((entry) => ({
      type: entry.type,
      sourceSystem: entry.sourceSystem,
      amountCents: entry.amountCents,
    }));
    return {
      id: invoice.id,
      number: invoice.number,
      totalCents: invoice.totalCents,
      status: invoice.status,
      customFields: invoice.customFields,
      billingAccountId: invoice.billingAccount.id,
      familyId: invoice.billingAccount.family.id,
      childId,
      livePlan: plan,
      balanceCents: invoice.billingAccount.balanceCents,
      parentVisibleBalanceCents: parentVisibleBillingBalanceCents({
        accountBalanceCents: invoice.billingAccount.balanceCents,
        agencyLedgerEntries,
      }),
      ledgerEntries: invoice.ledgerEntries,
      payments: invoice.billingAccount.payments,
      pending,
      restored,
    };
  });
  invariant(targets.reduce((sum, target) => sum + target.totalCents, 0) === EXPECTED_TOTAL_CENTS, "Reviewed monthly fee total changed.");

  const state = {
    centerId: center.id,
    centerBillingApproval,
    auditActor: {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      isActive: user.isActive,
      hasActiveLongmontGrant,
      tenantWideBillingRole: TENANT_WIDE_BILLING_ROLES.has(user.role),
    },
    targets: targets.map((target) => ({
      id: target.id,
      number: target.number,
      totalCents: target.totalCents,
      status: target.status,
      billingAccountId: target.billingAccountId,
      familyId: target.familyId,
      childId: target.childId,
      livePlan: target.livePlan,
      balanceCents: target.balanceCents,
      parentVisibleBalanceCents: target.parentVisibleBalanceCents,
      ledgerEntries: target.ledgerEntries,
      payments: target.payments,
      pending: target.pending,
      restored: target.restored,
    })),
  };
  return { center, user, targets, state, fingerprint: fingerprint(state) };
}

async function main() {
  const before = await loadState(prisma);
  const pending = before.targets.filter((target) => target.pending);
  const paymentSnapshot = before.targets.flatMap((target) => target.payments);
  console.log(JSON.stringify({
    mode: process.argv.includes(APPLY) ? "apply" : "dry-run",
    fingerprint: before.fingerprint,
    invoicesReviewed: before.targets.length,
    invoicesToRestore: pending.length,
    alreadyRestored: before.targets.length - pending.length,
    centsToRestore: pending.reduce((sum, target) => sum + target.totalCents, 0),
    familiesWithPostedPayments: before.targets.filter((target) => target.payments.some((payment) => payment.status === PaymentStatus.PAID)).length,
    postedPaymentCountPreserved: paymentSnapshot.filter((payment) => payment.status === PaymentStatus.PAID).length,
    postedPaymentCentsPreserved: paymentSnapshot.filter((payment) => payment.status === PaymentStatus.PAID).reduce((sum, payment) => sum + payment.amountCents, 0),
    balanceDeltaCents: pending.reduce((sum, target) => sum + target.totalCents, 0),
    privatePayWeeklyInvoicesChanged: 0,
    externalChargesOrRefunds: 0,
    messagesSent: 0,
  }, null, 2));
  if (!process.argv.includes(APPLY)) return;

  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(arg(FINGERPRINT_ARG) === before.fingerprint, "Longmont monthly-fee state changed; rerun and review the dry run.");
  invariant(pending.length === expectedInvoices.size, "This repair must atomically restore the complete reviewed monthly-fee set.");
  const user = before.user;

  const restoredAt = new Date();
  await prisma.$transaction(async (tx) => {
    const accountIds = [...pending.map((target) => target.billingAccountId)].sort();
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "BillingAccount"
      WHERE "id" IN (${Prisma.join(accountIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
    const locked = await loadState(tx);
    invariant(locked.fingerprint === before.fingerprint, "Longmont monthly-fee state changed while acquiring account locks.");

    for (const target of locked.targets) {
      invariant(target.pending, `${target.number} changed before restoration.`);
      const fields = object(target.customFields);
      const claim = await tx.invoice.updateMany({
        where: { id: target.id, status: PaymentStatus.VOID },
        data: {
          status: PaymentStatus.OPEN,
          customFields: input({
            ...fields,
            incorrectVoidRestoredAt: restoredAt.toISOString(),
            incorrectVoidRestoredByUserId: user.id,
            incorrectVoidRestoredByEmail: user.email,
            incorrectVoidRestorationReason: "Valid Longmont August monthly parent fee was incorrectly included in the August 13 duplicate-run rollback.",
          }),
        },
      });
      invariant(claim.count === 1, `${target.number} could not be claimed for restoration.`);
      const account = await tx.billingAccount.update({
        where: { id: target.billingAccountId },
        data: { balanceCents: { increment: target.totalCents } },
        select: { balanceCents: true },
      });
      invariant(account.balanceCents === target.balanceCents + target.totalCents, `${target.number} account balance changed during restoration.`);
      const ledger = await tx.ledgerEntry.create({
        data: {
          billingAccountId: target.billingAccountId,
          invoiceId: target.id,
          type: "invoice_reinstatement",
          description: `Restored ${target.number}: valid August monthly parent fee incorrectly voided by duplicate-run rollback`,
          amountCents: target.totalCents,
          balanceAfterCents: account.balanceCents,
          sourceSystem: REPAIR_SOURCE,
          externalId: restorationExternalId(target.id),
          metadata: input({
            priorVoidReason: INCORRECT_VOID_REASON,
            billingPeriod: BILLING_PERIOD,
            preservedPayments: true,
            noExternalChargeOrRefund: true,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: before.center.organization.tenantId || user.tenantId,
          centerId: CENTER_ID,
          userId: user.id,
          action: REPAIR_ACTION,
          resource: "Invoice",
          resourceId: target.id,
          metadata: input({
            familyId: target.familyId,
            childId: target.childId,
            invoiceNumber: target.number,
            amountCents: target.totalCents,
            billingPeriod: BILLING_PERIOD,
            ledgerEntryId: ledger.id,
            priorVoidReason: INCORRECT_VOID_REASON,
            paymentsPreserved: true,
            privatePayWeeklyInvoicesChanged: 0,
            externalChargesOrRefunds: 0,
          }),
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 60_000 });

  const after = await loadState(prisma);
  invariant(after.targets.every((target) => target.restored), "Not every reviewed monthly fee reached the guarded restored state.");
  for (const target of before.targets) {
    const current = after.targets.find((item) => item.id === target.id);
    invariant(current, `${target.number} disappeared after restoration.`);
    invariant(current.balanceCents === target.balanceCents + target.totalCents, `${target.number} final account balance is incorrect.`);
    invariant(current.parentVisibleBalanceCents === target.parentVisibleBalanceCents + target.totalCents, `${target.number} parent-visible balance did not increase by the restored fee.`);
    invariant(JSON.stringify(current.payments) === JSON.stringify(target.payments), `${target.number} payment history changed during restoration.`);
  }
  console.log(JSON.stringify({
    ok: true,
    invoicesRestored: after.targets.length,
    familiesRestored: after.targets.length,
    centsRestored: EXPECTED_TOTAL_CENTS,
    postedPaymentsPreserved: paymentSnapshot.filter((payment) => payment.status === PaymentStatus.PAID).length,
    privatePayWeeklyInvoicesChanged: 0,
    externalChargesOrRefunds: 0,
    messagesSent: 0,
    verificationFingerprint: after.fingerprint,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
