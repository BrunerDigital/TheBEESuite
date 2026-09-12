import { createHash } from "node:crypto";
import { UserRole } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import type { createStripeCheckoutSession, createStripeCustomer } from "@/lib/integrations";
import { STRIPE_API_VERSION } from "@/lib/integrations";
import { jsonRecord } from "@/lib/billing-guardrails";

export const INVOICE_CHECKOUT_RETRY_MS = 23 * 60 * 60 * 1000;
export type InvoiceCheckoutRequest = Omit<Parameters<typeof createStripeCheckoutSession>[0], "credentials" | "idempotencyKey">;
export type InvoiceCheckoutCustomerRequest = Omit<Parameters<typeof createStripeCustomer>[0], "credentials" | "idempotencyKey">;
export type InvoiceCheckoutTopology = { tenantId: string; familyId: string; centerId: string; connectedAccountId: string | null };
export type InvoiceCheckoutAttempt = InvoiceCheckoutTopology & {
  version: 1; algorithm: "sha256"; startedAt: string; retryUntil: string;
  billingAccountId: string; invoiceId: string; requestDigest: string; customerId: string;
  keyPrefix: "checkout" | "payment-request-checkout";
};

/** A tenant-wide workspace is never authority over a foreign tenant's money. */
export function invoiceCheckoutTenant(user: Pick<CurrentUser, "role" | "tenantId" | "centerIds" | "workspace">, center: { id: string; tenantId: string } | null) {
  if (!center?.id || !center.tenantId) return null;
  if (center.tenantId === user.tenantId) return center.tenantId;
  const explicitlySelectedPlatformSchool = user.role === UserRole.PLATFORM_OWNER
    && user.workspace?.mode === "center" && user.workspace.activeCenterId === center.id && user.centerIds.includes(center.id);
  return explicitlySelectedPlatformSchool ? center.tenantId : null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("Invalid invoice checkout request representation");
}

export function invoiceCheckoutRequestDigest(request: InvoiceCheckoutRequest, keyPrefix: InvoiceCheckoutAttempt["keyPrefix"]) {
  if ("credentials" in request || "idempotencyKey" in request || request.metadata.paymentId !== undefined) {
    throw new Error("Invoice checkout snapshot must not contain credentials or a mutable payment key");
  }
  // Email-link return URLs contain a bearer credential. Hash the complete exact
  // candidate but NEVER persist or log its raw URLs, token, or request payload.
  // Increment encodingVersion if the shared Stripe request encoder changes.
  // An unrelated deployment must not invalidate an otherwise identical request.
  return createHash("sha256").update(canonical({ request, keyPrefix, encodingVersion: 1, stripeApiVersion: STRIPE_API_VERSION })).digest("hex");
}

export function invoiceCheckoutPreparation(input: Omit<Parameters<typeof newInvoiceCheckoutAttempt>[0], "request"> & {
  request: InvoiceCheckoutRequest; customer: InvoiceCheckoutCustomerRequest;
}): InvoiceCheckoutAttempt {
  if ("credentials" in input.customer || "idempotencyKey" in input.customer) throw new Error("Unexpected customer credential in preparation");
  const { topology, customer } = input;
  if (customer.tenantId !== topology.tenantId || (customer.connectedAccountId ?? null) !== topology.connectedAccountId
    || customer.metadata?.tenantId !== topology.tenantId || customer.metadata?.familyId !== topology.familyId
    || customer.metadata?.centerId !== topology.centerId || customer.metadata?.billingAccountId !== input.billingAccountId
    || customer.metadata?.stripeConnectedAccountId !== (topology.connectedAccountId ?? "")) {
    throw new Error("Invoice customer preparation does not match its authorized target");
  }
  const candidate = newInvoiceCheckoutAttempt({ ...input, request: { ...input.request, customerId: "cus_preparing" } });
  return { ...candidate, customerId: "pending", requestDigest: createHash("sha256")
    .update(canonical({ checkout: invoiceCheckoutRequestDigest(input.request, input.keyPrefix), customer: input.customer })).digest("hex") };
}

