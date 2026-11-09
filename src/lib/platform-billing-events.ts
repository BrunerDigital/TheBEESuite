import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import {
  billingRecord, PLATFORM_PAYMENT_SCOPE, PlatformBillingError, platformInvoiceUrl,
  platformObjectMetadata, stripeId,
} from "@/lib/platform-billing-policy";
import { validatePlatformBillingCheckout, type PlatformChargeWithAccount } from "@/lib/platform-billing";

export class PlatformBillingRetryableError extends Error {}
type Event = { id: string; type: string; created?: number; account?: string | null; context?: string | null; data: { object: unknown } };
type Result = { ok: true; ignored?: boolean; reason?: string; pending?: boolean };

function requireMatch(charge: PlatformChargeWithAccount, object: unknown) {
  const metadata = platformObjectMetadata(object);
  const value = billingRecord(object);
  if (metadata.paymentScope !== PLATFORM_PAYMENT_SCOPE || metadata.platformChargeId !== charge.id
    || metadata.platformAccountId !== charge.accountId || metadata.billerTenantId !== charge.account.billerTenantId
    || stripeId(value.customer) !== charge.account.stripeCustomerId || !charge.account.stripeCustomerId) {
    throw new PlatformBillingError("Platform payment identity mismatch.", 409);
  }
}

async function lockedCharge(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformBillingCharge" WHERE "id" = ${id} FOR UPDATE`);
  return tx.platformBillingCharge.findUniqueOrThrow({ where: { id } });
}

async function recordEvent(tx: Prisma.TransactionClient, charge: PlatformChargeWithAccount, event: Event, state: string) {
  await tx.auditLog.create({ data: {
    tenantId: charge.account.billerTenantId, action: "billing.platform.provider_reconciled",
    resource: "PlatformBilling", resourceId: charge.id,
    metadata: { eventId: event.id, eventType: event.type, objectId: stripeId(event.data.object), status: state },
  } });
}

export async function applyPlatformSubscription(db: PrismaClient, charge: PlatformChargeWithAccount, subscription: Stripe.Subscription, event: Event) {
  requireMatch(charge, subscription);
  const item = subscription.items.data[0];
  if (charge.kind !== "MONTHLY" || subscription.items.data.length !== 1 || item?.quantity !== 1
    || item.price.currency !== "usd" || item.price.unit_amount !== charge.amountCents
    || item.price.recurring?.interval !== "month" || item.price.recurring.interval_count !== 1
    || (charge.stripeSubscriptionId && charge.stripeSubscriptionId !== subscription.id)) {
    throw new PlatformBillingError("Platform subscription amount or identity mismatch.", 409);
  }
  const at = new Date((event.created || Math.floor(Date.now() / 1000)) * 1000);
  await db.$transaction(async (tx) => {
    const current = await lockedCharge(tx, charge.id);
    if (current.providerUpdatedAt && current.providerUpdatedAt > at) return;
    // A canceled subscription can never be restored by an out-of-order event.
    if (current.status === "canceled" && subscription.status !== "canceled") return;
    if (current.stripeSubscriptionId && current.stripeSubscriptionId !== subscription.id) throw new PlatformBillingError("Subscription binding changed.", 409);
    const terminal = ["canceled", "incomplete_expired"].includes(subscription.status);
    await tx.platformBillingCharge.update({ where: { id: charge.id }, data: {
      stripeSubscriptionId: subscription.id, status: subscription.status,
      recurringKey: terminal ? null : charge.accountId,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: item.current_period_end ? new Date(item.current_period_end * 1000) : null,
      providerUpdatedAt: at, checkoutUrl: null,
    } });
    await recordEvent(tx, charge, event, subscription.status);
  });
}

