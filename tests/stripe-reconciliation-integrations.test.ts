import assert from "node:assert/strict";
import { test } from "node:test";
import { listStripeBalanceTransactions, listStripePayouts } from "../src/lib/integrations";

test("Stripe reconciliation readers scope read-only requests to the connected account and date window", async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: string; method: string; account: string | null }> = [];
  global.fetch = (async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, method: init?.method || "GET", account: headers.get("Stripe-Account") });
    if (url.includes("balance_transactions")) {
      return new Response(JSON.stringify({ data: [{ id: "txn_1", type: "charge", amount: 1000, fee: 30, net: 970, source: "ch_1", created: 1_774_166_400, available_on: 1_774_252_800 }], has_more: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [{ id: "po_1", amount: 970, status: "paid", created: 1_774_252_800, arrival_date: 1_774_339_200, failure_code: null }], has_more: false }), { status: 200 });
  }) as typeof fetch;
  try {
    const range = { connectedAccountId: "acct_school", createdGte: new Date("2026-03-20T00:00:00.000Z"), createdLte: new Date("2026-03-22T00:00:00.000Z"), credentials: { STRIPE_SECRET_KEY: "sk_test_safe" } };
    const balance = await listStripeBalanceTransactions(range);
    const payouts = await listStripePayouts(range);
    assert.equal(balance.transactions[0]?.netCents, 970);
    assert.equal(payouts.payouts[0]?.status, "paid");
    assert.equal(requests.length, 2);
    assert.ok(requests.every((request) => request.method === "GET"));
    assert.ok(requests.every((request) => request.account === "acct_school"));
    assert.match(requests[0]!.url, /created%5Bgte%5D=/);
    assert.match(requests[0]!.url, /created%5Blte%5D=/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Stripe reconciliation readers fail closed without a connected account", async () => {
  const result = await listStripePayouts({
    connectedAccountId: "",
    createdGte: new Date("2026-03-20T00:00:00.000Z"),
    createdLte: new Date("2026-03-22T00:00:00.000Z"),
    credentials: { STRIPE_SECRET_KEY: "sk_test_safe" },
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /connected school account/i);
});
