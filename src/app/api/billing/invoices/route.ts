import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessAllCenters, canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import {
  agencyPaymentDescription,
  billingDedupeKey,
  normalizeAgencyPaymentMetadata,
  normalizeBatchTarget,
  normalizeBillingPeriod,
  normalizeRecurringBillingPeriod,
  parseCurrencyCents,
  planFamilyRefundAllocations,
} from "@/lib/billing-workflows";
import { productInvoiceFieldsForProduct, productPurchaseTotals } from "@/lib/product-billing";
import { prisma } from "@/lib/prisma";
import { createStripeRefund } from "@/lib/integrations";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type CurrentBillingUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type ChargeResolution = {
  chargeSource: "tuitionPlan" | "product" | "custom";
  sourceId: string;
  description: string;
  amountCents: number;
  productId?: string | null;
  ageGroup?: string | null;
  cadence?: string | null;
  customFields?: Record<string, unknown>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (!text) return new Date();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isAll(value: string) {
  return !value || value.toLowerCase() === "all";
}

function amountCentsFromBody(body: Record<string, unknown>) {
  if (clean(body.amountDollars)) return parseCurrencyCents(body.amountDollars);
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) return Math.round(body.amountCents);
  const amountCents = Number.parseInt(clean(body.amountCents), 10);
  return Number.isFinite(amountCents) ? amountCents : 0;
}

async function assertCenterAccess(user: CurrentBillingUser, centerId: string) {
  if (!centerId) return { ok: false as const, status: 400, error: "Center is required." };
  if (!canAccessCenter(user, centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this school." };
  }
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, crmLocationId: true },
  });
  if (!center) return { ok: false as const, status: 404, error: "School not found." };
  return { ok: true as const, center };
}

async function assertFamilyAccess(user: CurrentBillingUser, familyId: string) {
  if (!familyId) return { ok: false as const, status: 400, error: "Family is required." };
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      centerId: true,
      name: true,
      children: { select: { id: true, fullName: true, ageGroup: true, enrollmentStatus: true } },
    },
  });
  if (!family) return { ok: false as const, status: 404, error: "Family not found." };
  if (!family.centerId || !canAccessCenter(user, family.centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this family." };
  }
  return { ok: true as const, family, centerId: family.centerId };
}

async function resolveCharge(body: Record<string, unknown>): Promise<
  | { ok: true; charge: ChargeResolution }
  | { ok: false; status: number; error: string }
> {
  const chargeSource = clean(body.chargeSource);
  const productId = clean(body.productId);
  const tuitionPlanId = clean(body.tuitionPlanId);

  if (chargeSource === "product" || productId) {
    if (!productId) return { ok: false, status: 400, error: "Product or fee is required." };
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { ok: false, status: 404, error: "Product or fee not found." };
    return {
      ok: true,
      charge: {
        chargeSource: "product",
        sourceId: product.id,
        description: clean(body.description) || product.name,
        amountCents: productPurchaseTotals(product, clean(body.quantity) || undefined).totalCents,
        productId: product.id,
        customFields: productInvoiceFieldsForProduct(product, clean(body.quantity) || undefined),
      },
    };
  }

  if (chargeSource === "tuitionPlan" || tuitionPlanId) {
    if (!tuitionPlanId) return { ok: false, status: 400, error: "Tuition plan is required." };
    const plan = await prisma.tuitionPlan.findUnique({ where: { id: tuitionPlanId } });
    if (!plan) return { ok: false, status: 404, error: "Tuition plan not found." };
    return {
      ok: true,
      charge: {
        chargeSource: "tuitionPlan",
        sourceId: plan.id,
        description: clean(body.description) || plan.name,
        amountCents: plan.amountCents,
        ageGroup: plan.ageGroup,
        cadence: plan.cadence,
      },
    };
  }

  const amountCents = amountCentsFromBody(body);
  const description = clean(body.description);
  if (amountCents <= 0 || !description) {
    return { ok: false, status: 400, error: "Custom charges require a description and amount." };
  }
  return {
    ok: true,
    charge: {
      chargeSource: "custom",
      sourceId: `custom:${description.toLowerCase().replace(/\s+/g, "-").slice(0, 80)}`,
      description,
      amountCents,
    },
  };
}

