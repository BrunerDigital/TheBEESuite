import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createStripeTerminalPaymentIntent,
  listStripeTerminalReaders,
  processStripeTerminalPaymentIntent,
  registerStripeTerminalReader,
} from "../src/lib/integrations";

const credentials = { STRIPE_SECRET_KEY: "sk_test_terminal" };

test("Stripe Terminal reader listing is scoped to a connected account location", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.match(url, /terminal\/readers\?limit=100&location=tml_school/);
    assert.equal(new Headers(init?.headers).get("Stripe-Account"), "acct_school");
    return new Response(JSON.stringify({
      data: [{
        id: "tmr_front",
        label: "Front desk",
        device_type: "stripe_s700",
        status: "online",
        location: "tml_school",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await listStripeTerminalReaders({
      locationId: "tml_school",
      connectedAccountId: "acct_school",
      credentials,
    });
    assert.equal(result.ok, true);
    assert.equal(result.readers?.[0]?.id, "tmr_front");
    assert.equal(result.readers?.[0]?.locationId, "tml_school");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe Terminal registration assigns the reader to the school's location", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = String(init?.body);
    assert.match(body, /registration_code=pair-123/);
    assert.match(body, /label=Front\+desk/);
    assert.match(body, /location=tml_school/);
    assert.equal(new Headers(init?.headers).get("Stripe-Account"), "acct_school");
    return new Response(JSON.stringify({
      id: "tmr_front",
      label: "Front desk",
      device_type: "stripe_s700",
      status: "online",
      location: "tml_school",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await registerStripeTerminalReader({
      registrationCode: "pair-123",
      label: "Front desk",
      locationId: "tml_school",
      connectedAccountId: "acct_school",
      credentials,
    });
    assert.equal(result.ok, true);
    assert.equal(result.reader?.id, "tmr_front");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("card-present PaymentIntents use Terminal hardware and connected-account routing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = String(init?.body);
    assert.match(body, /payment_method_types%5B0%5D=card_present/);
    assert.match(body, /application_fee_amount=125/);
    assert.match(body, /metadata%5BcollectionMode%5D=director_card_present/);
    assert.equal(new Headers(init?.headers).get("Stripe-Account"), "acct_school");
    return new Response(JSON.stringify({
      id: "pi_terminal",
      amount: 10_125,
      status: "requires_payment_method",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await createStripeTerminalPaymentIntent({
      amountCents: 10_125,
      invoiceAmountCents: 10_000,
      invoiceNumber: "INV-100",
      metadata: { collectionMode: "director_card_present" },
      connectedAccountId: "acct_school",
      applicationFeeAmountCents: 125,
      credentials,
    });
    assert.equal(result.ok, true);
    assert.equal(result.paymentIntent?.id, "pi_terminal");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("card-present tuition refuses a connected-account application fee below 1 percent", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Stripe must not be called when the application fee is incomplete.");
  };
  try {
    const result = await createStripeTerminalPaymentIntent({
      amountCents: 10_000,
      invoiceAmountCents: 10_000,
      invoiceNumber: "INV-TERMINAL-FEE-GUARD",
      metadata: { collectionMode: "director_card_present" },
      connectedAccountId: "acct_school",
      applicationFeeAmountCents: 99,
      credentials,
    });
    assert.equal(result.ok, false);
    assert.match(result.error || "", /complete 1% BEE Suite fee before payout/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reader processing lets the present parent cancel and skips tipping", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /terminal\/readers\/tmr_front\/process_payment_intent$/);
    const body = String(init?.body);
    assert.match(body, /payment_intent=pi_terminal/);
    assert.match(body, /process_config%5Benable_customer_cancellation%5D=true/);
    assert.match(body, /process_config%5Bskip_tipping%5D=true/);
    return new Response(JSON.stringify({
      id: "tmr_front",
      status: "online",
      location: "tml_school",
      action: { status: "in_progress", payment_intent: "pi_terminal" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await processStripeTerminalPaymentIntent({
      readerId: "tmr_front",
      paymentIntentId: "pi_terminal",
      connectedAccountId: "acct_school",
      credentials,
    });
    assert.equal(result.ok, true);
    assert.equal(result.reader?.actionStatus, "in_progress");
    assert.equal(result.reader?.paymentIntentId, "pi_terminal");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Terminal API and workbench enforce school scope and describe the web USB boundary", () => {
  const route = readFileSync("src/app/api/billing/terminal-payment/route.ts", "utf8");
  const component = readFileSync("src/components/stripe-terminal-payment.tsx", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const dashboard = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(route, /canAccessCenter\(user, centerId\)/);
  assert.match(route, /reader\.reader\.locationId !== locationId/);
  assert.match(route, /billingAccount\.family\.centerId !== context\.center\.id/);
  assert.match(route, /parentPresent !== true/);
  assert.match(route, /allocateAccountCreditToInvoice/);
  assert.match(route, /invoiceCreditAllocation\?\.stripeChargePrincipalCents/);
  assert.match(route, /accountCreditAppliedCents: String\(invoiceCreditAllocation\?\.accountCreditAppliedCents \?\? 0\)/);
  assert.match(route, /accountCreditAppliedCents: invoiceCreditAllocation\?\.accountCreditAppliedCents \?\? 0/);
  assert.match(route, /terminal_reader_submission_unknown/);
  assert.match(route, /reconcileIdempotentStripeSubmission\(\(\) => processStripeTerminalPaymentIntent/);
  assert.match(component, /json\?\.paymentId && json\.status === "processing"/);
  assert.match(component, /do not start another payment/);
  assert.match(route, /Available account credit already covers this invoice; no card payment is needed\./);
  assert.match(component, /direct USB data connection is available only through Stripe&apos;s Android mobile-reader SDK/);
  assert.match(component, /In-Person Card Reader/);
  assert.match(workbench, /selectedCenter\?\.hardwareTerminalConfigured/);
  assert.match(dashboard, /hardwareTerminalConfigured:[\s\S]*stripeTerminalLocationId/);
});
