import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readStripeConnectAccountId } from "../src/lib/stripe-connect-readiness";
import { readStripeConnectMigration, stripeConnectMigrationTargetIsReady } from "../src/lib/stripe-connect-migration";
import { buildStripeReauthorizationInvite } from "../src/lib/stripe-reauthorization-invite";

test("prepared migration never changes the active parent-payment account", () => {
  const fields = {
    stripeConnectAccountId: "acct_source",
    stripeConnectMigrationSourceAccountId: "acct_source",
    stripeConnectMigrationTargetAccountId: "acct_target",
    stripeConnectMigrationStatus: "prepared",
    stripeConnectMigrationSourcePayoutHoldStatus: "manual_confirmed",
    stripeConnectMigrationTargetPayoutHoldStatus: "manual_confirmed",
  };
  assert.equal(readStripeConnectAccountId(fields), "acct_source");
  const migration = readStripeConnectMigration(fields);
  assert.equal(migration.sourceAccountId, "acct_source");
  assert.equal(migration.targetAccountId, "acct_target");
  assert.equal(migration.status, "prepared");
  assert.equal(migration.sourcePayoutsHeld, true);
  assert.equal(migration.targetPayoutsHeld, true);
});

test("migration target requires Stripe-owned fees and losses, a bank, and active capabilities", () => {
  const ready = {
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementFields: [],
    feesCollector: "stripe",
    lossesCollector: "stripe",
    payoutBankLast4: "4242",
  };
  assert.equal(stripeConnectMigrationTargetIsReady(ready), true);
  assert.equal(stripeConnectMigrationTargetIsReady({ ...ready, feesCollector: "application" }), false);
  assert.equal(stripeConnectMigrationTargetIsReady({ ...ready, payoutBankLast4: null }), false);
  assert.equal(stripeConnectMigrationTargetIsReady({ ...ready, requirementFields: ["representative.verification"] }), false);
});

