import "./load-env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const CENTER_NAME = "Kid City USA - Longmont";
const START = new Date("2026-08-01T00:00:00.000Z");

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const center = await prisma.center.findUnique({
    where: { id: CENTER_ID },
    select: { id: true, name: true, status: true },
  });
  if (center?.name !== CENTER_NAME || center.status === "closed") {
    throw new Error("Longmont center scope changed.");
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      billingAccount: { family: { centerId: CENTER_ID } },
      createdAt: { gte: START },
    },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      dueDate: true,
      createdAt: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      items: { select: { description: true, amountCents: true } },
      ledgerEntries: {
        select: {
          id: true,
          type: true,
          description: true,
          amountCents: true,
          balanceAfterCents: true,
          paymentId: true,
          effectiveAt: true,
          createdAt: true,
          sourceSystem: true,
          externalId: true,
          metadata: true,
        },
        orderBy: [{ createdAt: "asc" }],
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: { select: { id: true, name: true } },
          payments: {
            where: { paidAt: { gte: START } },
            select: { id: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { number: "asc" }],
  });

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      centerId: CENTER_ID,
      createdAt: { gte: START },
      OR: [
        { resource: "Invoice" },
        { action: { contains: "billing", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      action: true,
      resource: true,
      resourceId: true,
      metadata: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const childIds = [...new Set(invoices
    .map((invoice) => text(object(invoice.customFields).childId))
    .filter(Boolean))];
  const children = await prisma.child.findMany({
    where: { id: { in: childIds }, family: { centerId: CENTER_ID } },
    select: { id: true, fullName: true, enrollmentStatus: true, customFields: true, updatedAt: true },
  });
  const planIds = [...new Set(children
    .map((child) => text(object(child.customFields).tuitionPlanId))
    .filter(Boolean))];
  const plans = await prisma.tuitionPlan.findMany({
    where: { id: { in: planIds }, centerId: CENTER_ID },
    select: { id: true, name: true, cadence: true, amountCents: true },
  });
  const childAuditLogs = await prisma.auditLog.findMany({
    where: {
      centerId: CENTER_ID,
      resource: "Child",
      resourceId: { in: childIds },
      createdAt: { gte: START },
      action: { contains: "billing", mode: "insensitive" },
    },
    select: {
      id: true,
      action: true,
      resourceId: true,
      metadata: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  const childById = new Map(children.map((child) => [child.id, child]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const logsByResource = new Map<string, typeof auditLogs>();
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  for (const log of auditLogs) {
    if (!log.resourceId) continue;
    const current = logsByResource.get(log.resourceId) ?? [];
    current.push(log);
    logsByResource.set(log.resourceId, current);
  }

  const rows = invoices.map((invoice) => {
    const fields = object(invoice.customFields);
    const logs = logsByResource.get(invoice.id) ?? [];
    const childId = text(fields.childId);
    const child = childById.get(childId);
    const childFields = object(child?.customFields);
    const currentPlanId = text(childFields.tuitionPlanId);
    return {
      id: invoice.id,
      number: invoice.number,
      familyId: invoice.billingAccount.family.id,
      familyName: invoice.billingAccount.family.name,
      billingAccountId: invoice.billingAccount.id,
      accountBalanceCents: invoice.billingAccount.balanceCents,
      status: invoice.status,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      sourceSystem: invoice.sourceSystem,
      externalId: invoice.externalId,
      chargeSource: text(fields.chargeSource),
      billingPeriod: text(fields.billingPeriod),
      billingCadence: text(fields.billingCadence),
      childId,
      sourceId: text(fields.sourceId),
      tuitionPlanName: text(fields.tuitionPlanName),
      recoveryManifestFingerprint: text(fields.recoveryManifestFingerprint),
      voidReason: text(fields.voidReason),
      voidedAt: text(fields.voidedAt),
      voidedByEmail: text(fields.voidedByEmail),
      duplicateOfInvoiceId: text(fields.duplicateOfInvoiceId),
      duplicateOfInvoiceNumber: text(fields.duplicateOfInvoiceNumber),
      items: invoice.items,
      ledger: invoice.ledgerEntries,
      recentPayments: invoice.billingAccount.payments,
      auditLogs: logs,
      currentChild: child ? {
        id: child.id,
        fullName: child.fullName,
        enrollmentStatus: child.enrollmentStatus,
        updatedAt: child.updatedAt,
        tuitionBillingEnabled: childFields.tuitionBillingEnabled === true,
        tuitionPlanId: currentPlanId,
        tuitionPlanName: text(childFields.tuitionPlanName),
        tuitionPlanAmountCents: Number(childFields.tuitionPlanAmountCents),
        tuitionBillingCadence: text(childFields.tuitionBillingCadence || childFields.tuitionPlanCadence),
        tuitionBillingStartsPeriod: text(childFields.tuitionBillingStartsPeriod),
        tuitionBillingUpdatedAt: text(childFields.tuitionBillingUpdatedAt),
        tuitionBillingUpdatedBy: text(childFields.tuitionBillingUpdatedBy),
        plan: planById.get(currentPlanId) ?? null,
        auditLogs: childAuditLogs.filter((log) => log.resourceId === child.id),
      } : null,
    };
  });

  const voided = rows.filter((invoice) => invoice.status === "VOID");
  const active = rows.filter((invoice) => invoice.status !== "VOID");
  console.log(JSON.stringify({
    asOf: new Date().toISOString(),
    center,
    counts: {
      invoices: rows.length,
      voided: voided.length,
      voidedCents: voided.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      active: active.length,
      activeCents: active.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    },
    voided,
    active,
    unlinkedBillingAuditLogs: auditLogs.filter((log) => !log.resourceId || !invoiceIds.has(log.resourceId)),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
