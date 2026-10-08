import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieveStripeConnectedAccount } from "../src/lib/integrations";

test("Stripe setup displays the provider contact email for v2 and legacy accounts", async () => {
  const original = globalThis.fetch;
  try {
    for (const legacy of [false, true]) {
      globalThis.fetch = (async url => new Response(JSON.stringify(
        legacy && String(url).includes("/v2/")
          ? { error: { message: "Legacy account" } }
          : { id: "acct_school", [legacy ? "email" : "contact_email"]: "school+stripe@example.com" },
      ), { status: legacy && String(url).includes("/v2/") ? 404 : 200 })) as typeof fetch;
      const result = await retrieveStripeConnectedAccount("acct_school", { credentials: { STRIPE_SECRET_KEY: "synthetic" } });
      assert.equal(result.ok, true);
      assert.equal(result.account?.contactEmail, "school+stripe@example.com");
    }
  } finally {
    globalThis.fetch = original;
  }
});