test("balance consent makes a verified migration ready for cutover", () => {
  const migration = readStripeConnectMigration({
    stripeConnectMigrationSourceAccountId: "acct_source",
    stripeConnectMigrationTargetAccountId: "acct_target",
    stripeConnectMigrationTargetChargesEnabled: true,
    stripeConnectMigrationTargetPayoutsEnabled: true,
    stripeConnectMigrationTargetDetailsSubmitted: true,
    stripeConnectMigrationTargetRequirementFields: [],
    stripeConnectMigrationTargetFeesCollector: "stripe",
    stripeConnectMigrationTargetLossesCollector: "stripe",
    stripeConnectMigrationTargetPayoutBankLast4: "4242",
    stripeConnectMigrationBalanceApprovalAt: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(migration.status, "ready_for_cutover");
});

test("branded invitation accurately separates Stripe verification from program eligibility", () => {
  const invite = buildStripeReauthorizationInvite({
    schoolName: "Kid City USA - Example",
    reauthorizationUrl: "https://thebeesuite.io/stripe-reauthorization?center=center_1",
  });
  assert.match(invite.subject, /BEE Suite Stripe reauthorization/);
  assert.match(invite.text, /state-funding allocations, subsidies/i);
  assert.match(invite.text, /Program eligibility and funding approvals remain/i);
  assert.match(invite.text, /Parent payments can continue/i);
  assert.match(invite.html, /logo-primary-horizontal-white\.png/);
  assert.match(invite.html, /thebeesuite\.io\/stripe-reauthorization/);
  assert.doesNotMatch(invite.html, /connect\.stripe\.com/);
});

test("migration routes protect the source bank and generate target links only after authenticated confirmation", () => {
  const migrationRoute = readFileSync("src/app/api/billing/connect/migration/route.ts", "utf8");
  const oldPayoutRoute = readFileSync("src/app/api/billing/connect/payout-account/route.ts", "utf8");
  const oldOnboardRoute = readFileSync("src/app/api/billing/connect/onboard/route.ts", "utf8");
  const softwareRoute = readFileSync("src/app/api/billing/software-payment-method/route.ts", "utf8");
  const preparation = readFileSync("scripts/prepare-stripe-connect-migrations.ts", "utf8");
  assert.match(migrationRoute, /authorizedRepresentative !== true/);
  assert.match(migrationRoute, /accountId: migration\.targetAccountId/);
  assert.match(migrationRoute, /stripeMigration=return/);
  assert.match(oldPayoutRoute, /existing payout bank remains untouched/);
  assert.match(oldOnboardRoute, /parent payments remain on the current account until cutover/i);
  assert.match(softwareRoute, /subscriptionCreated: false/);
  assert.match(preparation, /stripeConnectMigrationParentPaymentsAccountId: plan\.sourceAccountId/);
  assert.match(preparation, /stripeConnectMigrationTargetPayoutHoldStatus: "pending_confirmation"/);
  assert.match(preparation, /linksCreated: 0/);
  assert.doesNotMatch(preparation, /createStripeAccountLink/);
});

test("corporate reauthorization uses one stable portfolio entry while preserving per-school Stripe links", () => {
  const portfolioPage = readFileSync("src/app/stripe-reauthorization/corporate/page.tsx", "utf8");
  const schoolPage = readFileSync("src/app/stripe-reauthorization/page.tsx", "utf8");
  const card = readFileSync("src/components/stripe-reauthorization-card.tsx", "utf8");
  const migrationRoute = readFileSync("src/app/api/billing/connect/migration/route.ts", "utf8");
  const refreshRoute = readFileSync("src/app/api/billing/connect/migration/refresh/route.ts", "utf8");

  assert.match(portfolioPage, /CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa\.com"/);
  assert.match(portfolioPage, /tenantId: user\.tenantId/);
  assert.match(portfolioPage, /canAccessCenter\(user, centerId\)/);
  assert.match(portfolioPage, /scopeType: "CENTER"/);
  assert.match(portfolioPage, /portfolio=corporate/);
  assert.doesNotMatch(portfolioPage, /createStripeAccountLink|connect\.stripe\.com/);
  assert.match(schoolPage, /returnToCorporatePortfolio/);
  assert.match(card, /returnToCorporatePortfolio/);
  assert.match(migrationRoute, /returnToCorporatePortfolio/);
  assert.match(refreshRoute, /portfolioQuery/);
  assert.match(refreshRoute, /fallbackUrl\(baseUrl, returnToCorporatePortfolio/);
  assert.match(refreshRoute, /returnToCorporatePortfolio \? "\/stripe-reauthorization\/corporate" : "\/billing-settings"/);
});

test("cutover is one-school-at-a-time and remains blocked behind live bank, payout, readiness, and $99 checks", () => {
  const cutover = readFileSync("scripts/cutover-stripe-connect-migration.ts", "utf8");
  assert.match(cutover, /--center-id is required/);
  assert.match(cutover, /--acknowledge-parent-payment-cutover/);
  assert.match(cutover, /currentSourceBankFingerprint !== storedSourceBankFingerprint/);
  assert.match(cutover, /sourcePayoutInterval !== "manual" \|\| targetPayoutInterval !== "manual"/);
  assert.match(cutover, /getKidCitySoftwareFeeUnitAmountCents\(\) !== 9_900/);
  assert.match(cutover, /stripeConnectMigrationPayoutReleaseStatus: "blocked_until_software_invoice_and_reconciliation_verified"/);
  assert.match(cutover, /stripeConnectAccountId: targetAccountId/);
  assert.match(cutover, /stripeConnectMigrationSourceAccountRetainedForReconciliation: true/);
});

test("full-dashboard migration updates stay exact-target, guarded, and bank-preserving", () => {
  const dashboardUpdate = readFileSync("scripts/set-stripe-migration-targets-full-dashboard.ts", "utf8");

  assert.match(dashboardUpdate, /CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa\.com"/);
  assert.match(dashboardUpdate, /EXPECTED_TARGET_COUNT = 12/);
  assert.match(dashboardUpdate, /--acknowledge-full-dashboard-access/);
  assert.match(dashboardUpdate, /readStripeConnectedAccountId\(fields\) !== migration\.sourceAccountId/);
  assert.match(dashboardUpdate, /setStripeConnectedAccountFullDashboard/);
  assert.match(dashboardUpdate, /payoutBankFingerprint/);
  assert.match(dashboardUpdate, /before\.payoutInterval !== afterPayoutInterval/);
  assert.doesNotMatch(dashboardUpdate, /prisma\.center\.update|external_accounts|bank_accounts/);
});
