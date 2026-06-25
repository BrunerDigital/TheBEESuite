import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSchoolPayoutSetupInput,
  hasSchoolPayoutSelector,
  schoolPayoutSetupCustomFieldPatch,
  schoolPayoutCenterWhere,
} from "../src/lib/school-payout-onboarding";
import { normalizeStripeConnectSetupInput } from "../src/lib/stripe-connect-setup";

test("school payout setup defaults come from the selected center", () => {
  const input = buildSchoolPayoutSetupInput({}, {
    name: "Kid City USA - Sarasota",
    email: "Director@Example.com",
    phone: "(941) 555-1200",
    address: "374 Scott Ave",
    city: "Sarasota",
    state: "FL",
    postalCode: "34243",
  });
  const setup = normalizeStripeConnectSetupInput(input);

  assert.equal(setup.ok, true);
  assert.equal(setup.details.legalBusinessName, "Kid City USA - Sarasota");
  assert.equal(setup.details.displayName, "Kid City USA - Sarasota");
  assert.equal(setup.details.payoutContactEmail, "director@example.com");
  assert.equal(setup.details.payoutContactPhone, "+19415551200");
  assert.equal(setup.details.addressLine1, "374 Scott Ave");
  assert.equal(setup.details.city, "Sarasota");
  assert.equal(setup.details.state, "FL");
  assert.equal(setup.details.postalCode, "34243");
  assert.match(setup.details.productDescription, /Kid City USA - Sarasota school account payouts/);
});

test("school payout setup arguments override center defaults without requiring Kokomo", () => {
  const input = buildSchoolPayoutSetupInput({
    legalBusinessName: "Franchise LLC",
    payoutContactEmail: "billing@example.com",
    supportEmail: "support@example.com",
    businessUrl: "kidcityusa.example/longmont",
  }, {
    name: "Kid City USA - Longmont",
    email: "director@example.com",
    phone: "303-555-0100",
    address: "1941 Terry St.",
    city: "Longmont",
    state: "CO",
    postalCode: "80501",
  });
  const setup = normalizeStripeConnectSetupInput(input);

  assert.equal(setup.ok, true);
  assert.equal(setup.details.legalBusinessName, "Franchise LLC");
  assert.equal(setup.details.displayName, "Kid City USA - Longmont");
  assert.equal(setup.details.payoutContactEmail, "billing@example.com");
  assert.equal(setup.details.supportEmail, "support@example.com");
  assert.equal(setup.details.businessUrl, "https://kidcityusa.example/longmont");
});

test("school payout selector requires an explicit center match", () => {
  assert.equal(hasSchoolPayoutSelector({}), false);
  assert.equal(hasSchoolPayoutSelector({ locationId: "IN | Kokomo" }), true);

  assert.throws(() => schoolPayoutCenterWhere({}), /Pass --center-id/);
  assert.deepEqual(schoolPayoutCenterWhere({ centerId: "center_1" }), { OR: [{ id: "center_1" }] });
});

test("school payout setup patch preserves connected account status and excludes bank details", () => {
  const setup = normalizeStripeConnectSetupInput({
    legalBusinessName: "Kokomo School LLC",
    displayName: "Kid City USA - Kokomo",
    payoutContactEmail: "billing@example.com",
    payoutContactPhone: "(765) 555-1234",
    supportEmail: "families@example.com",
    supportPhone: "(765) 555-5678",
    addressLine1: "1998 Bent Creek Road",
    city: "Kokomo",
    state: "IN",
    postalCode: "46901",
    accountNumber: "000123456789",
    routingNumber: "000111000",
  } as Parameters<typeof normalizeStripeConnectSetupInput>[0]);

  assert.equal(setup.ok, true);

  const patch = schoolPayoutSetupCustomFieldPatch({
    existingCustomFields: {
      stripeConnectAccountId: "acct_123",
      stripePayoutStatus: "ready",
    },
    setupDetails: setup.details,
    setupVersion: "test-version",
    now: new Date("2026-06-25T12:00:00.000Z"),
  });
  const serialized = JSON.stringify(patch);
  const setupPatchRaw = patch.stripeConnectSetup;
  assert.equal(Boolean(setupPatchRaw && typeof setupPatchRaw === "object" && !Array.isArray(setupPatchRaw)), true);
  const setupPatch = setupPatchRaw as Record<string, unknown>;

  assert.equal(patch.stripeConnectAccountId, "acct_123");
  assert.equal(patch.stripePayoutStatus, "ready");
  assert.equal(patch.stripeConnectSetupVersion, "test-version");
  assert.equal(Object.hasOwn(setupPatch, "accountNumber"), false);
  assert.equal(Object.hasOwn(setupPatch, "routingNumber"), false);
  assert.equal(serialized.includes("000123456789"), false);
  assert.equal(serialized.includes("000111000"), false);
});
