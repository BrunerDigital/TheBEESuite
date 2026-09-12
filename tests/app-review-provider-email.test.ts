import assert from "node:assert/strict";
import test from "node:test";
import { APP_REVIEW_PARENT_CONTACT, APP_REVIEW_TEACHER_CONTACT } from "@/lib/app-review-targeting";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripeOffSessionPaymentIntent,
  createStripeSetupCheckoutSession,
  createStripeTerminalPaymentIntent,
} from "@/lib/integrations";
import { createTerminalStoreCheckoutSession } from "@/lib/terminal-store";

test("Stripe provider requests omit reserved App Review email fields", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    bodies.push(String(init?.body ?? ""));
    const response = url.endsWith("/customers")
      ? { id: `cus_test_${bodies.length}` }
      : url.endsWith("/payment_intents")
      ? { id: `pi_test_${bodies.length}`, amount: 1_000, status: "succeeded" }
      : { id: `cs_test_${bodies.length}`, url: "https://checkout.stripe.test/session" };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const credentials = { STRIPE_SECRET_KEY: "sk_test_app_review_email" };
  try {
    const checkout = await createStripeCheckoutSession({
      amountCents: 1_000,
      invoiceNumber: "INV-REVIEW-CHECKOUT",
      customerEmail: APP_REVIEW_PARENT_CONTACT.email,
      successUrl: "https://thebeesuite.io/parents?payment=success",
      cancelUrl: "https://thebeesuite.io/parents?payment=cancelled",
      metadata: { invoiceId: "inv_review_checkout", recipientEmail: APP_REVIEW_PARENT_CONTACT.email },
      credentials,
    });
    const customer = await createStripeCustomer({
      email: APP_REVIEW_PARENT_CONTACT.email,
      name: "Synthetic App Review Family",
      metadata: { familyId: "family_review", recipientEmail: APP_REVIEW_PARENT_CONTACT.email },
      credentials,
    });
    const offSession = await createStripeOffSessionPaymentIntent({
      amountCents: 1_000,
      invoiceNumber: "INV-REVIEW-SAVED",
      customerId: "cus_review",
      paymentMethodId: "pm_review",
      customerEmail: APP_REVIEW_PARENT_CONTACT.email,
      metadata: { invoiceId: "inv_review_saved", recipientEmail: APP_REVIEW_PARENT_CONTACT.email },
      credentials,
    });
    const terminal = await createStripeTerminalPaymentIntent({
      amountCents: 1_000,
      invoiceNumber: "INV-REVIEW-TERMINAL",
      customerEmail: APP_REVIEW_TEACHER_CONTACT.email,
      metadata: { invoiceId: "inv_review_terminal", recipientEmail: APP_REVIEW_TEACHER_CONTACT.email },
      credentials,
    });
    const setup = await createStripeSetupCheckoutSession({
      customerEmail: APP_REVIEW_PARENT_CONTACT.email,
      successUrl: "https://thebeesuite.io/parents?setup=success",
      cancelUrl: "https://thebeesuite.io/parents?setup=cancelled",
      metadata: { familyId: "family_review", recipientEmail: APP_REVIEW_PARENT_CONTACT.email },
      credentials,
    });
    const terminalStore = await createTerminalStoreCheckoutSession({
      items: [{ itemId: "stripe-reader-s700", quantity: 1 }],
      purchaserEmail: APP_REVIEW_TEACHER_CONTACT.email,
      successUrl: "https://thebeesuite.io/terminal-store?purchase=success",
      cancelUrl: "https://thebeesuite.io/terminal-store?purchase=cancelled",
      metadata: {
        orderReference: "app-review-provider-email-test",
        recipientEmail: APP_REVIEW_TEACHER_CONTACT.email,
      },
      credentials,
    });

    assert.equal(checkout.ok, true);
    assert.equal(customer.ok, true);
    assert.equal(offSession.ok, true);
    assert.equal(terminal.ok, true);
    assert.equal(setup.ok, true);
    assert.equal(terminalStore.ok, true);
    assert.equal(bodies.length, 6);
    for (const body of bodies) {
      assert.doesNotMatch(body, /customer_email|receipt_email/);
      assert.doesNotMatch(body, /app-review-(?:parent|teacher)%40thebeesuite\.io/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