async function applyCheckout(db: PrismaClient, stripe: Stripe, charge: PlatformChargeWithAccount, event: Event) {
  const session = await stripe.checkout.sessions.retrieve(stripeId(event.data.object));
  requireMatch(charge, session);
  validatePlatformBillingCheckout(charge, session);
  const subscriptionId = stripeId(session.subscription);
  if (charge.kind === "MONTHLY" && subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    // Keep the session binding even when the subscription webhook arrived first.
    await db.platformBillingCharge.updateMany({ where: { id: charge.id, stripeCheckoutSessionId: null }, data: { stripeCheckoutSessionId: session.id } });
    await applyPlatformSubscription(db, charge, subscription, event);
    return { ok: true } as const;
  }
  const at = new Date((event.created || Math.floor(Date.now() / 1000)) * 1000);
  await db.$transaction(async (tx) => {
    const current = await lockedCharge(tx, charge.id);
    if (current.providerUpdatedAt && current.providerUpdatedAt > at) return;
    if (current.stripeCheckoutSessionId && current.stripeCheckoutSessionId !== session.id) throw new PlatformBillingError("Checkout binding changed.", 409);
    if (current.stripeSubscriptionId) return;
    if (["paid", "refunded", "partially_refunded"].includes(current.status)) return;
    const paid = session.status === "complete" && session.payment_status === "paid";
    const expired = session.status === "expired";
    const failed = event.type === "checkout.session.async_payment_failed" && !paid;
    const status = paid ? "paid" : expired ? "expired" : failed ? "failed" : session.status === "open" ? "checkout_open" : "processing";
    if (paid && charge.kind !== "ONE_TIME") throw new PlatformBillingError("Monthly checkout is missing its subscription.", 409);
    if (paid && !stripeId(session.payment_intent)) throw new PlatformBillingError("Paid checkout is missing its payment reference.", 409);
    await tx.platformBillingCharge.update({ where: { id: charge.id }, data: {
      stripeCheckoutSessionId: session.id, stripePaymentIntentId: stripeId(session.payment_intent) || null,
      status, paidAt: paid ? at : null, providerUpdatedAt: at,
      ...(expired ? { recurringKey: null, checkoutUrl: null } : {}),
    } });
    await recordEvent(tx, charge, event, status);
  });
  return { ok: true, pending: session.status === "complete" && session.payment_status !== "paid" } as const;
}

async function applyInvoice(db: PrismaClient, stripe: Stripe, charge: PlatformChargeWithAccount, event: Event) {
  const invoice = await stripe.invoices.retrieve(stripeId(event.data.object));
  requireMatch(charge, invoice);
  const parent = billingRecord(invoice.parent);
  const subId = stripeId(billingRecord(parent.subscription_details).subscription || billingRecord(billingRecord(invoice).subscription_details).subscription || billingRecord(invoice).subscription);
  if (invoice.currency !== "usd" || invoice.total !== charge.amountCents
    || (charge.stripeSubscriptionId && subId !== charge.stripeSubscriptionId)) {
    throw new PlatformBillingError("Platform invoice amount or subscription mismatch.", 409);
  }
  if (charge.kind === "MONTHLY") {
    if (!subId) throw new PlatformBillingError("Monthly invoice is missing its subscription.", 409);
    await applyPlatformSubscription(db, charge, await stripe.subscriptions.retrieve(subId), event);
  } else if (subId) throw new PlatformBillingError("A one-time charge cannot receive subscription invoices.", 409);
  const at = new Date((event.created || Math.floor(Date.now() / 1000)) * 1000);
  await db.$transaction(async (tx) => {
    await lockedCharge(tx, charge.id);
    const previous = await tx.platformBillingInvoice.findUnique({ where: { stripeInvoiceId: invoice.id } });
    if (previous && (previous.providerUpdatedAt > at || (previous.status === "paid" && invoice.status !== "paid"))) return;
    if (previous && previous.chargeId !== charge.id) throw new PlatformBillingError("Invoice binding mismatch.", 409);
    const data = {
      number: invoice.number, status: invoice.status === "paid" ? "paid" : event.type === "invoice.payment_failed" ? "payment_failed" : event.type === "invoice.payment_action_required" ? "action_required" : invoice.status || "open",
      amountDueCents: invoice.amount_due, amountPaidCents: invoice.amount_paid,
      hostedInvoiceUrl: platformInvoiceUrl(invoice.hosted_invoice_url) ? invoice.hosted_invoice_url : null,
      paidAt: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
      providerUpdatedAt: at,
    };
    await tx.platformBillingInvoice.upsert({ where: { stripeInvoiceId: invoice.id }, create: { ...data, chargeId: charge.id, stripeInvoiceId: invoice.id }, update: data });
    await recordEvent(tx, charge, event, data.status);
  });
  return { ok: true } as const;
}

