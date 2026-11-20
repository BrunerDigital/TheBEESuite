import assert from "node:assert/strict";
import { test } from "node:test";
import { stripePayoutBankIsUsable } from "../src/lib/stripe-payout-bank";
import { stripeSchoolReadinessFlowFromFields } from "../src/lib/stripe-school-readiness-flow";
import { listStripeConnectedAccountPayoutBanks } from "../src/lib/integrations";
import { corporateStripeConfirmedPayoutBank } from "../src/lib/corporate-stripe-verification";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromFields, stripeConnectReadinessFromSnapshot } from "../src/lib/stripe-connect-readiness";

test("payout readiness rejects failed banks and requires a default destination", () => {
  for (const status of ["errored", "verification_failed", " ERRORED "]) {
    assert.equal(stripePayoutBankIsUsable({ last4: "1234", defaultForCurrency: true, status }), false);
    const flow = stripeSchoolReadinessFlowFromFields({ customFields: {
      stripeConnectAccountId: "acct_school", stripeChargesEnabled: true,
      stripePayoutsEnabled: true, stripeDetailsSubmitted: true,
      stripePayoutBankLast4: "1234", stripePayoutBankDefaultConfirmed: true,
      stripePayoutBankStatus: status,
    } });
    assert.equal(flow.stage, "payout_bank_required");
    assert.equal(flow.payoutBankConfirmed, false);
    assert.equal(flow.canAcceptParentPayments, false);
  }
  assert.equal(stripePayoutBankIsUsable(null), false);
  assert.equal(stripePayoutBankIsUsable({ last4: "1234", defaultForCurrency: false }), false);
  assert.equal(stripePayoutBankIsUsable({ last4: " ", defaultForCurrency: true }), false);
});

test("payout banks marked new remain usable without customer microdeposit verification", () => {
  for (const status of ["new", "validated", "verified", null]) {
    assert.equal(stripePayoutBankIsUsable({ last4: "1234", defaultForCurrency: true, status }), true);
  }
});

test("corporate verification uses the same failed-bank rules", () => {
  const bank = { last4: "1234", defaultForCurrency: true, currency: "usd", status: "errored" };
  assert.equal(corporateStripeConfirmedPayoutBank([bank]), null);
  assert.equal(corporateStripeConfirmedPayoutBank([{ ...bank, status: "verification_failed" }]), null);
  assert.equal(corporateStripeConfirmedPayoutBank([{ ...bank, status: "new" }])?.last4, "1234");
});

test("fresh Stripe requirements replace obsolete legacy requirements in persisted readiness", () => {
  const readiness = stripeConnectReadinessFromSnapshot({
    id: "acct_school", chargesEnabled: true, payoutsEnabled: true,
    detailsSubmitted: true, requirementFields: [],
  });
  const existingFields: Record<string, unknown> = { stripeRequirementFields: ["company.tax_id"] };
  const fields = {
    ...existingFields,
    ...stripeConnectCustomFieldPatch(readiness),
    stripePayoutBankLast4: "1234", stripePayoutBankDefaultConfirmed: true,
  };
  assert.equal(stripeConnectReadinessFromFields(fields).status, "ready");
  assert.equal(stripeSchoolReadinessFlowFromFields({ customFields: fields }).stage, "activation_required");
});

test("provider lookup retains bank history but never confirms a failed or non-default bank", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, isDefault, expected] of [
      ["errored", true, false], ["verification_failed", true, false],
      ["verified", false, false], ["new", true, true],
    ] as const) {
      globalThis.fetch = async (_url, init) => {
        assert.equal(init?.method, "GET");
        return Response.json({ data: [{
          id: "ba_school", object: "bank_account", bank_name: "School Bank",
          last4: "1234", currency: "usd", country: "US",
          status, default_for_currency: isDefault,
        }] });
      };
      const result = await listStripeConnectedAccountPayoutBanks({
        accountId: "acct_school", credentials: { STRIPE_SECRET_KEY: "sk_test_fixture" },
      });
      assert.equal(result.ok, true);
      assert.equal(result.banks.length, 1);
      assert.equal(result.banks[0].status, status);
      assert.equal(Boolean(result.defaultBank), expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
