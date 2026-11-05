import Stripe from "stripe";
import { createHash } from "node:crypto";
import { PLATFORM_PAYMENT_SCOPE, PlatformBillingError } from "@/lib/platform-billing-policy";

// Platform revenue must never resolve a tenant override or a connected account.
export function platformStripeClient() {
  const key = process.env.STRIPE_PLATFORM_SECRET_KEY?.trim() || process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new PlatformBillingError("The BEE Suite payment account is not configured.", 503);
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
}

export type PlatformCheckoutInput = {
  id: string;
  accountId: string;
  billerTenantId: string;
  customerId: string;
  kind: string;
  description: string;
  amountCents: number;
  returnBaseUrl: string;
};

export function platformCheckoutParams(input: PlatformCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    paymentScope: PLATFORM_PAYMENT_SCOPE,
    platformChargeId: input.id,
    platformAccountId: input.accountId,
    billerTenantId: input.billerTenantId,
  };
  const monthly = input.kind === "MONTHLY";
  return {
    mode: monthly ? "subscription" : "payment",
    customer: input.customerId,
    client_reference_id: input.id,
    success_url: `${input.returnBaseUrl}/platform-payment-return?result=submitted`,
    cancel_url: `${input.returnBaseUrl}/platform-payment-return?result=canceled`,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd", unit_amount: input.amountCents,
        product_data: { name: input.description },
        ...(monthly ? { recurring: { interval: "month" as const } } : {}),
      },
    }],
    metadata,
    ...(monthly ? { subscription_data: { metadata, description: input.description } } : {
      payment_intent_data: { metadata, description: input.description },
      invoice_creation: { enabled: true, invoice_data: { metadata, description: input.description } },
    }),
    custom_text: { submit: { message: monthly
      ? "Payment to The BEE Suite. You authorize this amount each month until canceled."
      : "Payment to The BEE Suite." } },
    // Stable per charge so provider retries keep the same request parameters.
    integration_identifier: `bee_suite_platform_${Array.from(createHash("sha256").update(input.id).digest().subarray(0, 8), (byte) => String.fromCharCode(97 + byte % 26)).join("")}`,
    ...(process.env.STRIPE_PLATFORM_PAYMENT_METHOD_CONFIGURATION_ID?.trim()
      ? { payment_method_configuration: process.env.STRIPE_PLATFORM_PAYMENT_METHOD_CONFIGURATION_ID.trim() } : {}),
  };
}