async function createSingleInvoice(user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyAccess = await assertFamilyAccess(user, clean(body.familyId));
  if (!familyAccess.ok) return NextResponse.json({ ok: false, error: familyAccess.error }, { status: familyAccess.status });

  const chargeResult = await resolveCharge(body);
  if (!chargeResult.ok) return NextResponse.json({ ok: false, error: chargeResult.error }, { status: chargeResult.status });

  const dueDate = parseDate(body.dueDate);
  const billingPeriod = chargeResult.ok && chargeResult.charge.chargeSource === "tuitionPlan"
    ? normalizeRecurringBillingPeriod(body.billingPeriod, dueDate, chargeResult.charge.cadence)
    : normalizeBillingPeriod(body.billingPeriod, dueDate);
  const childId = clean(body.childId);
  const child = childId ? familyAccess.family.children.find((item) => item.id === childId) : null;
  if (childId && !child) {
    return NextResponse.json({ ok: false, error: "Child is not linked to this family." }, { status: 403 });
  }

  const charge = chargeResult.charge;
  const dedupeKey = billingDedupeKey({
    familyId: familyAccess.family.id,
    chargeSource: charge.chargeSource,
    sourceId: charge.sourceId,
    billingPeriod,
    childIds: child ? [child.id] : undefined,
  });
  const itemDescription = child ? `${charge.description} - ${child.fullName}` : charge.description;

  const result = await prisma.$transaction((tx) =>
    createBillingInvoiceForFamily(tx, {
      familyId: familyAccess.family.id,
      dueDate,
      description: itemDescription,
      items: [{ description: itemDescription, amountCents: charge.amountCents, productId: charge.productId }],
      customFields: {
        mode: "single",
        chargeSource: charge.chargeSource,
        sourceId: charge.sourceId,
        ...(charge.customFields ?? {}),
        ...(charge.chargeSource === "product" ? { itemSummary: itemDescription } : {}),
        billingPeriod,
        centerId: familyAccess.centerId,
        childId: child?.id ?? null,
        dedupeKey,
      },
    }),
  );

  await writeAuditLog(user, {
    centerId: familyAccess.centerId,
    action: result.created ? "billing.invoice.created" : "billing.invoice.skipped_duplicate",
    resource: "Invoice",
    resourceId: result.invoice.id,
    metadata: {
      familyId: familyAccess.family.id,
      amountCents: result.invoice.totalCents,
      billingPeriod,
      chargeSource: charge.chargeSource,
      sourceId: charge.sourceId,
    },
  });

  return NextResponse.json({
    ok: true,
    created: result.created ? 1 : 0,
    skipped: result.created ? 0 : 1,
    invoice: result.invoice,
  });
}

