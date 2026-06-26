import type { StripeCheckoutBranding } from "@/lib/integrations";
import {
  STUDENT_UNIFORM_SHIRT_CATALOG,
  studentUniformShirtVariantFromProduct,
  type ProductLike,
} from "@/lib/uniform-products";

type InvoiceItemLike = {
  description: string;
  amountCents?: number | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeProductPurchaseQuantity(value: unknown, fallback = 1, max = 12) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(max, Math.max(1, Math.round(value)));
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

function positiveInt(value: unknown, fallback = 1) {
  return normalizeProductPurchaseQuantity(value, fallback, Number.MAX_SAFE_INTEGER);
}

function itemSummaryFromItems(items: InvoiceItemLike[]) {
  return items
    .map((item) => clean(item.description))
    .filter(Boolean)
    .join(", ");
}

export function productItemSummary(product: ProductLike, quantity = 1) {
  const normalizedQuantity = positiveInt(quantity);
  return normalizedQuantity > 1 ? `${product.name} x ${normalizedQuantity}` : product.name;
}

export function productPurchaseTotals(product: ProductLike, quantity = 1) {
  const variant = studentUniformShirtVariantFromProduct(product);
  const selectedQuantity = normalizeProductPurchaseQuantity(quantity);
  const receiptQuantity = variant?.purchaseOption === "bundle_5"
    ? variant.shirtCount * selectedQuantity
    : selectedQuantity;
  return {
    selectedQuantity,
    receiptQuantity,
    totalCents: product.amountCents * selectedQuantity,
  };
}

export function productInvoiceFieldsForProduct(product: ProductLike, quantity = 1): Record<string, unknown> {
  const variant = studentUniformShirtVariantFromProduct(product);
  const totals = productPurchaseTotals(product, quantity);
  return {
    checkoutPurpose: "product_purchase",
    receiptKind: "product",
    chargeSource: "product",
    sourceId: product.id,
    productId: product.id,
    productName: product.name,
    productType: product.type,
    productCatalog: variant ? STUDENT_UNIFORM_SHIRT_CATALOG : null,
    productColor: variant?.color ?? null,
    productSize: variant?.size ?? null,
    productPurchaseOption: variant?.purchaseOption ?? null,
    quantity: totals.receiptQuantity,
    itemSummary: productItemSummary(product, totals.selectedQuantity),
  };
}

export function invoicePurposeLabel(customFields: unknown) {
  const fields = record(customFields);
  const registrationKind = clean(fields.kind) === "registration_fee_deposit"
    || clean(fields.checkoutPurpose) === "registration_fee_deposit";
  if (registrationKind) return "Registration fee/deposit";

  const productPurchase = clean(fields.checkoutPurpose) === "product_purchase"
    || clean(fields.receiptKind) === "product"
    || clean(fields.chargeSource) === "product";
  if (!productPurchase) return null;

  return clean(fields.itemSummary) || clean(fields.productName) || "Product purchase";
}

export function invoiceProductCheckoutBranding(input: {
  invoiceNumber: string;
  familyName?: string | null;
  customFields: unknown;
  items?: InvoiceItemLike[];
}): StripeCheckoutBranding | null {
  const fields = record(input.customFields);
  const isProductPurchase = clean(fields.checkoutPurpose) === "product_purchase"
    || clean(fields.receiptKind) === "product"
    || clean(fields.chargeSource) === "product";
  if (!isProductPurchase) return null;

  const itemSummary = clean(fields.itemSummary)
    || clean(fields.productName)
    || itemSummaryFromItems(input.items ?? [])
    || `Product invoice ${input.invoiceNumber}`;
  const familySuffix = clean(input.familyName) ? ` for ${clean(input.familyName)}` : "";
  const paymentDescription = `${itemSummary}${familySuffix}`;
  return {
    productDescription: paymentDescription,
    paymentDescription,
    submitMessage: "Secure product checkout through The BEE Suite.",
  };
}

export function invoiceProductStripeMetadata(customFields: unknown): Record<string, string> {
  const fields = record(customFields);
  const metadata: Record<string, string> = {};
  for (const key of [
    "checkoutPurpose",
    "receiptKind",
    "chargeSource",
    "sourceId",
    "productId",
    "productName",
    "productType",
    "productCatalog",
    "productColor",
    "productSize",
    "productPurchaseOption",
    "itemSummary",
    "purchaseId",
    "purchaserUserId",
    "currentGuardianId",
  ]) {
    const value = clean(fields[key]);
    if (value) metadata[key] = value;
  }
  const quantity = positiveInt(fields.quantity, 0);
  if (quantity > 0) metadata.quantity = String(quantity);
  return metadata;
}
