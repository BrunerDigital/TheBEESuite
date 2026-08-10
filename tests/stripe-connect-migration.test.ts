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
  const connectStatusRoute = readFileSync("src/app/api/billing/connect/status/route.ts", "utf8");
  const oldPayoutRoute = readFileSync("src/app/api/billing/connect/payout-account/route.ts", "utf8");
  const oldOnboardRoute = readFileSync("src/app/api/billing/connect/onboard/route.ts", "utf8");
  const softwareRoute = readFileSync("src/app/api/billing/software-payment-method/route.ts", "utf8");
  const preparation = readFileSync("scripts/prepare-stripe-connect-migrations.ts", "utf8");
  assert.match(migrationRoute, /authorizedRepresentative !== true/);
  assert.match(migrationRoute, /accountId: migration\.targetAccountId/);
  assert.match(migrationRoute, /stripeMigration=return/);
  assert.match(migrationRoute, /customFields: \{ equals: fields as Prisma\.InputJsonValue \}/);
  assert.equal((migrationRoute.match(/customFields: \{ equals: fields as Prisma\.InputJsonValue \}/g) || []).length, 2);
  assert.match(migrationRoute, /Stripe migration changed while status was refreshing/);
  assert.match(connectStatusRoute, /customFields: \{ equals: existingFields as Prisma\.InputJsonValue \}/);
  assert.match(connectStatusRoute, /Stripe connection changed while status was refreshing/);
  assert.ok(migrationRoute.indexOf("stripeConnectMigrationLastOnboardingAt") < migrationRoute.indexOf("const link = await createStripeAccountLink"));
  assert.ok(migrationRoute.indexOf("billing.connect.migration.onboarding_reserved") < migrationRoute.indexOf("const link = await createStripeAccountLink"));
  assert.match(migrationRoute, /customFields: \{ equals: reservedFields as Prisma\.InputJsonValue \}/);
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

test("Full Dashboard target replacement is fingerprinted, idempotent, and preserves the active source account", () => {
  const replacement = readFileSync("scripts/replace-stripe-connect-migration-targets.ts", "utf8");
  assert.match(replacement, /--acknowledge-provider-mutation/);
  assert.match(replacement, /--acknowledge-database-mutation/);
  assert.match(replacement, /confirmation fingerprint does not match/i);
  assert.match(replacement, /target\.account\.dashboard !== "none"/);
  assert.match(replacement, /targetBanks\.banks\.length !== 0/);
  assert.match(replacement, /targetPayoutInterval !== "manual"/);
  assert.match(replacement, /BLOCKED_MIGRATION_STATUSES/);
  assert.match(replacement, /--center-id/);
  assert.match(replacement, /--allow-failed-reservation-replacement/);
  assert.match(replacement, /--allow-same-tenant-nonportfolio-center/);
  assert.match(replacement, /FAILED_RESERVATION_COOLDOWN_MS/);
  assert.match(replacement, /ONBOARDING_OPENED_ACTION/);
  assert.match(replacement, /stripeConnectMigrationLastOnboardingAt/);
  assert.match(replacement, /billing\.connect\.migration\.onboarding_reserved/);
  assert.match(replacement, /metadata: \{ path: \["targetAccountId"\], equals:/);
  assert.match(replacement, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(replacement, /startsAt: \{ lte: grantNow \}/);
  assert.match(replacement, /endsAt: \{ gte: grantNow \}/);
  assert.match(replacement, /customFields: \{ equals: transactionFields as Prisma\.InputJsonValue \}/);
  assert.match(replacement, /a concurrent migration update stopped the database swap/);
  assert.match(replacement, /bee-suite-full-dashboard-replacement-/);
  assert.match(replacement, /created\.account\.dashboard !== "full"/);
  assert.match(replacement, /stripeConnectMigrationPreviousTargetAccountId/);
  assert.match(replacement, /stripeConnectMigrationParentPaymentsAccountId: plan\.sourceAccountId/);
  assert.match(replacement, /readStripeConnectedAccountId\(afterSwapFields\) !== plan\.sourceAccountId/);
  assert.match(replacement, /target_replaced_after_failed_link/);
});

test("definitive Stripe link failures release the onboarding reservation", () => {
  const integrations = readFileSync("src/lib/integrations.ts", "utf8");
  const route = readFileSync("src/app/api/billing/connect/migration/route.ts", "utf8");
  assert.match(integrations, /providerStatus\?: number/);
  assert.match(integrations, /providerStatus: response\.status/);
  assert.match(route, /link\.providerStatus >= 400 && link\.providerStatus < 500/);
  assert.match(route, /stripeConnectMigrationLastOnboardingFailureCode/);
  assert.match(route, /billing\.connect\.migration\.onboarding_reservation_released/);
  assert.match(route, /customFields: \{ equals: reservedFields as Prisma\.InputJsonValue \}/);
});
