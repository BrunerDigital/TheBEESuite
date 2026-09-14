import { createHash } from "node:crypto";
import type { createStripeCheckoutSession, createStripeCustomer, createStripeOffSessionPaymentIntent } from "./integrations";
import { STRIPE_API_VERSION } from "./integrations";
import { jsonRecord } from "./billing-guardrails";
import type { FamilyPaymentTarget } from "./family-payment-preflight";

export const FAMILY_PAYMENT_RETRY_MS = 23 * 60 * 60 * 1000;
export type FamilyCheckoutRequest = Omit<Parameters<typeof createStripeCheckoutSession>[0], "credentials" | "idempotencyKey">;
export type FamilyIntentRequest = Omit<Parameters<typeof createStripeOffSessionPaymentIntent>[0], "credentials" | "idempotencyKey">;
export type FamilyCustomerRequest = Omit<Parameters<typeof createStripeCustomer>[0], "credentials" | "idempotencyKey">;
export type FamilyPaymentTopology = FamilyPaymentTarget & { connectedAccountId: string | null };
export type FamilyPaymentAttempt = FamilyPaymentTopology & {
  version: 1; kind: "checkout" | "saved_method"; phase: "prepare" | "submit";
  customerId: string | null; requestDigest: string; startedAt: string; retryUntil: string;
};
type Input = { topology: FamilyPaymentTopology; phase: FamilyPaymentAttempt["phase"]; customer?: FamilyCustomerRequest; now?: Date }
  & ({ kind: "checkout"; request: FamilyCheckoutRequest } | { kind: "saved_method"; request: FamilyIntentRequest });
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("Invalid family payment request representation");
}
const id = (value: string) => /^[A-Za-z0-9_-]{1,191}$/.test(value);
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
/** Persist only the digest and non-secret identity; never raw email, return URLs or request bodies. */
export function newFamilyPaymentAttempt(input: Input): FamilyPaymentAttempt {
  const { topology, kind, phase, request, customer, now = new Date() } = input;
  if (!Object.values({ tenant: topology.tenantId, center: topology.centerId, family: topology.familyId, account: topology.billingAccountId }).every(id)
    || topology.connectedAccountId !== null && !/^acct_[A-Za-z0-9]+$/.test(topology.connectedAccountId)
    || !Number.isFinite(now.getTime()) || "credentials" in request || "idempotencyKey" in request
    || request.tenantId !== topology.tenantId || (request.connectedAccountId ?? null) !== topology.connectedAccountId
    || request.metadata.paymentId !== undefined || request.metadata.invoiceId !== undefined || request.metadata.paymentScope !== "family_balance"
    || request.metadata.tenantId !== topology.tenantId || request.metadata.centerId !== topology.centerId
    || request.metadata.familyId !== topology.familyId || request.metadata.billingAccountId !== topology.billingAccountId
    || request.metadata.stripeConnectedAccountId !== (topology.connectedAccountId ?? "")) throw new Error("Family payment request does not match its authorized target");
  const principal = request.invoiceAmountCents, surcharge = request.parentSurchargeAmountCents ?? 0, fee = request.applicationFeeAmountCents ?? 0;
  if (!nonnegative(principal) || principal === 0 || !nonnegative(request.amountCents) || !nonnegative(surcharge) || !nonnegative(fee)
    || fee > principal || request.amountCents !== principal + surcharge
    || request.metadata.invoiceAmountCents !== String(principal) || request.metadata.checkoutTotalCents !== String(request.amountCents)
    || request.metadata.parentSurchargeAmountCents !== String(surcharge) || request.metadata.applicationFeeAmountCents !== String(fee)) throw new Error("Family payment amounts are inconsistent");
  const customerId = request.customerId ?? null;
  if (customerId !== null && !/^cus_[A-Za-z0-9]+$/.test(customerId) || (phase === "submit" || kind === "saved_method") && !customerId) throw new Error("Family payment customer identity is missing");
  if (request.metadata.stripeCustomerId !== (customerId ?? "") || phase === "prepare" && !customerId && !customer) throw new Error("Family customer preparation is incomplete");
  if (kind === "saved_method" && !/^pm_[A-Za-z0-9]+$/.test(input.request.paymentMethodId)) throw new Error("Family saved payment method is invalid");
  if (kind === "checkout" && input.request.allowPaymentMethodFallback !== false) throw new Error("Family Checkout must not change idempotency modes");
  if (customer && ("credentials" in customer || "idempotencyKey" in customer || customer.tenantId !== topology.tenantId
    || (customer.connectedAccountId ?? null) !== topology.connectedAccountId || customer.metadata?.tenantId !== topology.tenantId
    || customer.metadata?.familyId !== topology.familyId || customer.metadata?.centerId !== topology.centerId
    || customer.metadata?.billingAccountId !== topology.billingAccountId || customer.metadata?.stripeConnectedAccountId !== (topology.connectedAccountId ?? ""))) throw new Error("Family customer preparation does not match its target");
  return { ...topology, version: 1, kind, phase, customerId, startedAt: now.toISOString(), retryUntil: new Date(now.getTime() + FAMILY_PAYMENT_RETRY_MS).toISOString(),
    requestDigest: createHash("sha256").update(canonical({ kind, phase, request, customer: customer ?? null, encodingVersion: 1, stripeApiVersion: STRIPE_API_VERSION })).digest("hex") };
}
export function familyPaymentAttemptIdentityMatches(stored: unknown, candidate: FamilyPaymentAttempt) {
  const record = jsonRecord(stored);
  return ["version", "kind", "phase", "tenantId", "centerId", "familyId", "billingAccountId", "connectedAccountId", "customerId", "requestDigest"]
    .every(key => record[key] === candidate[key as keyof FamilyPaymentAttempt]);
}
export function familyPaymentAttemptMatches(stored: unknown, candidate: FamilyPaymentAttempt, now = new Date()) {
  const record = jsonRecord(stored), started = typeof record.startedAt === "string" ? Date.parse(record.startedAt) : NaN;
  const until = typeof record.retryUntil === "string" ? Date.parse(record.retryUntil) : NaN;
  return Number.isFinite(started) && Number.isFinite(until) && started <= now.getTime() && until === started + FAMILY_PAYMENT_RETRY_MS
    && now.getTime() < until && familyPaymentAttemptIdentityMatches(stored, candidate);
}
