import type { PaymentStatus } from "@prisma/client";
import { jsonRecord } from "./billing-guardrails";
import { familyCheckoutSessionIdentityMatches } from "./family-payment-receipt";
import { isServerCheckoutReceipt } from "./parent-payment-observation";
import { stripePaymentClaimConflict } from "./stripe-payment-claim-conflict";
import type { StripeCheckoutSessionSnapshot } from "./integrations";
import type { FamilyPaymentTopology } from "./family-payment-attempt";

type Payment = { id: string; billingAccountId: string; status: PaymentStatus; provider: string; amountCents: number; externalIdPlaceholder: string | null; customFields: unknown };
export type ParentCheckoutResumeSnapshot = {
  topology: FamilyPaymentTopology; payments: Payment[]; customerId: string | null;
  familyName: string; collectableCents: number; canAcceptPayments: boolean;
};

/** Only an existing family Checkout can be resumed. No new collection, expiry,
 * reconciliation or financial writes are part of recovery. Legacy/unproven
 * receipts and competing attempts stay blocked. */
export function parentCheckoutResumeCandidate(snapshot: ParentCheckoutResumeSnapshot) {
  if (!snapshot.canAcceptPayments || !snapshot.customerId
    || !Number.isSafeInteger(snapshot.collectableCents) || snapshot.collectableCents < 0) return null;
  const active = snapshot.payments.filter(payment => stripePaymentClaimConflict({ scope: "family_balance", payment }));
  if (active.length !== 1) return null;
  const payment = active[0], fields = jsonRecord(payment.customFields);
  if (payment.provider !== "stripe" || payment.status !== "DRAFT" || fields.status !== "checkout_created"
    || fields.paymentScope !== "family_balance" || fields.invoiceId || fields.source !== "parent_portal"
    || fields.submissionStateUnknownAt || fields.stripeDisputeLedgerActive === true || fields.achReturnReason || fields.returnedAt ||
    fields.stripePaymentIntentStatus && fields.stripePaymentIntentStatus !== "requires_payment_method"
    || fields.stripeCheckoutSessionStatus && fields.stripeCheckoutSessionStatus !== "open"
    || fields.stripeCheckoutPaymentStatus && fields.stripeCheckoutPaymentStatus !== "unpaid"
    || fields.stripePaymentStatus && fields.stripePaymentStatus !== "unpaid"
    || !["ach", "card", "link"].includes(String(fields.paymentMethodCategory))
    || !["ach", "card", "link"].includes(String(fields.requestedPaymentMethodCategory))
    || payment.billingAccountId !== snapshot.topology.billingAccountId
    || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0
    // If the balance changed, require school review rather than an accidental overpayment.
    || payment.amountCents > snapshot.collectableCents
    || fields.stripeCustomerId !== snapshot.customerId
    || fields.stripeConnectedAccountId !== snapshot.topology.connectedAccountId
    || fields.stripeCustomerConnectedAccountId !== snapshot.topology.connectedAccountId
    || typeof fields.stripeCheckoutSessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(fields.stripeCheckoutSessionId)
    || payment.externalIdPlaceholder !== fields.stripeCheckoutSessionId
    || !Object.entries(snapshot.topology).every(([key, value]) => key === "connectedAccountId" || fields[key] === value)) return null;
  return { payment, sessionId: fields.stripeCheckoutSessionId };
}

export function parentCheckoutResumeReceipt(snapshot: ParentCheckoutResumeSnapshot, session: StripeCheckoutSessionSnapshot, now = new Date()) {
  const candidate = parentCheckoutResumeCandidate(snapshot);
  if (!candidate) return null;
  const { payment, sessionId } = candidate, fields = jsonRecord(payment.customFields), raw = jsonRecord(session.raw), metadata = jsonRecord(raw.metadata);
  // Provider receipt, never the cached DRAFT phase, decides whether resumption is safe.
  if (session.status !== "open" || session.paymentStatus !== "unpaid"
    || session.url !== raw.url || raw.status !== "open" || raw.payment_status !== "unpaid"
    || (session.paymentIntentId ? session.paymentIntentStatus !== "requires_payment_method" : Boolean(session.paymentIntentStatus))
    || Boolean(fields.stripePaymentIntentId) && fields.stripePaymentIntentId !== session.paymentIntentId
    || typeof raw.expires_at !== "number" || !Number.isSafeInteger(raw.expires_at) || raw.expires_at * 1000 <= now.getTime()
    || !familyCheckoutSessionIdentityMatches({ session, sessionId, paymentId: payment.id, customerId: snapshot.customerId!,
      topology: snapshot.topology, originalPrincipalCents: payment.amountCents, invoiceNumber: `${snapshot.familyName} family payment` })
    || !["checkoutTotalCents", "parentSurchargeAmountCents", "applicationFeeAmountCents", "feeDisclosureVersion", "requestedPaymentMethodCategory", "paymentMethodCategory", "source", "collectionMode"]
      .every(key => fields[key] !== undefined && String(fields[key]) === metadata[key])) return null;
  const receipt = { ok: true as const, paymentId: payment.id, stripeSessionId: sessionId, url: session.url };
  return isServerCheckoutReceipt(receipt) ? receipt : null;
}

/** Read twice around the provider call to reject webhook/account/access races.
 * Dependencies deliberately expose no writes or checkout-creation functions. */
export async function resumeParentCheckout(input: {
  read: () => Promise<ParentCheckoutResumeSnapshot | null>;
  retrieve: (input: { sessionId: string; connectedAccountId: string | null; tenantId: string }) => Promise<{ ok: boolean; session?: StripeCheckoutSessionSnapshot }>;
}) {
  const before = await input.read();
  const candidate = before && parentCheckoutResumeCandidate(before);
  if (!before || !candidate) return null;
  const response = await input.retrieve({ sessionId: candidate.sessionId, connectedAccountId: before.topology.connectedAccountId, tenantId: before.topology.tenantId });
  if (!response.ok || !response.session || !parentCheckoutResumeReceipt(before, response.session)) return null;
  const after = await input.read();
  const current = after && parentCheckoutResumeCandidate(after);
  if (!after || !current || current.payment.id !== candidate.payment.id || current.sessionId !== candidate.sessionId
    || JSON.stringify(current.payment.customFields) !== JSON.stringify(candidate.payment.customFields)
    || JSON.stringify(after.topology) !== JSON.stringify(before.topology)) return null;
  return parentCheckoutResumeReceipt(after, response.session);
}
