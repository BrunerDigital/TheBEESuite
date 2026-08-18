import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
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
  isVoucherFundedTuitionAmount,
} from "@/lib/billing-workflows";
import { productInvoiceFieldsForProduct, productPurchaseTotals } from "@/lib/product-billing";
import { prisma } from "@/lib/prisma";
import { issueFamilyRefund, validateFamilyRefundAvailability } from "@/lib/family-refunds";
import { refundSubmissionMode } from "@/lib/refund-approval";
import { normalizeTuitionAdditionalCharges, normalizeTuitionCredits, totalTuitionAdditionalChargesCents, totalTuitionCreditsCents, tuitionInvoiceItems } from "@/lib/tuition-credits";
import { invoiceLedgerBalanceCents, invoiceVoidBlocker } from "@/lib/invoice-void";
import {
  invoiceResponsibilityReviewExempt,
  invoiceResponsibilitySeparation,
  responsibilitySeparationError,
} from "@/lib/invoice-responsibility-separation";
import { hasSubsidyResponsibilityEvidence } from "@/lib/parent-billing-visibility";

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
      children: { select: { id: true, fullName: true, ageGroup: true, enrollmentStatus: true, customFields: true } },
    },
  });
  if (!family) return { ok: false as const, status: 404, error: "Family not found." };
  if (!family.centerId || !canAccessCenter(user, family.centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this family." };
  }
  return { ok: true as const, family, centerId: family.centerId };
}

