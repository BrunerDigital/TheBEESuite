export const STRIPE_WEBHOOK_ACCOUNT_EVENT_TYPES = [
  "account.updated",
  "v2.core.account.updated",
  "v2.core.account[requirements].updated",
] as const;

export const STRIPE_WEBHOOK_SOFTWARE_BILLING_EVENT_TYPES = [
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export const STRIPE_WEBHOOK_PAYMENT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
] as const;

export const STRIPE_WEBHOOK_SUPPORTED_EVENT_TYPES = [
  ...STRIPE_WEBHOOK_ACCOUNT_EVENT_TYPES,
  ...STRIPE_WEBHOOK_SOFTWARE_BILLING_EVENT_TYPES,
  ...STRIPE_WEBHOOK_PAYMENT_EVENT_TYPES,
] as const;

const ACCOUNT_EVENTS = new Set<string>(STRIPE_WEBHOOK_ACCOUNT_EVENT_TYPES);
const SOFTWARE_BILLING_EVENTS = new Set<string>(STRIPE_WEBHOOK_SOFTWARE_BILLING_EVENT_TYPES);
const PAYMENT_EVENTS = new Set<string>(STRIPE_WEBHOOK_PAYMENT_EVENT_TYPES);

export function isStripeWebhookAccountEvent(type: string) {
  return ACCOUNT_EVENTS.has(type);
}

export function isStripeWebhookSoftwareBillingEvent(type: string) {
  return SOFTWARE_BILLING_EVENTS.has(type);
}

export function isStripeWebhookPaymentEvent(type: string) {
  return PAYMENT_EVENTS.has(type);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stripeWebhookObjectForRouting(event: Record<string, unknown>) {
  const dataObject = objectValue(objectValue(event.data).object);
  if (Object.keys(dataObject).length) return dataObject;

  const relatedObject = objectValue(event.related_object);
  const type = typeof event.type === "string" ? event.type : "";
  if (isStripeWebhookAccountEvent(type) && typeof relatedObject.id === "string") {
    return {
      id: relatedObject.id,
      object: typeof relatedObject.type === "string" ? relatedObject.type : "v2.core.account",
    };
  }

  return {};
}
