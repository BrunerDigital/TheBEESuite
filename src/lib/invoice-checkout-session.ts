import { jsonRecord } from "@/lib/billing-guardrails";
import type { StripeCheckoutSessionSnapshot } from "@/lib/integrations";
import type { InvoiceCheckoutRequest, InvoiceCheckoutTopology } from "@/lib/invoice-checkout-attempt";

function objectId(value: unknown) {
  return typeof value === "string" ? value : typeof jsonRecord(value).id === "string" ? jsonRecord(value).id as string : null;
}

/** Transient provider evidence only: never persist or log raw Session/return URLs. */
export function invoiceCheckoutSessionIdentityMatches(input: {
  session: StripeCheckoutSessionSnapshot; sessionId: string; paymentId: string; invoiceId: string;
  customerId: string; topology: InvoiceCheckoutTopology; originalPrincipalCents: number;
}) {
  const { session, sessionId, paymentId, invoiceId, customerId, topology, originalPrincipalCents } = input;
  const raw = jsonRecord(session.raw), metadata = jsonRecord(raw.metadata);
  const core = { paymentId, invoiceId, familyId: topology.familyId, centerId: topology.centerId, tenantId: topology.tenantId,
    stripeConnectedAccountId: topology.connectedAccountId ?? "", stripeCustomerId: customerId };
  if (raw.object !== "checkout.session" || raw.id !== sessionId || session.id !== sessionId || raw.mode !== "payment"
    || raw.client_reference_id !== invoiceId || raw.currency !== "usd" || typeof raw.livemode !== "boolean"
    || objectId(raw.customer) !== customerId || !customerId.startsWith("cus_")
    || !Object.entries(core).every(([key, value]) => metadata[key] === value)
    || metadata.invoiceAmountCents !== String(originalPrincipalCents)
    || (metadata.accountCreditAppliedCents !== undefined && metadata.accountCreditAppliedCents !== "0")) return false;
  const total = Number(metadata.checkoutTotalCents);
  if (!Number.isSafeInteger(total) || total < originalPrincipalCents || total !== session.amountTotalCents || total !== raw.amount_total) return false;
  if (session.paymentIntentId) {
    const intent = jsonRecord(raw.payment_intent), intentMetadata = jsonRecord(intent.metadata);
    if (intent.id !== session.paymentIntentId || intent.object !== "payment_intent" || intent.currency !== "usd"
      || intent.amount !== total || objectId(intent.customer) !== customerId || intent.status !== session.paymentIntentStatus
      || !Object.entries(core).every(([key, value]) => intentMetadata[key] === value)) return false;
  } else if (raw.payment_intent) return false;
  return true;
}

export function invoiceCheckoutSessionRequestMatches(session: StripeCheckoutSessionSnapshot, request: InvoiceCheckoutRequest) {
  const raw = jsonRecord(session.raw), metadata = jsonRecord(raw.metadata);
  return session.amountTotalCents === request.amountCents && raw.success_url === request.successUrl && raw.cancel_url === request.cancelUrl
    && ["source", "collectionMode", "paymentRequestRecipientEmail", "feeDisclosureVersion", "requestedPaymentMethodCategory", "paymentMethodCategory"]
      .every(key => metadata[key] === request.metadata[key]);
}
