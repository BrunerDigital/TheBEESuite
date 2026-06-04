import { randomUUID } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";

export type BillingInvoiceLineItem = {
  description: string;
  amountCents: number;
  productId?: string | null;
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

  return { invoice, created: true as const, totalCents };
}
