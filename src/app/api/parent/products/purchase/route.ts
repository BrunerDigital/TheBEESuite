import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import { normalizeBillingPeriod } from "@/lib/billing-workflows";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import {
  normalizeProductPurchaseQuantity,
  productInvoiceFieldsForProduct,
  productItemSummary,
  productPurchaseTotals,
} from "@/lib/product-billing";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { studentUniformShirtVariantFromProduct } from "@/lib/uniform-products";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Only linked parent accounts can purchase parent portal products." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const productId = clean(body.productId);
  const requestedQuantity = normalizeProductPurchaseQuantity(body.quantity);
  if (!productId) {
    return NextResponse.json({ ok: false, error: "Product is required." }, { status: 400 });
  }

  const [family, product] = await Promise.all([
    prisma.family.findFirst({
      where: {
        guardians: { some: { userId: user.id } },
        children: { some: currentlyEnrolledChildWhere() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        centerId: true,
        guardians: {
          where: { userId: user.id },
          select: { id: true, userId: true },
          take: 1,
        },
      },
    }),
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, type: true, amountCents: true },
    }),
  ]);

  if (!family) {
    return NextResponse.json({ ok: false, error: "No active family is linked to this parent account." }, { status: 404 });
  }
  if (!product) {
    return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
  }
  const variant = studentUniformShirtVariantFromProduct(product);
  if (!variant) {
    return NextResponse.json({ ok: false, error: "This product is not available for parent portal purchase." }, { status: 400 });
  }
  if (product.amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Product price must be greater than zero." }, { status: 400 });
  }

  const dueDate = new Date();
  const purchaseId = randomUUID();
  const billingPeriod = normalizeBillingPeriod(null, dueDate);
  const totals = productPurchaseTotals(product, requestedQuantity);
  const description = productItemSummary(product, totals.selectedQuantity);
  const result = await prisma.$transaction((tx) =>
    createBillingInvoiceForFamily(tx, {
      familyId: family.id,
      dueDate,
      description,
      items: [{
        description,
        amountCents: totals.totalCents,
        productId: product.id,
      }],
      customFields: {
        mode: "parent_purchase",
        source: "parent_portal",
        billingPeriod,
        centerId: family.centerId,
        familyId: family.id,
        purchaseId,
        purchaserUserId: user.id,
        currentGuardianId: family.guardians[0]?.id ?? null,
        dedupeKey: `parent-product:${purchaseId}`,
        ...productInvoiceFieldsForProduct(product, totals.selectedQuantity),
      },
    }),
  );

  await writeAuditLog(user, {
    centerId: family.centerId,
    action: "parent.product_purchase.invoice_created",
    resource: "Invoice",
    resourceId: result.invoice.id,
    metadata: {
      familyId: family.id,
      purchaseId,
      productId: product.id,
      productName: product.name,
      productColor: variant.color,
      productSize: variant.size,
      productPurchaseOption: variant.purchaseOption,
      selectedQuantity: totals.selectedQuantity,
      quantity: totals.receiptQuantity,
      amountCents: result.invoice.totalCents,
    },
  });

  return NextResponse.json({
    ok: true,
    invoice: result.invoice,
    product: {
      id: product.id,
      name: product.name,
      color: variant.color,
      size: variant.size,
      productPurchaseOption: variant.purchaseOption,
      selectedQuantity: totals.selectedQuantity,
      quantity: totals.receiptQuantity,
      totalCents: totals.totalCents,
    },
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