async function resolveCharge(body: Record<string, unknown>, centerId: string): Promise<
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
    const plan = await prisma.tuitionPlan.findFirst({ where: { id: tuitionPlanId, centerId } });
    if (!plan) return { ok: false, status: 404, error: "Tuition plan not found." };
    if (isVoucherFundedTuitionAmount(plan.amountCents)) {
      return { ok: false, status: 400, error: "$0 CCDF or voucher tuition is saved for tracking and cannot create a family charge." };
    }
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

  const chargeResult = await resolveCharge(body, familyAccess.centerId);
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
  const tuitionCredits = charge.chargeSource === "tuitionPlan" && child
    ? normalizeTuitionCredits(jsonObject(child.customFields).tuitionCredits)
    : [];
  const tuitionAdditionalCharges = charge.chargeSource === "tuitionPlan" && child
    ? normalizeTuitionAdditionalCharges(jsonObject(child.customFields).tuitionAdditionalCharges)
    : [];
  const tuitionCreditsTotalCents = totalTuitionCreditsCents(tuitionCredits);
  const tuitionAdditionalChargesTotalCents = totalTuitionAdditionalChargesCents(tuitionAdditionalCharges);
  if (tuitionCreditsTotalCents >= charge.amountCents + tuitionAdditionalChargesTotalCents) {
    return NextResponse.json({ ok: false, error: "Weekly credits must be less than the gross weekly tuition rate." }, { status: 400 });
  }
  const invoiceItems = charge.chargeSource === "tuitionPlan" && child
    ? tuitionInvoiceItems({ description: itemDescription, grossAmountCents: charge.amountCents, additionalCharges: tuitionAdditionalCharges, credits: tuitionCredits })
    : [{ description: itemDescription, amountCents: charge.amountCents, productId: charge.productId }];

  const result = await prisma.$transaction((tx) =>
    createBillingInvoiceForFamily(tx, {
      familyId: familyAccess.family.id,
      dueDate,
      description: itemDescription,
      items: invoiceItems,
      customFields: {
        mode: "single",
        chargeSource: charge.chargeSource,
        sourceId: charge.sourceId,
        ...(charge.customFields ?? {}),
        ...(charge.chargeSource === "product" ? { itemSummary: itemDescription } : {}),
        billingPeriod,
        centerId: familyAccess.centerId,
        childId: child?.id ?? null,
        ...(charge.chargeSource === "tuitionPlan" && child ? {
          grossTuitionCents: charge.amountCents + tuitionAdditionalChargesTotalCents,
          baseTuitionCents: charge.amountCents,
          tuitionAdditionalCharges,
          tuitionAdditionalChargesTotalCents,
          tuitionChargeLines: invoiceItems.filter((item) => "ledgerType" in item && item.ledgerType === "tuition_charge").map((item) => ({
            description: item.description,
            amountCents: item.amountCents,
          })),
          tuitionCredits,
          tuitionCreditsTotalCents,
          netTuitionCents: charge.amountCents + tuitionAdditionalChargesTotalCents - tuitionCreditsTotalCents,
        } : {}),
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

  const chargeResult = await resolveCharge(body, centerAccess.center.id);
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

async function createManualCashPayment(user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyAccess = await assertFamilyAccess(user, clean(body.familyId));
  if (!familyAccess.ok) return NextResponse.json({ ok: false, error: familyAccess.error }, { status: familyAccess.status });
  const amountCents = amountCentsFromBody(body);
  if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Cash payment amount is required." }, { status: 400 });
  const paidAt = parseDate(body.paidAt);
  const reference = clean(body.reference);
  const notes = clean(body.notes);
  const description = clean(body.description) || "Cash payment";

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
        provider: "manual_cash",
        externalIdPlaceholder: `cash:${randomUUID()}`,
        paidAt,
        customFields: {
          paymentType: "manual_cash",
          reference: reference || null,
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
        type: "cash_payment",
        description,
        amountCents: -amountCents,
        balanceAfterCents: updatedAccount.balanceCents,
        effectiveAt: paidAt,
        sourceSystem: "bee_suite_manual_cash",
        externalId: `cash:${payment.id}`,
        metadata: {
          reference: reference || null,
          notes: notes || null,
          enteredBy: user.email,
        },
      },
    });
    return { payment, entry };
  });

  await writeAuditLog(user, {
    centerId: familyAccess.centerId,
    action: "billing.cash_payment.created",
    resource: "Payment",
    resourceId: result.payment.id,
    metadata: {
      familyId: familyAccess.family.id,
      amountCents,
      reference: reference || null,
    },
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

  const preferredIds = Array.isArray(body.paymentIds)
    ? body.paymentIds.map((value) => clean(value)).filter(Boolean)
    : clean(body.paymentId) ? [clean(body.paymentId)] : [];
  const validation = await validateFamilyRefundAvailability(user, {
    familyId,
    amountCents,
    preferredPaymentIds: preferredIds,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error, availableCents: validation.availableCents },
      { status: validation.status },
    );
  }

  if (refundSubmissionMode(user.role) === "request_approval") {
    const refundRequest = await prisma.refundRequest.create({
      data: {
        tenantId: user.tenantId,
        centerId: validation.centerId,
        familyId,
        requestedById: user.id,
        amountCents,
        reason,
        selectedPaymentIds: preferredIds,
      },
    });
    const executiveUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: UserRole.PLATFORM_OWNER },
          {
            tenantId: user.tenantId,
            role: { in: [UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER] },
          },
        ],
      },
      select: { id: true },
    });
    if (executiveUsers.length) {
      await prisma.notification.createMany({
        data: executiveUsers.map((executive) => ({
          userId: executive.id,
          title: "Refund approval required",
          body: `${user.name || user.email} requested a ${moneyLabel(amountCents)} refund for ${validation.familyName}. Open the executive dashboard to approve or deny it with a reason.`,
          type: "refund_approval",
          priority: "high",
          dedupeKey: `refund-approval:${refundRequest.id}:${executive.id}`,
        })),
        skipDuplicates: true,
      });
    }
    await writeAuditLog(user, {
      centerId: validation.centerId,
      action: "billing.refund.requested",
      resource: "RefundRequest",
      resourceId: refundRequest.id,
      metadata: {
        familyId,
        amountCents,
        reason,
        selectedPaymentIds: preferredIds,
        notifiedExecutiveCount: executiveUsers.length,
      },
    });
    return NextResponse.json({
      ok: true,
      pendingApproval: true,
      requestId: refundRequest.id,
      totalCents: amountCents,
      notifiedExecutiveCount: executiveUsers.length,
    });
  }

  const result = await issueFamilyRefund(user, {
    familyId,
    amountCents,
    reason,
    preferredPaymentIds: preferredIds,
    operationId: randomUUID(),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, availableCents: result.availableCents },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
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
  if ((amountProvided || descriptionProvided) && invoiceResponsibilitySeparation(invoice.customFields)) {
    return NextResponse.json(
      { ok: false, error: "The amount or item description cannot be changed after family and agency responsibility has been separated." },
      { status: 409 },
    );
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

async function voidInvoice(user: CurrentBillingUser, body: Record<string, unknown>) {
  const invoiceId = clean(body.invoiceId) || clean(body.id);
  const reason = clean(body.reason).slice(0, 500);
  if (!invoiceId) return NextResponse.json({ ok: false, error: "Invoice is required." }, { status: 400 });
  if (reason.length < 5) {
    return NextResponse.json({ ok: false, error: "Enter a reason for voiding this invoice." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      ledgerEntries: { select: { amountCents: true, paymentId: true } },
      billingAccount: {
        select: {
          id: true,
          family: { select: { id: true, name: true, centerId: true } },
          payments: { where: { status: PaymentStatus.DRAFT }, select: { status: true, provider: true, customFields: true } },
        },
      },
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
  const initialBlocker = invoiceVoidBlocker({ ...invoice, payments: invoice.billingAccount.payments });
  if (initialBlocker) return NextResponse.json({ ok: false, error: initialBlocker }, { status: 409 });
  if (invoiceResponsibilitySeparation(invoice.customFields)) {
    return NextResponse.json(
      { ok: false, error: "A separated invoice cannot be voided because it has a linked agency receivable." },
      { status: 409 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        ledgerEntries: { select: { amountCents: true, paymentId: true } },
        billingAccount: {
          select: {
            id: true,
            payments: { where: { status: PaymentStatus.DRAFT }, select: { status: true, provider: true, customFields: true } },
          },
        },
      },
    });
    const blocker = invoiceVoidBlocker({ ...current, payments: current.billingAccount.payments });
    if (blocker) throw new Error(`INVOICE_VOID_BLOCKED:${blocker}`);
    if (invoiceResponsibilitySeparation(current.customFields)) {
      throw new Error("INVOICE_VOID_BLOCKED:A separated invoice cannot be voided because it has a linked agency receivable.");
    }

    const voidedAt = new Date();
    const updated = await tx.invoice.updateMany({
      where: { id: current.id, status: PaymentStatus.OPEN },
      data: {
        status: PaymentStatus.VOID,
        customFields: {
          ...jsonObject(current.customFields),
          voidedAt: voidedAt.toISOString(),
          voidedByUserId: user.id,
          voidedByEmail: user.email,
          voidReason: reason,
        },
      },
    });
    if (updated.count !== 1) throw new Error("INVOICE_VOID_BLOCKED:Invoice changed before it could be voided. Refresh and try again.");

    const reversalCents = invoiceLedgerBalanceCents(current.ledgerEntries);
    const account = await tx.billingAccount.update({
      where: { id: current.billingAccount.id },
      data: { balanceCents: { decrement: reversalCents } },
      select: { balanceCents: true },
    });
    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        billingAccountId: current.billingAccount.id,
        invoiceId: current.id,
        type: "invoice_void",
        description: `Voided ${current.number}: ${reason}`,
        amountCents: -reversalCents,
        balanceAfterCents: account.balanceCents,
        sourceSystem: "bee_suite_manual",
        externalId: `invoice-void:${current.id}`,
        metadata: {
          voidedBy: user.email,
          reason,
          previousStatus: PaymentStatus.OPEN,
          updatedStatus: PaymentStatus.VOID,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        centerId,
        userId: user.id,
        action: "billing.invoice.voided",
        resource: "Invoice",
        resourceId: current.id,
        metadata: {
          familyId: invoice.billingAccount.family.id,
          invoiceNumber: current.number,
          amountCents: reversalCents,
          reason,
          ledgerEntryId: ledgerEntry.id,
        },
      },
    });
    await tx.center.update({ where: { id: centerId }, data: { updatedAt: voidedAt } });
    return {
      invoice: { id: current.id, number: current.number, status: PaymentStatus.VOID, totalCents: current.totalCents },
      reversedCents: reversalCents,
      balanceAfterCents: account.balanceCents,
      ledgerEntryId: ledgerEntry.id,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("INVOICE_VOID_BLOCKED:")) return { error: message.slice("INVOICE_VOID_BLOCKED:".length) } as const;
    throw error;
  });

  if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, voided: true, ...result });
}