async function createBatchInvoices(user: CurrentBillingUser, body: Record<string, unknown>) {
  const centerAccess = await assertCenterAccess(user, clean(body.centerId));
  if (!centerAccess.ok) return NextResponse.json({ ok: false, error: centerAccess.error }, { status: centerAccess.status });

  const chargeResult = await resolveCharge(body);
  if (!chargeResult.ok) return NextResponse.json({ ok: false, error: chargeResult.error }, { status: chargeResult.status });

  const charge = chargeResult.charge;
  const dueDate = parseDate(body.dueDate);
  const billingPeriod = charge.chargeSource === "tuitionPlan"
    ? normalizeRecurringBillingPeriod(body.billingPeriod, dueDate, charge.cadence)
    : normalizeBillingPeriod(body.billingPeriod, dueDate);
  const batchTarget = normalizeBatchTarget(body.batchTarget);
  const enrollmentStatus = clean(body.enrollmentStatus) || "enrolled";
  const ageGroup = clean(body.ageGroup) || charge.ageGroup || "";
  const childWhere: Prisma.ChildWhereInput = {
    family: { is: { centerId: centerAccess.center.id } },
    ...(isAll(enrollmentStatus) ? {} : { enrollmentStatus }),
    ...(isAll(ageGroup) ? {} : { ageGroup }),
  };

  const groups = new Map<string, { familyId: string; familyName: string; children: Array<{ id: string; fullName: string }> }>();

  if (batchTarget === "family") {
    const families = await prisma.family.findMany({
      where: {
        centerId: centerAccess.center.id,
        children: { some: childWhere },
      },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    });
    for (const family of families) {
      groups.set(family.id, { familyId: family.id, familyName: family.name, children: [] });
    }
  } else {
    const children = await prisma.child.findMany({
      where: childWhere,
      orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
      take: 1000,
      select: {
        id: true,
        fullName: true,
        familyId: true,
        family: { select: { name: true } },
      },
    });
    for (const child of children) {
      const group = groups.get(child.familyId) ?? {
        familyId: child.familyId,
        familyName: child.family.name,
        children: [],
      };
      group.children.push({ id: child.id, fullName: child.fullName });
      groups.set(child.familyId, group);
    }
  }

  const invoiceGroups = Array.from(groups.values());
  if (!invoiceGroups.length) {
    return NextResponse.json({ ok: false, error: "No families or children matched this billing run." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let skipped = 0;
    let totalCents = 0;
    const invoices: Array<{ id: string; number: string; totalCents: number }> = [];

    for (const group of invoiceGroups) {
      const childIds = group.children.map((child) => child.id);
      const items = batchTarget === "family"
        ? [{ description: charge.description, amountCents: charge.amountCents, productId: charge.productId }]
        : group.children.map((child) => ({
            description: `${charge.description} - ${child.fullName}`,
            amountCents: charge.amountCents,
            productId: charge.productId,
          }));
      const dedupeKey = billingDedupeKey({
        familyId: group.familyId,
        chargeSource: charge.chargeSource,
        sourceId: charge.sourceId,
        billingPeriod,
        batchTarget,
        childIds,
      });
      const createdInvoice = await createBillingInvoiceForFamily(tx, {
        familyId: group.familyId,
        dueDate,
        description: charge.description,
        items,
        customFields: {
          mode: "batch",
          batchTarget,
          chargeSource: charge.chargeSource,
          sourceId: charge.sourceId,
          ...(charge.customFields ?? {}),
          billingPeriod,
          centerId: centerAccess.center.id,
          ageGroup: isAll(ageGroup) ? null : ageGroup,
          enrollmentStatus: isAll(enrollmentStatus) ? null : enrollmentStatus,
          childIds,
          dedupeKey,
        },
      });
      if (createdInvoice.created) {
        created += 1;
        totalCents += createdInvoice.totalCents;
      } else {
        skipped += 1;
      }
      invoices.push(createdInvoice.invoice);
    }

    return { created, skipped, totalCents, invoices };
  });

  await writeAuditLog(user, {
    centerId: centerAccess.center.id,
    action: "billing.invoice_batch.completed",
    resource: "Invoice",
    metadata: {
      centerId: centerAccess.center.id,
      billingPeriod,
      batchTarget,
      chargeSource: charge.chargeSource,
      sourceId: charge.sourceId,
      created: result.created,
      skipped: result.skipped,
      totalCents: result.totalCents,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}

async function createLedgerAdjustment(user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyAccess = await assertFamilyAccess(user, clean(body.familyId));
  if (!familyAccess.ok) return NextResponse.json({ ok: false, error: familyAccess.error }, { status: familyAccess.status });

  const amountCents = amountCentsFromBody(body);
  if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Adjustment amount is required." }, { status: 400 });

  const adjustmentType = clean(body.adjustmentType).toLowerCase() === "debit" ? "debit" : "credit";
  const ledgerAmountCents = adjustmentType === "credit" ? -amountCents : amountCents;
  const description = clean(body.description) || (adjustmentType === "credit" ? "Account credit" : "Manual billing adjustment");

  const entry = await prisma.$transaction(async (tx) => {
    const account = await tx.billingAccount.upsert({
      where: { familyId: familyAccess.family.id },
      update: {},
      create: { familyId: familyAccess.family.id, balanceCents: 0 },
    });
    const updatedAccount = await tx.billingAccount.update({
      where: { id: account.id },
      data: { balanceCents: { increment: ledgerAmountCents } },
    });
    return tx.ledgerEntry.create({
      data: {
        billingAccountId: account.id,
        type: adjustmentType,
        description,
        amountCents: ledgerAmountCents,
        balanceAfterCents: updatedAccount.balanceCents,
        sourceSystem: "bee_suite_manual",
        externalId: `manual:${randomUUID()}`,
        metadata: {
          enteredBy: user.email,
          adjustmentType,
          familyId: familyAccess.family.id,
        },
      },
    });
  });

  await writeAuditLog(user, {
    centerId: familyAccess.centerId,
    action: "billing.ledger_adjustment.created",
    resource: "LedgerEntry",
    resourceId: entry.id,
    metadata: {
      familyId: familyAccess.family.id,
      amountCents: ledgerAmountCents,
      adjustmentType,
    },
  });

  return NextResponse.json({ ok: true, entry });
}

async function createAgencyPayment(user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyAccess = await assertFamilyAccess(user, clean(body.familyId));
  if (!familyAccess.ok) return NextResponse.json({ ok: false, error: familyAccess.error }, { status: familyAccess.status });

  const amountCents = amountCentsFromBody(body);
  if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Agency payment amount is required." }, { status: 400 });

  const childId = clean(body.childId);
  const child = childId ? familyAccess.family.children.find((item) => item.id === childId) : null;
  if (childId && !child) {
    return NextResponse.json({ ok: false, error: "Child is not linked to this family." }, { status: 403 });
  }

  const metadata = normalizeAgencyPaymentMetadata({
    agencyName: body.agencyName,
    authorizationNumber: body.authorizationNumber,
    externalReference: body.externalReference,
    coverageStart: body.coverageStart,
    coverageEnd: body.coverageEnd,
    notes: body.notes,
  });
  if (!metadata.agencyName) {
    return NextResponse.json({ ok: false, error: "Agency name is required." }, { status: 400 });
  }

  const paidAt = parseDate(body.paidAt);
  const ledgerAmountCents = -amountCents;
  const description = clean(body.description) || agencyPaymentDescription({
    agencyName: metadata.agencyName,
    childName: child?.fullName,
    coverageStart: metadata.coverageStart,
    coverageEnd: metadata.coverageEnd,
  });

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.billingAccount.upsert({
      where: { familyId: familyAccess.family.id },
      update: {},
      create: { familyId: familyAccess.family.id, balanceCents: 0 },
    });
    const payment = await tx.payment.create({
      data: {
        billingAccountId: account.id,
        amountCents,
        status: PaymentStatus.PAID,
        provider: "subsidy_agency",
        externalIdPlaceholder: metadata.externalReference || `agency:${randomUUID()}`,
        paidAt,
        customFields: {
          paymentType: "subsidy_agency",
          agencyName: metadata.agencyName,
          authorizationNumber: metadata.authorizationNumber || null,
          externalReference: metadata.externalReference || null,
          coverageStart: metadata.coverageStart || null,
          coverageEnd: metadata.coverageEnd || null,
          childId: child?.id ?? null,
          childName: child?.fullName ?? null,
          familyId: familyAccess.family.id,
          centerId: familyAccess.centerId,
          notes: metadata.notes || null,
          enteredBy: user.email,
        },
      },
    });
    const updatedAccount = await tx.billingAccount.update({
      where: { id: account.id },
      data: { balanceCents: { increment: ledgerAmountCents } },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        billingAccountId: account.id,
        paymentId: payment.id,
        type: "agency_payment",
        description,
        amountCents: ledgerAmountCents,
        balanceAfterCents: updatedAccount.balanceCents,
        effectiveAt: paidAt,
        sourceSystem: "subsidy_agency",
        externalId: `agency:${payment.id}`,
        metadata: {
          paymentType: "subsidy_agency",
          agencyName: metadata.agencyName,
          authorizationNumber: metadata.authorizationNumber || null,
          externalReference: metadata.externalReference || null,
          coverageStart: metadata.coverageStart || null,
          coverageEnd: metadata.coverageEnd || null,
          childId: child?.id ?? null,
          childName: child?.fullName ?? null,
          familyId: familyAccess.family.id,
          centerId: familyAccess.centerId,
          notes: metadata.notes || null,
          enteredBy: user.email,
        },
      },
    });
    return { payment, entry };
  });

  await writeAuditLog(user, {
    centerId: familyAccess.centerId,
    action: "billing.agency_payment.created",
    resource: "Payment",
    resourceId: result.payment.id,
    metadata: {
      familyId: familyAccess.family.id,
      childId: child?.id ?? null,
      amountCents,
      agencyName: metadata.agencyName,
      authorizationNumber: metadata.authorizationNumber || null,
      externalReference: metadata.externalReference || null,
      coverageStart: metadata.coverageStart || null,
      coverageEnd: metadata.coverageEnd || null,
    },
  });

  return NextResponse.json({ ok: true, created: 1, skipped: 0, totalCents: amountCents, payment: result.payment, entry: result.entry });
}

async function createManualCheckPayment(user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyAccess = await assertFamilyAccess(user, clean(body.familyId));
  if (!familyAccess.ok) return NextResponse.json({ ok: false, error: familyAccess.error }, { status: familyAccess.status });
  const amountCents = amountCentsFromBody(body);
  if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Check payment amount is required." }, { status: 400 });
  const checkNumber = clean(body.checkNumber);
  if (!checkNumber) return NextResponse.json({ ok: false, error: "Check number or reference is required." }, { status: 400 });
  const paidAt = parseDate(body.paidAt);
  const description = clean(body.description) || `Check payment #${checkNumber}`;
  const notes = clean(body.notes);

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.billingAccount.upsert({
      where: { familyId: familyAccess.family.id },
      update: {},
      create: { familyId: familyAccess.family.id, balanceCents: 0 },
    });
    const payment = await tx.payment.create({
      data: {
        billingAccountId: account.id,
        amountCents,
        status: PaymentStatus.PAID,
        provider: "manual_check",
        externalIdPlaceholder: `check:${checkNumber}:${randomUUID()}`,
        paidAt,
        customFields: {
          paymentType: "manual_check",
          checkNumber,
          notes: notes || null,
          enteredBy: user.email,
          familyId: familyAccess.family.id,
          centerId: familyAccess.centerId,
        },
      },
    });
    const updatedAccount = await tx.billingAccount.update({
      where: { id: account.id },
      data: { balanceCents: { decrement: amountCents } },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        billingAccountId: account.id,
        paymentId: payment.id,
        type: "check_payment",
        description,
        amountCents: -amountCents,
        balanceAfterCents: updatedAccount.balanceCents,
        effectiveAt: paidAt,
        sourceSystem: "bee_suite_manual_check",
        externalId: `check:${payment.id}`,
        metadata: { checkNumber, notes: notes || null, enteredBy: user.email },
      },
    });
    return { payment, entry };
  });

  await writeAuditLog(user, {
    centerId: familyAccess.centerId,
    action: "billing.check_payment.created",
    resource: "Payment",
    resourceId: result.payment.id,
    metadata: { familyId: familyAccess.family.id, amountCents, checkNumber },
  });
  return NextResponse.json({ ok: true, totalCents: amountCents, payment: result.payment, entry: result.entry });
}

