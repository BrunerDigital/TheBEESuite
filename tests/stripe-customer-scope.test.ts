import assert from "node:assert/strict";
import test from "node:test";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "../src/lib/stripe-customer-scope";

test("connected customer mapping preserves the retained source customer during account cutover", () => {
  const source = "acct_source";
  const target = "acct_target";
  const existing = {
    stripeCustomerId: "cus_source",
    stripeConnectedCustomerId: "cus_source",
    stripeCustomerConnectedAccountId: source,
  };
  const patched = { ...existing, ...stripeCustomerCustomFieldPatch(existing, "cus_target", target) };
  assert.equal(stripeCustomerIdForAccount(patched, source), "cus_source");
  assert.equal(stripeCustomerIdForAccount(patched, target), "cus_target");
});
