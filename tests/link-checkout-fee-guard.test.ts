import assert from "node:assert/strict";
import test from "node:test";
import { startInvoiceCheckout } from "@/lib/invoice-checkout-service";
import { startFamilyPayment } from "@/lib/family-payment-service";
import { INSTANT_BANK_CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/parent-payment-errors";

test("Link invoice checkout stops before database claims, old URL reuse or customer creation", async () => {
  const input = new Proxy({ request: { paymentMethodCategory: "link_bank" } }, {
    get(target, key) {
      if (key === "request") return target.request;
      assert.fail(`Unavailable checkout accessed ${String(key)}`);
    },
  }) as unknown as Parameters<typeof startInvoiceCheckout>[0];
  assert.deepEqual(await startInvoiceCheckout(input), {
    ok: false, statusCode: 409, error: INSTANT_BANK_CHECKOUT_UNAVAILABLE_MESSAGE,
  });
});

test("Link family checkout stops before database claims, old URL reuse or customer creation", async () => {
  const input = new Proxy({ kind: "checkout", request: { paymentMethodCategory: "link_bank" } }, {
    get(target, key) {
      if (key === "kind") return target.kind;
      if (key === "request") return target.request;
      assert.fail(`Unavailable checkout accessed ${String(key)}`);
    },
  }) as unknown as Parameters<typeof startFamilyPayment>[0];
  assert.deepEqual(await startFamilyPayment(input), {
    ok: false, statusCode: 409, error: INSTANT_BANK_CHECKOUT_UNAVAILABLE_MESSAGE,
  });
});


import { linkCheckoutIsUnsafe } from "@/lib/link-checkout-policy";
const walletRequest = { paymentMethodCategory: "link", connectedAccountId: "acct_fake", amountCents: 10000,
  invoiceAmountCents: 10000, parentSurchargeAmountCents: 0,
  metadata: { paymentMethodCategory: "link", stripeFeesCollector: "stripe", schoolProcessingFeeAmountCents: "0",
    parentProcessingRecoveryAmountCents: "0", bankAccountVerificationMethod: "" } };
test("wallet allows actual Stripe fee billing without assuming bank funding", () => {
  assert.equal(linkCheckoutIsUnsafe(walletRequest), false);
});
for (const patch of [
  { connectedAccountId: null }, { invoiceAmountCents: 0 }, { amountCents: 10001 }, { parentSurchargeAmountCents: 1 },
  ...[{ stripeFeesCollector: "application" }, { stripeFeesCollector: "" }, { schoolProcessingFeeAmountCents: "144" },
    { parentProcessingRecoveryAmountCents: "1" }, { paymentMethodCategory: "link_bank" }, { bankAccountVerificationMethod: "instant" }]
    .map(metadata => ({ metadata: { ...walletRequest.metadata, ...metadata } })),
]) test(`unsafe wallet request stops before any database or provider work: ${JSON.stringify(patch)}`, async () => {
  const request = { ...walletRequest, ...patch };
  assert.equal(linkCheckoutIsUnsafe(request), true);
  const input = new Proxy({ kind: "checkout", request }, { get(target, key) {
    if (key === "kind") return target.kind;
    if (key === "request") return target.request;
    assert.fail(`Unsafe wallet accessed ${String(key)}`);
  } });
  assert.equal((await startFamilyPayment(input as unknown as Parameters<typeof startFamilyPayment>[0])).statusCode, 409);
  assert.equal((await startInvoiceCheckout(input as unknown as Parameters<typeof startInvoiceCheckout>[0])).statusCode, 409);
});