async function applyRefund(db: PrismaClient, stripe: Stripe, charge: PlatformChargeWithAccount, event: Event) {
  const refund = await stripe.charges.retrieve(stripeId(event.data.object));
  requireMatch(charge, refund);
  if (refund.currency !== "usd" || refund.amount !== charge.amountCents) throw new PlatformBillingError("Refund amount or currency mismatch.", 409);
  // A refund of one subscription invoice does not end the recurring agreement.
  if (charge.kind === "MONTHLY") return { ok: true, ignored: true, reason: "subscription_invoice_refund_does_not_cancel_subscription" } as const;
  if (!stripeId(refund.payment_intent) || (charge.stripePaymentIntentId && stripeId(refund.payment_intent) !== charge.stripePaymentIntentId)) throw new PlatformBillingError("Refund payment reference mismatch.", 409);
  await db.$transaction(async (tx) => {
    const current = await lockedCharge(tx, charge.id);
    if (refund.amount_refunded <= current.refundedAmountCents) return;
    const status = refund.amount_refunded >= charge.amountCents ? "refunded" : "partially_refunded";
    await tx.platformBillingCharge.update({ where: { id: charge.id }, data: { status, refundedAmountCents: refund.amount_refunded, stripePaymentIntentId: stripeId(refund.payment_intent) } });
    await recordEvent(tx, charge, event, status);
  });
  return { ok: true } as const;
}

// Called only after the existing webhook verifies the exact raw request signature.
export async function handlePlatformBillingEvent(db: PrismaClient, stripe: Stripe, event: Event, matchedTenantId: string | null): Promise<Result | null> {
  const metadata = platformObjectMetadata(event.data.object);
  if (metadata.paymentScope !== PLATFORM_PAYMENT_SCOPE) return null;
  if (matchedTenantId || event.account || event.context) return { ok: true, ignored: true, reason: "platform_billing_requires_platform_destination" };
  const id = typeof metadata.platformChargeId === "string" ? metadata.platformChargeId : "";
  const charge = id ? await db.platformBillingCharge.findUnique({ where: { id }, include: { account: true } }) : null;
  if (!charge) throw new PlatformBillingError("Platform charge not found.", 409);
  requireMatch(charge, event.data.object);
  try {
    if (event.type.startsWith("checkout.session.")) return await applyCheckout(db, stripe, charge, event);
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = await stripe.subscriptions.retrieve(stripeId(event.data.object));
      await applyPlatformSubscription(db, charge, subscription, event);
      return { ok: true };
    }
    if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) return await applyInvoice(db, stripe, charge, event);
    if (event.type === "charge.refunded") return await applyRefund(db, stripe, charge, event);
    return { ok: true, ignored: true, reason: "platform_billing_event_requires_no_state_change" };
  } catch (error) {
    if (error instanceof PlatformBillingError || error instanceof Prisma.PrismaClientKnownRequestError) throw error;
    // Provider failures must be retried rather than acknowledged as settled.
    throw new PlatformBillingRetryableError("Platform payment reconciliation is temporarily unavailable.");
  }
}

export async function syncPlatformBillingCharge(db: PrismaClient, stripe: Stripe, charge: PlatformChargeWithAccount) {
  const event: Event = {
    id: `sync_${crypto.randomUUID()}`, type: "checkout.session.completed", created: Math.floor(Date.now() / 1000),
    data: { object: { id: charge.stripeCheckoutSessionId, customer: charge.account.stripeCustomerId, metadata: {
      paymentScope: PLATFORM_PAYMENT_SCOPE, platformChargeId: charge.id, platformAccountId: charge.accountId, billerTenantId: charge.account.billerTenantId,
    } } },
  };
  if (charge.stripeCheckoutSessionId) await handlePlatformBillingEvent(db, stripe, event, null);
  const latest = await db.platformBillingCharge.findUniqueOrThrow({ where: { id: charge.id } });
  if (latest.stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(latest.stripeSubscriptionId);
    await applyPlatformSubscription(db, charge, subscription, { ...event, type: "customer.subscription.updated", data: { object: subscription } });
    const invoices = await stripe.invoices.list({ subscription: latest.stripeSubscriptionId, limit: 12 });
    for (const invoice of invoices.data) await applyInvoice(db, stripe, charge, { ...event, type: invoice.status === "paid" ? "invoice.paid" : "invoice.updated", data: { object: invoice } });
  } else if (charge.stripeCheckoutSessionId && charge.kind === "ONE_TIME") {
    const session = await stripe.checkout.sessions.retrieve(charge.stripeCheckoutSessionId);
    if (stripeId(session.invoice)) await applyInvoice(db, stripe, charge, { ...event, type: "invoice.paid", data: { object: { id: stripeId(session.invoice) } } });
  }
}