async function separateInvoiceResponsibility(user: CurrentBillingUser, body: Record<string, unknown>) {
  const invoiceId = clean(body.invoiceId);
  const expectedInvoiceTotalCents = Number(body.expectedInvoiceTotalCents);
  const expectedAccountBalanceCents = Number(body.expectedAccountBalanceCents);
  const familyResponsibilityCents = Number(body.familyResponsibilityCents);
  const agencyResponsibilityCents = Number(body.agencyResponsibilityCents);
  const agencyName = clean(body.agencyName).slice(0, 160);
  const authorizationNumber = clean(body.authorizationNumber).slice(0, 160) || null;
  const coverageStart = clean(body.coverageStart).slice(0, 10) || null;
  const coverageEnd = clean(body.coverageEnd).slice(0, 10) || null;

  if (!invoiceId) return NextResponse.json({ ok: false, error: "Invoice is required." }, { status: 400 });
  if (!Number.isInteger(expectedInvoiceTotalCents) || expectedInvoiceTotalCents <= 0) {
    return NextResponse.json({ ok: false, error: "Review the current invoice total before separating responsibility." }, { status: 400 });
  }
  if (!Number.isInteger(expectedAccountBalanceCents)) {
    return NextResponse.json({ ok: false, error: "Review the current family balance before separating responsibility." }, { status: 400 });
  }

  const access = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { billingAccount: { select: { family: { select: { centerId: true } } } } },
  });
  if (!access) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  const centerId = access.billingAccount.family.centerId;
  if (!centerId || !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this invoice." }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`);
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        customFields: true,
        items: { select: { description: true, amountCents: true } },
        ledgerEntries: { select: { paymentId: true } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            customFields: true,
            family: {
              select: {
                id: true,
                centerId: true,
                customFields: true,
                children: { select: { customFields: true } },
              },
            },
          },
        },
      },
    });
    if (invoice.billingAccount.family.centerId !== centerId) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:Invoice school changed. Refresh and try again.");
    }

    const existing = invoiceResponsibilitySeparation(invoice.customFields);
    if (existing) {
      if (
        existing.originalInvoiceTotalCents === expectedInvoiceTotalCents
        && existing.familyResponsibilityCents === familyResponsibilityCents
        && existing.agencyResponsibilityCents === agencyResponsibilityCents
        && existing.agencyName === agencyName
      ) {
        return {
          alreadySeparated: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          familyResponsibilityCents: existing.familyResponsibilityCents,
          agencyResponsibilityCents: existing.agencyResponsibilityCents,
          agencyName: existing.agencyName,
          invoiceStatus: invoice.status,
        };
      }
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:This invoice responsibility has already been separated.");
    }
    if (invoice.status !== PaymentStatus.OPEN) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:Only an open invoice can be separated.");
    }
    if (invoice.totalCents !== expectedInvoiceTotalCents || invoice.billingAccount.balanceCents !== expectedAccountBalanceCents) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:The invoice or account balance changed. Refresh and review the current amounts again.");
    }
    const itemTotalCents = invoice.items.reduce((sum, item) => sum + item.amountCents, 0);
    const validationError = responsibilitySeparationError({
      invoiceTotalCents: invoice.totalCents,
      accountBalanceCents: invoice.billingAccount.balanceCents,
      itemTotalCents,
      familyResponsibilityCents,
      agencyResponsibilityCents,
      agencyName,
    });
    if (validationError) throw new Error(`RESPONSIBILITY_SPLIT_BLOCKED:${validationError}`);
    if (invoiceResponsibilityReviewExempt(invoice.customFields)) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:Product purchases do not use agency tuition responsibility.");
    }
    if (!hasSubsidyResponsibilityEvidence(
      invoice.customFields,
      invoice.billingAccount.customFields,
      invoice.billingAccount.family.customFields,
      invoice.items.map((item) => item.description),
      invoice.billingAccount.family.children.map((child) => child.customFields),
    )) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:This invoice does not contain subsidy or agency responsibility evidence.");
    }

    const linkedPaymentCount = await tx.payment.count({
      where: {
        billingAccountId: invoice.billingAccount.id,
        status: { in: [PaymentStatus.DRAFT, PaymentStatus.OPEN, PaymentStatus.PAID, PaymentStatus.REFUNDED] },
        customFields: { path: ["invoiceId"], equals: invoice.id },
      },
    });
    if (linkedPaymentCount > 0 || invoice.ledgerEntries.some((entry) => entry.paymentId)) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:This invoice has payment activity. Review it before changing responsibility.");
    }

    const separatedAt = new Date();
    const separation = {
      status: "separated",
      originalInvoiceTotalCents: invoice.totalCents,
      familyResponsibilityCents,
      agencyResponsibilityCents,
      agencyName,
      authorizationNumber,
      coverageStart,
      coverageEnd,
      separatedAt: separatedAt.toISOString(),
      separatedByUserId: user.id,
    };
    const updatedStatus = familyResponsibilityCents > 0 ? PaymentStatus.OPEN : PaymentStatus.VOID;
    const updated = await tx.invoice.updateMany({
      where: { id: invoice.id, status: PaymentStatus.OPEN, totalCents: expectedInvoiceTotalCents },
      data: {
        status: updatedStatus,
        totalCents: familyResponsibilityCents,
        customFields: {
          ...jsonObject(invoice.customFields),
          responsibilitySeparation: separation,
          status: familyResponsibilityCents > 0 ? "open" : "agency_responsibility_only",
        },
      },
    });
    if (updated.count !== 1) {
      throw new Error("RESPONSIBILITY_SPLIT_BLOCKED:Invoice changed before responsibility could be separated. Refresh and try again.");
    }
    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `${agencyName} agency responsibility transferred`,
        amountCents: -agencyResponsibilityCents,
      },
    });

    const familyBalanceAfterCents = invoice.billingAccount.balanceCents - agencyResponsibilityCents;
    const familyAdjustment = await tx.ledgerEntry.create({
      data: {
        billingAccountId: invoice.billingAccount.id,
        invoiceId: invoice.id,
        type: "family_responsibility_adjustment",
        description: `Family responsibility separated for ${invoice.number}`,
        amountCents: -agencyResponsibilityCents,
        balanceAfterCents: familyBalanceAfterCents,
        effectiveAt: separatedAt,
        sourceSystem: "bee_suite_responsibility_split",
        externalId: `responsibility-split:${invoice.id}:family`,
        metadata: separation,
      },
    });
    const agencyReceivable = await tx.ledgerEntry.create({
      data: {
        billingAccountId: invoice.billingAccount.id,
        invoiceId: null,
        type: "agency_receivable",
        description: `${agencyName} responsibility for ${invoice.number}`,
        amountCents: agencyResponsibilityCents,
        balanceAfterCents: invoice.billingAccount.balanceCents,
        effectiveAt: separatedAt,
        sourceSystem: "subsidy_agency",
        externalId: `responsibility-split:${invoice.id}:agency`,
        metadata: { ...separation, sourceInvoiceId: invoice.id, sourceInvoiceNumber: invoice.number },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        centerId,
        userId: user.id,
        action: "billing.invoice.responsibility_separated",
        resource: "Invoice",
        resourceId: invoice.id,
        metadata: {
          familyId: invoice.billingAccount.family.id,
          invoiceNumber: invoice.number,
          ...separation,
          familyAdjustmentLedgerEntryId: familyAdjustment.id,
          agencyReceivableLedgerEntryId: agencyReceivable.id,
          accountBalanceCents: invoice.billingAccount.balanceCents,
        },
      },
    });
    await tx.center.update({ where: { id: centerId }, data: { updatedAt: separatedAt } });

    return {
      alreadySeparated: false,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      familyResponsibilityCents,
      agencyResponsibilityCents,
      agencyName,
      invoiceStatus: updatedStatus,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("RESPONSIBILITY_SPLIT_BLOCKED:")) {
      return { error: message.slice("RESPONSIBILITY_SPLIT_BLOCKED:".length) } as const;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Invoice activity changed during the update. Refresh and try again." } as const;
    }
    throw error;
  });

  if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, separated: true, ...result });
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
  if (mode === "manualCashPayment") return createManualCashPayment(user, body);
  if (mode === "refundPayment") return refundStripePayment(user, body);
  if (mode === "separateResponsibility") return separateInvoiceResponsibility(user, body);

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
  if (clean(body.mode) === "void") return voidInvoice(user, body);
  return updateInvoice(user, body);
}

export const POST = withApiLogging("POST", POSTHandler);
export const PATCH = withApiLogging("PATCH", PATCHHandler);
