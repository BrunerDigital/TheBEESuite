import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { canAccessModule } from "../src/lib/rbac";
import {
  createTerminalStoreCheckoutSession,
  terminalStoreCatalog,
  terminalStoreOrderTotals,
  terminalStorePriceCents,
} from "../src/lib/terminal-store";

const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret;
});

test("terminal store prices are exactly 20 percent above Stripe list prices", () => {
  const s700 = terminalStoreCatalog.find((item) => item.id === "stripe-reader-s700");
  const m2Mount = terminalStoreCatalog.find((item) => item.id === "stripe-reader-m2-mount");

  assert.ok(s700);
  assert.ok(m2Mount);
  assert.equal(terminalStorePriceCents(29_900), 35_880);
  assert.equal(s700.priceCents, 35_880);
  assert.equal(m2Mount.priceCents, 600);
});

test("terminal store totals preserve base price and Bee Suite markup", () => {
  const totals = terminalStoreOrderTotals([
    { itemId: "stripe-reader-s700", quantity: 2 },
    { itemId: "s700-s710-dock", quantity: 1 },
    { itemId: "unknown", quantity: 4 },
  ]);

  assert.equal(totals.items.length, 2);
  assert.equal(totals.stripeBaseSubtotalCents, 64_700);
  assert.equal(totals.subtotalCents, 77_640);
  assert.equal(totals.markupCents, 12_940);
});

test("terminal store is visible to directors and executives only", () => {
  assert.equal(canAccessModule({ role: "PLATFORM_OWNER", accessScope: "platform" }, "terminal-store"), true);
  assert.equal(canAccessModule({ role: "BRAND_ADMIN", accessScope: "tenant" }, "terminal-store"), true);
  assert.equal(canAccessModule({ role: "REGIONAL_MANAGER", accessScope: "tenant" }, "terminal-store"), true);
  assert.equal(canAccessModule({ role: "CENTER_DIRECTOR", accessScope: "center", centerIds: ["center_1"] }, "terminal-store"), true);
  assert.equal(canAccessModule({ role: "ASSISTANT_DIRECTOR", accessScope: "center", centerIds: ["center_1"] }, "terminal-store"), true);
  assert.equal(canAccessModule({ role: "BILLING_ADMIN", accessScope: "center", centerIds: ["center_1"] }, "terminal-store"), false);
  assert.equal(canAccessModule({ role: "TEACHER", accessScope: "center", centerIds: ["center_1"] }, "terminal-store"), false);
  assert.equal(canAccessModule({ role: "READ_ONLY_AUDITOR", accessScope: "tenant" }, "terminal-store"), false);
});

test("terminal store checkout uses platform Stripe checkout without a connected account", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_platform";
  let authorization = "";
  let stripeAccount = "";
  let body = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    authorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
    stripeAccount = String((init?.headers as Record<string, string> | undefined)?.["Stripe-Account"] ?? "");
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "cs_terminal_store", url: "https://checkout.stripe.test/terminal-store" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createTerminalStoreCheckoutSession({
      items: [{ itemId: "stripe-reader-s700", quantity: 1 }],
      purchaserEmail: "director@example.com",
      purchaserName: "Director",
      successUrl: "https://thebeesuite.io/terminal-store?purchase=success",
      cancelUrl: "https://thebeesuite.io/terminal-store?purchase=cancelled",
      metadata: {
        tenantId: "tenant_1",
        centerId: "center_1",
        purchaserUserId: "user_1",
        orderReference: "terminal-store-test",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.totalCents, 35_880);
    assert.equal(authorization, "Bearer sk_platform");
    assert.equal(stripeAccount, "");
    assert.match(body, /metadata%5Bsource%5D=terminal_store/);
    assert.match(body, /customer_creation=always/);
    assert.match(body, /shipping_address_collection%5Ballowed_countries%5D%5B0%5D=US/);
    assert.match(body, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=35880/);
    assert.doesNotMatch(body, /transfer_data/);
    assert.doesNotMatch(body, /Stripe-Account/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