async function refundStripePayment(user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyId = clean(body.familyId);
  if (!familyId) return NextResponse.json({ ok: false, error: "Choose a family to refund." }, { status: 400 });
  const amountCents = amountCentsFromBody(body);
  if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Refund amount is required." }, { status: 400 });
  const reason = clean(body.reason) || clean(body.description);
  if (!reason) return NextResponse.json({ ok: false, error: "Refund reason is required." }, { status: 400 });

  const account = await prisma.billingAccount.findUnique({
    where: { familyId },
    select: {
      id: true,
      family: { select: { centerId: true, name: true } },
      payments: {
        where: { provider: "stripe", status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } },
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        select: {
          id: true, amountCents: true, status: true, externalIdPlaceholder: true, customFields: true,
          ledgerEntries: { where: { invoiceId: { not: null } }, orderBy: { effectiveAt: "desc" }, take: 1, select: { invoiceId: true } },
        },
      },
    },
  });
  if (!account) return NextResponse.json({ ok: false, error: "Family billing account not found." }, { status: 404 });
  if (!account.family.centerId || !canAccessCenter(user, account.family.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  }

  const preferredIds = Array.isArray(body.paymentIds)
    ? body.paymentIds.map((value) => clean(value)).filter(Boolean)
    : clean(body.paymentId) ? [clean(body.paymentId)] : [];
  const candidates = account.payments
    .map((payment) => {
      const fields = jsonObject(payment.customFields);
      const refundedCents = Math.max(0, Number(fields.stripeAmountRefundedCents) || 0);
      const paymentIntentId = clean(fields.stripePaymentIntentId) || (clean(payment.externalIdPlaceholder).startsWith("pi_") ? clean(payment.externalIdPlaceholder) : "");
      return { ...payment, fields, refundedCents, refundableCents: Math.max(0, payment.amountCents - refundedCents), paymentIntentId };
    })
    .filter((payment) => payment.refundableCents > 0 && payment.paymentIntentId);
  const refundPlan = planFamilyRefundAllocations(candidates, amountCents, preferredIds);
  const availableCents = refundPlan.availableCents;
  if (amountCents > availableCents) {
    return NextResponse.json({
      ok: false,
      error: `Stripe can return ${moneyLabel(availableCents)} across this family's completed payments. Use a family credit or manual reimbursement for the remaining ${moneyLabel(amountCents - availableCents)}.`,
      availableCents,
    }, { status: 400 });
  }

  const operationId = randomUUID();
  const allocations: Array<{ paymentId: string; stripeRefundId: string; amountCents: number }> = [];
  for (const planned of refundPlan.allocations) {
    const payment = planned.payment;
    const allocationCents = planned.amountCents;
    const connectedAccountId = clean(payment.fields.stripeConnectedAccountId) || null;
    const refund = await createStripeRefund({
      paymentIntentId: payment.paymentIntentId,
      amountCents: allocationCents,
      reason,
      connectedAccountId,
      idempotencyKey: `billing-family-refund:${operationId}:${payment.id}`,
      tenantId: user.tenantId,
      metadata: { paymentId: payment.id, familyId, requestedByUserId: user.id, operationId },
    });
    if (!refund.ok || !refund.refund?.id) {
      if (!allocations.length) return NextResponse.json({ ok: false, error: refund.error || "Refund could not be issued." }, { status: refund.configured ? 502 : 503 });
      break;
    }
    const refundedAmountCents = refund.refund.amountCents;
    const totalRefundedCents = payment.refundedCents + refundedAmountCents;
    const invoiceId = payment.ledgerEntries[0]?.invoiceId ?? null;
    await prisma.$transaction(async (tx) => {
      const updatedAccount = await tx.billingAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: refundedAmountCents } } });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: totalRefundedCents >= payment.amountCents ? PaymentStatus.REFUNDED : PaymentStatus.PAID,
          customFields: {
            ...payment.fields,
            stripeAmountRefundedCents: totalRefundedCents,
            stripeFullyRefunded: totalRefundedCents >= payment.amountCents,
            latestStripeRefundId: refund.refund!.id,
            latestRefundReason: reason,
            latestRefundedBy: user.email,
            latestFamilyRefundOperationId: operationId,
            status: totalRefundedCents >= payment.amountCents ? "refunded" : "partially_refunded",
          },
        },
      });
      if (invoiceId) await tx.invoice.update({ where: { id: invoiceId }, data: { status: PaymentStatus.OPEN } });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id, invoiceId, paymentId: payment.id, type: "refund", description: `Refund: ${reason}`,
          amountCents: refundedAmountCents, balanceAfterCents: updatedAccount.balanceCents, sourceSystem: "stripe",
          externalId: `stripe-refund:${refund.refund!.id}`,
          metadata: { stripeRefundId: refund.refund!.id, stripePaymentIntentId: payment.paymentIntentId, refundReason: reason, refundedBy: user.email, totalRefundedCents, familyRefundOperationId: operationId },
        },
      });
    });
    allocations.push({ paymentId: payment.id, stripeRefundId: refund.refund.id, amountCents: refundedAmountCents });
  }

  const totalCents = allocations.reduce((total, allocation) => total + allocation.amountCents, 0);
  await writeAuditLog(user, {
    centerId: account.family.centerId,
    action: "billing.family.refunded",
    resource: "Family",
    resourceId: familyId,
    metadata: { requestedAmountCents: amountCents, refundedAmountCents: totalCents, reason, familyId, operationId, paymentIds: allocations.map((item) => item.paymentId), stripeRefundIds: allocations.map((item) => item.stripeRefundId) },
  });
  return NextResponse.json({
    ok: true,
    totalCents,
    requestedCents: amountCents,
    allocations,
    partial: totalCents < amountCents,
    warning: totalCents < amountCents ? `${moneyLabel(totalCents)} was sent before Stripe stopped the remaining allocation.` : null,
  });
}

