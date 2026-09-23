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
