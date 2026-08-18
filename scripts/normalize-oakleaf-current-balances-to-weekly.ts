import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PaymentStatus, Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { invoiceLedgerBalanceCents, invoiceVoidBlocker } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";
const APPLY = "--apply";
const CONFIRM = "--confirm-oakleaf-weekly-balances";
const FINGERPRINT = "--confirm-fingerprint=";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}
function input(value: Prisma.JsonObject) { return value as Prisma.InputJsonObject; }
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function hash(value: Buffer | unknown) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest("hex");
}

function verifySource() {
  const path = clean(process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH);
  invariant(path, "OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  invariant(hash(readFileSync(path)) === SOURCE_SHA256, "Oakleaf source fingerprint changed.");
}

async function load(client: Prisma.TransactionClient | typeof prisma = prisma, onlyFamilyId?: string) {
  const [center, actor, families] = await Promise.all([
    client.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } } }),
    client.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, email: true, tenantId: true } }),
    client.family.findMany({
      where: {
        centerId: CENTER_ID,
        ...(onlyFamilyId ? { id: onlyFamilyId } : {}),
        children: { some: currentlyEnrolledChildWhere() },
      },
      select: {
        id: true,
        name: true,
        children: { where: currentlyEnrolledChildWhere(), select: { id: true, fullName: true, customFields: true } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            customFields: true,
            invoices: {
              where: { status: PaymentStatus.OPEN },
              select: {
                id: true,
                number: true,
                status: true,
                totalCents: true,
                sourceSystem: true,
                externalId: true,
                customFields: true,
                ledgerEntries: { select: { id: true, amountCents: true, paymentId: true } },
              },
              orderBy: { createdAt: "asc" },
            },
            payments: { select: { id: true, status: true, provider: true, customFields: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  invariant(center?.name === CENTER_NAME && center.status === "active", "Oakleaf center changed.");
  invariant(actor?.tenantId === center.organization.tenantId, "Oakleaf audit actor changed.");

  const plans = families.flatMap((family) => {
    const account = family.billingAccount;
    invariant(account, `${family.name} has no billing account.`);
    const weeklyCents = family.children.reduce((sum, child) => {
      const fields = object(child.customFields);
      return sum + (fields.tuitionBillingEnabled === true ? Number(fields.tuitionPlanAmountCents ?? 0) : 0);
    }, 0);
    if (weeklyCents <= 0 || account.balanceCents <= weeklyCents) return [];

    const currentWeek = account.invoices.filter((invoice) => {
      const fields = object(invoice.customFields);
      return fields.chargeSource === "tuitionPlan" && fields.billingPeriod === "2026-W34";
    });
    invariant(currentWeek.length > 0, `${family.name} does not have an open W34 invoice.`);
    invariant(currentWeek.reduce((sum, invoice) => sum + invoiceLedgerBalanceCents(invoice.ledgerEntries), 0) === weeklyCents, `${family.name} W34 invoices do not equal its reviewed weekly rate.`);
    invariant(!currentWeek.some((invoice) => invoice.ledgerEntries.some((entry) => entry.paymentId)), `${family.name} W34 invoice has payment allocations.`);

    const removable = account.invoices.filter((invoice) => {
      const fields = object(invoice.customFields);
      return invoice.sourceSystem === "procare"
        || (fields.chargeSource === "tuitionPlan" && fields.billingPeriod === "2026-W33");
    });
    invariant(account.invoices.length === removable.length + currentWeek.length, `${family.name} has an unexpected open invoice.`);
    for (const invoice of removable) {
      const blocker = invoiceVoidBlocker({ ...invoice, payments: account.payments });
      invariant(!blocker, `${invoice.number} cannot be normalized: ${blocker}`);
    }
    const removableInvoiceCents = removable.reduce((sum, invoice) => sum + invoiceLedgerBalanceCents(invoice.ledgerEntries), 0);
    const standaloneCorrectionCents = account.balanceCents - removableInvoiceCents - weeklyCents;
    invariant(standaloneCorrectionCents >= 0, `${family.name} would require increasing its balance.`);
    const planFingerprint = hash({
      familyId: family.id,
      weeklyCents,
      balanceCents: account.balanceCents,
      children: family.children.map((child) => ({ id: child.id, customFields: child.customFields })),
      invoices: account.invoices.map((invoice) => ({ id: invoice.id, status: invoice.status, totalCents: invoice.totalCents, ledgerEntries: invoice.ledgerEntries })),
      payments: account.payments,
    });
    return [{ family, account, weeklyCents, currentWeek, removable, removableInvoiceCents, standaloneCorrectionCents, planFingerprint }];
  });
  return {
    center,
    actor,
    plans,
    fingerprint: hash(plans.map((plan) => ({ familyId: plan.family.id, planFingerprint: plan.planFingerprint }))),
  };
}

async function apply(expectedFingerprint: string) {
  const before = await load();
  invariant(before.fingerprint === expectedFingerprint, "Oakleaf weekly-balance state changed; rerun preview.");
  const appliedAt = new Date();
  for (const original of before.plans) {
    await prisma.$transaction(async (tx) => {
      const current = await load(tx, original.family.id);
      invariant(current.plans.length === 1 && current.plans[0].planFingerprint === original.planFingerprint, `${original.family.name} changed before correction.`);
      const plan = current.plans[0];
      for (const invoice of [...plan.removable].reverse()) {
        const reversalCents = invoiceLedgerBalanceCents(invoice.ledgerEntries);
        const updated = await tx.invoice.updateMany({
          where: { id: invoice.id, status: PaymentStatus.OPEN },
          data: {
            status: PaymentStatus.VOID,
            customFields: input({
              ...object(invoice.customFields),
              voidedAt: appliedAt.toISOString(),
              voidedByUserId: current.actor.id,
              voidedByEmail: current.actor.email,
              voidReason: "Oakleaf current-family balance normalized to one reviewed weekly rate.",
            }),
          },
        });
        invariant(updated.count === 1, `${invoice.number} changed before void.`);
        const account = await tx.billingAccount.update({ where: { id: plan.account.id }, data: { balanceCents: { decrement: reversalCents } }, select: { balanceCents: true } });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: plan.account.id,
            invoiceId: invoice.id,
            type: "invoice_void",
            description: `Voided ${invoice.number}: normalized Oakleaf balance to weekly rate`,
            amountCents: -reversalCents,
            balanceAfterCents: account.balanceCents,
            sourceSystem: "oakleaf_weekly_balance_normalization_2026_08_18",
            externalId: `oakleaf-weekly-balance-invoice-void:${invoice.id}`,
            metadata: { sourceSha256: SOURCE_SHA256, targetWeeklyCents: plan.weeklyCents, paymentsChanged: false },
          },
        });
      }
      if (plan.standaloneCorrectionCents > 0) {
        const account = await tx.billingAccount.update({ where: { id: plan.account.id }, data: { balanceCents: { decrement: plan.standaloneCorrectionCents } }, select: { balanceCents: true } });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: plan.account.id,
            type: "billing_correction",
            description: "Removed imported Oakleaf opening balance not represented by an invoice",
            amountCents: -plan.standaloneCorrectionCents,
            balanceAfterCents: account.balanceCents,
            sourceSystem: "oakleaf_weekly_balance_normalization_2026_08_18",
            externalId: `oakleaf-weekly-balance-opening-correction:${plan.family.id}`,
            metadata: { sourceSha256: SOURCE_SHA256, targetWeeklyCents: plan.weeklyCents, paymentsChanged: false },
          },
        });
      }
      await tx.billingAccount.update({
        where: { id: plan.account.id },
        data: {
          customFields: input({
            ...object(plan.account.customFields),
            balanceNormalization: {
              source: "oakleaf_account_balance_summary",
              sourceSha256: SOURCE_SHA256,
              normalizedAt: appliedAt.toISOString(),
              target: "one_reviewed_weekly_rate",
              weeklyCents: plan.weeklyCents,
              retainedInvoiceIds: plan.currentWeek.map((invoice) => invoice.id),
              removedInvoiceIds: plan.removable.map((invoice) => invoice.id),
              standaloneCorrectionCents: plan.standaloneCorrectionCents,
              paymentsChanged: false,
            },
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: current.actor.tenantId,
          centerId: CENTER_ID,
          userId: current.actor.id,
          action: "billing.oakleaf_balance_normalized_to_weekly",
          resource: "Family",
          resourceId: plan.family.id,
          metadata: {
            sourceSha256: SOURCE_SHA256,
            previousBalanceCents: plan.account.balanceCents,
            weeklyCents: plan.weeklyCents,
            retainedInvoiceIds: plan.currentWeek.map((invoice) => invoice.id),
            voidedInvoiceIds: plan.removable.map((invoice) => invoice.id),
            invoiceReversalCents: plan.removableInvoiceCents,
            standaloneCorrectionCents: plan.standaloneCorrectionCents,
            paymentsChanged: false,
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 30_000 });
  }
  await prisma.center.update({ where: { id: CENTER_ID }, data: { updatedAt: new Date() } });

  const after = await prisma.family.findMany({
    where: { id: { in: before.plans.map((plan) => plan.family.id) } },
    select: { id: true, billingAccount: { select: { balanceCents: true, ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1, select: { balanceAfterCents: true } } } } },
  });
  for (const plan of before.plans) {
    const family = after.find((item) => item.id === plan.family.id);
    invariant(family?.billingAccount?.balanceCents === plan.weeklyCents, `${plan.family.name} final balance is not one weekly rate.`);
    invariant(family.billingAccount.ledgerEntries[0]?.balanceAfterCents === plan.weeklyCents, `${plan.family.name} final ledger balance is wrong.`);
  }
  console.log(JSON.stringify({
    ok: true,
    familiesNormalized: before.plans.length,
    invoicesVoided: before.plans.reduce((sum, plan) => sum + plan.removable.length, 0),
    invoiceReversalCents: before.plans.reduce((sum, plan) => sum + plan.removableInvoiceCents, 0),
    standaloneCorrectionCents: before.plans.reduce((sum, plan) => sum + plan.standaloneCorrectionCents, 0),
    finalBalanceCents: before.plans.reduce((sum, plan) => sum + plan.weeklyCents, 0),
    paymentsChanged: 0,
  }, null, 2));
}

async function main() {
  verifySource();
  const before = await load();
  const applyMode = process.argv.includes(APPLY);
  console.log(JSON.stringify({
    mode: applyMode ? "apply-preflight" : "dry-run",
    fingerprint: before.fingerprint,
    center: CENTER_NAME,
    familiesToNormalize: before.plans.length,
    invoicesToVoid: before.plans.reduce((sum, plan) => sum + plan.removable.length, 0),
    invoiceReversalCents: before.plans.reduce((sum, plan) => sum + plan.removableInvoiceCents, 0),
    standaloneCorrectionCents: before.plans.reduce((sum, plan) => sum + plan.standaloneCorrectionCents, 0),
    targetBalanceCents: before.plans.reduce((sum, plan) => sum + plan.weeklyCents, 0),
    paymentsToChange: 0,
  }, null, 2));
  if (!applyMode) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expected = process.argv.find((argument) => argument.startsWith(FINGERPRINT))?.slice(FINGERPRINT.length);
  invariant(expected, `Apply requires ${FINGERPRINT}<value>.`);
  await apply(expected);
}

main().finally(() => prisma.$disconnect());
