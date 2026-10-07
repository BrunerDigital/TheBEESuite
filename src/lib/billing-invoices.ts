import { randomUUID } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { applyAccountCreditToInvoice } from "./stripe-payment-application";
import { AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM } from "./parent-billing-visibility";
import { invoiceResponsibilityReviewExempt, invoiceResponsibilitySeparation } from "./invoice-responsibility-separation";

export type BillingInvoiceLineItem = {
  description: string;
  amountCents: number;
  productId?: string | null;
  ledgerType?: string;
  creditCategory?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `INV-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function metadataJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonObject;
}

// A batch holds every account it may invoice before the first invoice updates
// the school. The recurring tuition job also locks account before school.
export async function lockBatchInvoiceAccounts(
  tx: Prisma.TransactionClient,
  familyIds: string[],
  centerId: string,
) {
  const sortedFamilyIds = [...new Set(familyIds)].sort();
  if (!sortedFamilyIds.length) return;
  await tx.billingAccount.createMany({
    data: sortedFamilyIds.map((familyId) => ({ familyId, balanceCents: 0 })),
    skipDuplicates: true,
  });
  const accounts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "BillingAccount"
    WHERE "familyId" IN (${Prisma.join(sortedFamilyIds)})
    ORDER BY "id" FOR UPDATE
  `);
  if (accounts.length !== sortedFamilyIds.length) throw new Error("Batch billing accounts changed during invoice creation.");
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Center" WHERE "id" = ${centerId} FOR UPDATE`);
}

export async function createBillingInvoiceForFamily(
  tx: Prisma.TransactionClient,
  input: {
    familyId: string;
    dueDate: Date;
    items: BillingInvoiceLineItem[];
    description: string;
    customFields: Record<string, unknown>;
  },
) {
  const totalCents = input.items.reduce((sum, item) => sum + item.amountCents, 0);
  if (totalCents <= 0) throw new Error("Invoice total must be greater than zero.");

  const billingAccount = await tx.billingAccount.upsert({
    where: { familyId: input.familyId },
    update: {},
    create: { familyId: input.familyId, balanceCents: 0 },
    include: { family: { select: { centerId: true } } },
  });

  const dedupeKey = clean(input.customFields.dedupeKey);
  if (dedupeKey) {
    const existing = await tx.invoice.findFirst({
      where: {
        billingAccountId: billingAccount.id,
        customFields: { path: ["dedupeKey"], equals: dedupeKey },
      },
      select: { id: true, number: true, totalCents: true },
    });
    if (existing) return { invoice: existing, created: false as const, totalCents: 0 };
  }

  const invoice = await tx.invoice.create({
    data: {
      billingAccountId: billingAccount.id,
      number: invoiceNumber(),
      status: PaymentStatus.OPEN,
      dueDate: input.dueDate,
      totalCents,
      sourceSystem: "bee_suite",
      customFields: metadataJson(input.customFields),
      items: {
        create: input.items.map((item) => ({
          description: item.description,
          amountCents: item.amountCents,
          productId: item.productId || undefined,
        })),
      },
    },
    select: { id: true, number: true, totalCents: true },
  });

  const updatedAccount = await tx.billingAccount.update({
    where: { id: billingAccount.id },
    data: { balanceCents: { increment: totalCents } },
  });

  const itemizedLedger = input.items.some((item) => item.ledgerType || item.creditCategory);
  if (itemizedLedger) {
    let runningBalance = updatedAccount.balanceCents - totalCents;
    for (const [index, item] of input.items.entries()) {
      runningBalance += item.amountCents;
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: billingAccount.id,
          invoiceId: invoice.id,
          type: item.ledgerType || "invoice",
          description: item.description,
          amountCents: item.amountCents,
          balanceAfterCents: runningBalance,
          sourceSystem: "bee_suite",
          externalId: `invoice:${invoice.id}:item:${index}`,
          metadata: metadataJson({
            ...input.customFields,
            invoiceTotalCents: totalCents,
            lineItemIndex: index,
            creditCategory: item.creditCategory ?? null,
          }),
        },
      });
    }
  } else {
    await tx.ledgerEntry.create({
      data: {
        billingAccountId: billingAccount.id,
        invoiceId: invoice.id,
        type: "invoice",
        description: input.description,
        amountCents: totalCents,
        balanceAfterCents: updatedAccount.balanceCents,
        sourceSystem: "bee_suite",
        externalId: `invoice:${invoice.id}`,
        metadata: metadataJson(input.customFields),
      },
    });
  }

  // A successful advance payment already reduced the account balance. Settlement
  // only links that credit to the invoice; its zero-dollar ledger marker must not
  // reduce the balance a second time. Partial coverage remains in the net balance
  // and is consumed by the existing credit-first checkout/autopay allocation.
  if (input.customFields.chargeSource === "tuitionPlan" && updatedAccount.balanceCents <= 0 && !invoiceResponsibilitySeparation(input.customFields)) {
    const agencyActivity = await tx.ledgerEntry.findFirst({
      where: { billingAccountId: billingAccount.id, OR: [
        { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
      ] }, select: { id: true },
    });
    let familyOnly = invoiceResponsibilityReviewExempt(input.customFields, totalCents);
    if (agencyActivity && !familyOnly) {
      const assignmentEvidence = await tx.child.findMany({ where: { familyId: input.familyId }, select: { id: true, customFields: true } });
      familyOnly = invoiceResponsibilityReviewExempt(input.customFields, totalCents, ...assignmentEvidence);
    }
    if (!agencyActivity || familyOnly) {
      await applyAccountCreditToInvoice(tx, { invoiceId: invoice.id });
    }
  }

  if (billingAccount.family.centerId) {
    await tx.center.update({
      where: { id: billingAccount.family.centerId },
      data: { updatedAt: new Date() },
    });
  }

  return { invoice, created: true as const, totalCents };
}