async function updateInvoice(user: CurrentBillingUser, body: Record<string, unknown>) {
  const invoiceId = clean(body.invoiceId) || clean(body.id);
  if (!invoiceId) return NextResponse.json({ ok: false, error: "Invoice is required." }, { status: 400 });

  const amountProvided = clean(body.amountDollars) || body.amountCents !== undefined;
  const nextTotalCents = amountProvided ? amountCentsFromBody(body) : null;
  if (amountProvided && (!nextTotalCents || nextTotalCents <= 0)) {
    return NextResponse.json({ ok: false, error: "Invoice amount must be greater than zero." }, { status: 400 });
  }

  const dueDateText = clean(body.dueDate);
  const nextDueDate = dueDateText ? new Date(dueDateText) : null;
  if (nextDueDate && Number.isNaN(nextDueDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Invoice due date is not valid." }, { status: 400 });
  }

  const descriptionProvided = Object.prototype.hasOwnProperty.call(body, "description");
  const requestedDescription = descriptionProvided ? clean(body.description) : "";
  if (descriptionProvided && !requestedDescription) {
    return NextResponse.json({ ok: false, error: "Invoice details are required." }, { status: 400 });
  }

  if (!amountProvided && !nextDueDate && !descriptionProvided) {
    return NextResponse.json({ ok: false, error: "Provide an amount, due date, or invoice details to update." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: { select: { id: true, name: true, centerId: true } },
        },
      },
      items: { orderBy: { id: "asc" }, select: { id: true, description: true, amountCents: true, productId: true } },
    },
  });
  if (!invoice) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });

  const requestedFamilyId = clean(body.familyId);
  if (requestedFamilyId && requestedFamilyId !== invoice.billingAccount.family.id) {
    return NextResponse.json({ ok: false, error: "Invoice does not belong to the selected family." }, { status: 403 });
  }
  const centerId = invoice.billingAccount.family.centerId;
  if (!centerId || !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this invoice." }, { status: 403 });
  }
  if (invoice.status !== PaymentStatus.OPEN) {
    return NextResponse.json({ ok: false, error: "Only open invoices can be edited." }, { status: 400 });
  }

  const currentDescription = invoice.items[0]?.description || clean((jsonObject(invoice.customFields)).description) || invoice.number;
  const description = descriptionProvided ? requestedDescription : currentDescription;
  const totalCents = nextTotalCents ?? invoice.totalCents;
  const dueDate = nextDueDate ?? invoice.dueDate;
  const amountDeltaCents = totalCents - invoice.totalCents;
  const amountChanged = amountDeltaCents !== 0;
  const dueDateChanged = dueDate.getTime() !== invoice.dueDate.getTime();
  const descriptionChanged = description !== currentDescription;

  if (!amountChanged && !dueDateChanged && !descriptionChanged) {
    return NextResponse.json({
      ok: true,
      updated: false,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        dueDate: invoice.dueDate,
        totalCents: invoice.totalCents,
        items: invoice.items,
      },
      deltaCents: 0,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const currentFields = jsonObject(invoice.customFields);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalCents,
        dueDate,
        customFields: {
          ...currentFields,
          lastEditedAt: now.toISOString(),
          lastEditedByUserId: user.id,
          lastEditedByEmail: user.email,
          lastEditReason: clean(body.reason) || "Director invoice edit",
          lastEditPreviousTotalCents: invoice.totalCents,
          lastEditPreviousDueDate: invoice.dueDate.toISOString(),
          lastEditPreviousDescription: currentDescription,
        },
      },
    });

    if (amountChanged || descriptionChanged) {
      const primaryItem = invoice.items[0];
      if (primaryItem) {
        await tx.invoiceItem.update({
          where: { id: primaryItem.id },
          data: { description, amountCents: totalCents },
        });
        if (invoice.items.length > 1) {
          await tx.invoiceItem.deleteMany({
            where: { invoiceId: invoice.id, id: { not: primaryItem.id } },
          });
        }
      } else {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description,
            amountCents: totalCents,
          },
        });
      }
    }

    let balanceAfterCents = invoice.billingAccount.balanceCents;
    let ledgerEntryId: string | null = null;
    if (amountDeltaCents !== 0) {
      const updatedAccount = await tx.billingAccount.update({
        where: { id: invoice.billingAccount.id },
        data: { balanceCents: { increment: amountDeltaCents } },
        select: { balanceCents: true },
      });
      balanceAfterCents = updatedAccount.balanceCents;
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          billingAccountId: invoice.billingAccount.id,
          invoiceId: invoice.id,
          type: "invoice_adjustment",
          description: `Invoice correction for ${invoice.number}: ${moneyLabel(invoice.totalCents)} to ${moneyLabel(totalCents)}`,
          amountCents: amountDeltaCents,
          balanceAfterCents,
          sourceSystem: "bee_suite_manual",
          externalId: `invoice-edit:${invoice.id}:${randomUUID()}`,
          metadata: {
            editedBy: user.email,
            familyId: invoice.billingAccount.family.id,
            centerId,
            previousTotalCents: invoice.totalCents,
            updatedTotalCents: totalCents,
            previousDueDate: invoice.dueDate.toISOString(),
            updatedDueDate: dueDate.toISOString(),
            previousDescription: currentDescription,
            updatedDescription: description,
          },
        },
      });
      ledgerEntryId = ledgerEntry.id;
    }

    const updatedInvoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: {
        id: true,
        number: true,
        status: true,
        dueDate: true,
        totalCents: true,
        items: { orderBy: { id: "asc" }, select: { id: true, description: true, amountCents: true, productId: true } },
      },
    });

    return { invoice: updatedInvoice, deltaCents: amountDeltaCents, balanceAfterCents, ledgerEntryId };
  });

  await writeAuditLog(user, {
    centerId,
    action: "billing.invoice.updated",
    resource: "Invoice",
    resourceId: invoice.id,
    metadata: {
      familyId: invoice.billingAccount.family.id,
      previousTotalCents: invoice.totalCents,
      updatedTotalCents: totalCents,
      deltaCents: result.deltaCents,
      previousDueDate: invoice.dueDate.toISOString(),
      updatedDueDate: dueDate.toISOString(),
      previousDescription: currentDescription,
      updatedDescription: description,
      ledgerEntryId: result.ledgerEntryId,
    },
  });

  return NextResponse.json({ ok: true, updated: true, ...result });
}

function moneyLabel(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const mode = clean(body.mode) || "single";
  if (!canAccessAllCenters(user) && !user.centerIds.length) {
    return NextResponse.json({ ok: false, error: "No school access is assigned to this account." }, { status: 403 });
  }

  if (mode === "single") return createSingleInvoice(user, body);
  if (mode === "batch") return createBatchInvoices(user, body);
  if (mode === "adjustment") return createLedgerAdjustment(user, body);
  if (mode === "agencyPayment") return createAgencyPayment(user, body);
  if (mode === "manualCheckPayment") return createManualCheckPayment(user, body);
  if (mode === "refundPayment") return refundStripePayment(user, body);

  return NextResponse.json({ ok: false, error: "Unsupported billing action." }, { status: 400 });
}

async function PATCHHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }
  if (!canAccessAllCenters(user) && !user.centerIds.length) {
    return NextResponse.json({ ok: false, error: "No school access is assigned to this account." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  return updateInvoice(user, body);
}

export const POST = withApiLogging("POST", POSTHandler);
export const PATCH = withApiLogging("PATCH", PATCHHandler);