export function newInvoiceCheckoutAttempt(input: {
  topology: InvoiceCheckoutTopology; billingAccountId: string; invoiceId: string;
  request: InvoiceCheckoutRequest; keyPrefix: InvoiceCheckoutAttempt["keyPrefix"]; now?: Date;
}): InvoiceCheckoutAttempt {
  const { request, topology, keyPrefix, billingAccountId, invoiceId, now = new Date() } = input;
  if (!topology.tenantId || !topology.familyId || !topology.centerId || !billingAccountId || !invoiceId
    || (topology.connectedAccountId !== null && !topology.connectedAccountId.startsWith("acct_"))
    || request.tenantId !== topology.tenantId || (request.connectedAccountId ?? null) !== topology.connectedAccountId
    || !request.customerId?.startsWith("cus_") || request.metadata.invoiceId !== invoiceId
    || request.metadata.tenantId !== topology.tenantId || request.metadata.familyId !== topology.familyId || request.metadata.centerId !== topology.centerId) {
    throw new Error("Invoice checkout request does not match its authorized target");
  }
  return { ...topology, version: 1, algorithm: "sha256", billingAccountId, invoiceId, customerId: request.customerId,
    startedAt: now.toISOString(), retryUntil: new Date(now.getTime() + INVOICE_CHECKOUT_RETRY_MS).toISOString(),
    keyPrefix, requestDigest: invoiceCheckoutRequestDigest(request, keyPrefix) };
}

export function invoiceCheckoutAttemptMatches(stored: unknown, candidate: InvoiceCheckoutAttempt, now = new Date()) {
  const record = jsonRecord(stored);
  const startedAt = typeof record.startedAt === "string" ? Date.parse(record.startedAt) : NaN;
  const retryUntil = typeof record.retryUntil === "string" ? Date.parse(record.retryUntil) : NaN;
  if (!Number.isFinite(startedAt) || !Number.isFinite(retryUntil) || startedAt > now.getTime()
    || retryUntil !== startedAt + INVOICE_CHECKOUT_RETRY_MS || now.getTime() >= retryUntil) return false;
  return invoiceCheckoutAttemptIdentityMatches(stored, candidate);
}

/** Known session retrieval is not a new submission and does not extend its retry window. */
export function invoiceCheckoutAttemptIdentityMatches(stored: unknown, candidate: InvoiceCheckoutAttempt) {
  const record = jsonRecord(stored);
  return ["version", "algorithm", "tenantId", "familyId", "centerId", "connectedAccountId", "billingAccountId", "invoiceId", "customerId", "keyPrefix", "requestDigest"]
    .every(key => record[key] === candidate[key as keyof InvoiceCheckoutAttempt]);
}

const persistedFields = new Set([
  "invoiceAmountCents", "parentSurchargeAmountCents", "parentProcessingRecoveryAmountCents", "schoolProcessingFeeAmountCents",
  "beeSuitePaymentOperationsFeeAmountCents", "beeSuitePaymentOperationsFeeWaived", "requestedPaymentMethodCategory", "paymentMethodCategory",
  "paymentMethodConfigurationMissing", "checkoutTotalCents", "applicationFeeAmountCents", "feeDisclosureVersion", "bankAccountVerificationMethod",
  "collectionMode", "source", "description", "stripeChargeType", "paymentRequestTokenFamilyId", "paymentRequestRecipientEmail",
  "checkoutPurpose", "receiptKind", "chargeSource", "sourceId", "productId", "productName", "productType", "productCatalog", "productColor",
  "productSize", "productPurchaseOption", "itemSummary", "purchaseId", "purchaserUserId", "currentGuardianId", "quantity",
]);

export function invoiceCheckoutAmountsAndFieldsMatch(input: {
  invoiceTotalCents: number; request: InvoiceCheckoutRequest; fields: Record<string, unknown>;
}) {
  const { invoiceTotalCents, request, fields } = input;
  const surcharge = request.parentSurchargeAmountCents ?? 0;
  const fee = request.applicationFeeAmountCents ?? 0;
  if (!Number.isSafeInteger(invoiceTotalCents) || invoiceTotalCents <= 0
    || !Number.isSafeInteger(surcharge) || surcharge < 0 || !Number.isSafeInteger(fee) || fee < 0 || fee > invoiceTotalCents
    || !Number.isSafeInteger(request.amountCents) || request.invoiceAmountCents !== invoiceTotalCents
    || request.amountCents !== invoiceTotalCents + surcharge || fields.invoiceAmountCents !== invoiceTotalCents
    || fields.checkoutTotalCents !== request.amountCents || fields.parentSurchargeAmountCents !== surcharge
    || fields.applicationFeeAmountCents !== fee || fields.requestedPaymentMethodCategory !== request.paymentMethodCategory
    || request.metadata.invoiceAmountCents !== String(invoiceTotalCents) || request.metadata.checkoutTotalCents !== String(request.amountCents)
    || request.metadata.parentSurchargeAmountCents !== String(surcharge) || request.metadata.applicationFeeAmountCents !== String(fee)
    || request.metadata.stripeConnectedAccountId !== (request.connectedAccountId ?? "")) return false;
  return Object.entries(fields).every(([key, value]) => persistedFields.has(key)
    && (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
      || (typeof value === "string" && value.length <= 2000 && !/(?:https?:\/\/|payment-method-form\/)/i.test(value))));
}
