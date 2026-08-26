import "./load-env";

const CONNECTED_ACCOUNT_ID = "acct_1TvJxjGS9yWyJNre";
const CUSTOMER_ID = "cus_V2BYyqlZczTopM";
const API_VERSION = "2026-07-29.dahlia";

type StripeList<T> = { data?: T[]; has_more?: boolean };

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function stripeGet<T>(path: string, connected = true) {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  invariant(apiKey, "STRIPE_SECRET_KEY is not configured.");
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": API_VERSION,
      ...(connected ? { "Stripe-Account": CONNECTED_ACCOUNT_ID } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Stripe GET ${path.split("?")[0]} returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

async function main() {
  const [platform, customer, paymentIntents, charges, setupIntents] = await Promise.all([
    stripeGet<{ id?: string }>("/v1/account", false),
    stripeGet<{ id?: string; deleted?: boolean }>(`/v1/customers/${CUSTOMER_ID}`),
    stripeGet<StripeList<{ id: string; status: string; amount: number; amount_received: number; created: number; latest_charge?: string | null; payment_method?: string | null; metadata?: Record<string, string> }>>(`/v1/payment_intents?customer=${CUSTOMER_ID}&limit=100`),
    stripeGet<StripeList<{ id: string; status: string; amount: number; amount_refunded: number; created: number; payment_intent?: string | null; refunded: boolean; refunds?: StripeList<{ id: string; amount: number; status?: string | null; created: number }>; payment_method_details?: { card?: { brand?: string; last4?: string } } }>>(`/v1/charges?customer=${CUSTOMER_ID}&limit=100`),
    stripeGet<StripeList<{ id: string; status: string; created: number; payment_method?: string | null }>>(`/v1/setup_intents?customer=${CUSTOMER_ID}&limit=100`),
  ]);

  invariant(platform.id?.startsWith("acct_"), "Configured Stripe credential did not identify a platform account.");
  invariant(customer.id === CUSTOMER_ID && !customer.deleted, "The connected Stripe customer is missing or deleted.");
  invariant(!paymentIntents.has_more && !charges.has_more && !setupIntents.has_more, "Stripe returned more than 100 exact-customer records; pagination is required before concluding the audit.");

  console.log(JSON.stringify({
    auditedAt: new Date().toISOString(),
    connectedAccountId: CONNECTED_ACCOUNT_ID,
    customerId: CUSTOMER_ID,
    customerExists: true,
    paymentIntents: (paymentIntents.data ?? []).map((intent) => ({
      id: intent.id,
      status: intent.status,
      amountCents: intent.amount,
      amountReceivedCents: intent.amount_received,
      createdAt: new Date(intent.created * 1000).toISOString(),
      latestChargeId: intent.latest_charge ?? null,
      paymentMethodId: intent.payment_method ?? null,
    })),
    charges: (charges.data ?? []).map((charge) => ({
      id: charge.id,
      status: charge.status,
      amountCents: charge.amount,
      amountRefundedCents: charge.amount_refunded,
      createdAt: new Date(charge.created * 1000).toISOString(),
      paymentIntentId: charge.payment_intent ?? null,
      refunded: charge.refunded,
      cardBrand: charge.payment_method_details?.card?.brand ?? null,
      cardLast4: charge.payment_method_details?.card?.last4 ?? null,
      refunds: (charge.refunds?.data ?? []).map((refund) => ({ id: refund.id, amountCents: refund.amount, status: refund.status ?? null, createdAt: new Date(refund.created * 1000).toISOString() })),
    })),
    setupIntents: (setupIntents.data ?? []).map((intent) => ({ id: intent.id, status: intent.status, createdAt: new Date(intent.created * 1000).toISOString(), paymentMethodId: intent.payment_method ?? null })),
    mutationsPerformed: 0,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
