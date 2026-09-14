import { jsonRecord } from "./billing-guardrails";
import type { StripeCheckoutSessionSnapshot, StripePaymentIntentSnapshot } from "./integrations";
import type { FamilyCheckoutRequest, FamilyIntentRequest, FamilyPaymentTopology } from "./family-payment-attempt";

const objectId = (value: unknown) => typeof value === "string" ? value : jsonRecord(value).id;
function metadataMatches(value: unknown, topology: FamilyPaymentTopology, paymentId: string, customerId: string, principal: number) {
  const metadata = jsonRecord(value);
  return metadata.invoiceId === undefined && Object.entries({ tenantId: topology.tenantId, centerId: topology.centerId,
    familyId: topology.familyId, billingAccountId: topology.billingAccountId, paymentScope: "family_balance", paymentId,
    stripeConnectedAccountId: topology.connectedAccountId ?? "", stripeCustomerId: customerId, invoiceAmountCents: String(principal) })
    .every(([key, expected]) => metadata[key] === expected || expected === "" && metadata[key] === undefined);
}

/** Raw provider evidence is transient. Do not store or log it. */
export function familyPaymentIntentReceiptMatches(intent: StripePaymentIntentSnapshot, request: FamilyIntentRequest, topology: FamilyPaymentTopology, paymentId: string) {
  const raw = jsonRecord(intent.raw), metadata = jsonRecord(raw.metadata);
  return /^pi_[A-Za-z0-9]+$/.test(intent.id) && raw.object === "payment_intent" && raw.id === intent.id
    && raw.currency === "usd" && typeof raw.livemode === "boolean" && raw.amount === request.amountCents && intent.amountCents === raw.amount
    && objectId(raw.customer) === request.customerId && objectId(raw.payment_method) === request.paymentMethodId
    && raw.status === intent.status && ["succeeded", "processing", "requires_action", "requires_confirmation", "requires_payment_method", "requires_capture", "canceled"].includes(String(intent.status))
    && (intent.status !== "succeeded" || raw.amount_received === request.amountCents)
    && metadataMatches(metadata, topology, paymentId, request.customerId, request.invoiceAmountCents!)
    && ["checkoutTotalCents", "parentSurchargeAmountCents", "applicationFeeAmountCents", "collectionMode", "feeDisclosureVersion"]
      .every(key => metadata[key] === request.metadata[key]);
}

export function familyCheckoutSessionIdentityMatches(input: { session: StripeCheckoutSessionSnapshot; sessionId: string; paymentId: string;
  customerId: string; topology: FamilyPaymentTopology; originalPrincipalCents: number; invoiceNumber: string }) {
  const { session, sessionId, paymentId, customerId, topology, originalPrincipalCents, invoiceNumber } = input;
  const raw = jsonRecord(session.raw), metadata = jsonRecord(raw.metadata), total = Number(metadata.checkoutTotalCents);
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || raw.object !== "checkout.session" || raw.id !== sessionId || session.id !== sessionId || raw.mode !== "payment"
    || raw.client_reference_id !== invoiceNumber || raw.currency !== "usd" || typeof raw.livemode !== "boolean"
    || objectId(raw.customer) !== customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId)
    || !metadataMatches(metadata, topology, paymentId, customerId, originalPrincipalCents)
    || !Number.isSafeInteger(total) || total < originalPrincipalCents || session.amountTotalCents !== total || raw.amount_total !== total) return false;
  if (session.paymentIntentId) {
    const intent = jsonRecord(raw.payment_intent);
    if (intent.id !== session.paymentIntentId || intent.object !== "payment_intent" || intent.currency !== "usd" || intent.amount !== total
      || objectId(intent.customer) !== customerId || intent.status !== session.paymentIntentStatus
      || !metadataMatches(intent.metadata, topology, paymentId, customerId, originalPrincipalCents)) return false;
  } else if (raw.payment_intent) return false;
  return true;
}

export function familyCheckoutSessionRequestMatches(session: StripeCheckoutSessionSnapshot, request: FamilyCheckoutRequest) {
  const raw = jsonRecord(session.raw), metadata = jsonRecord(raw.metadata);
  return raw.success_url === request.successUrl && raw.cancel_url === request.cancelUrl && session.amountTotalCents === request.amountCents
    && Object.entries(request.metadata).every(([key, value]) => metadata[key] === value || value === "" && metadata[key] === undefined);
}
