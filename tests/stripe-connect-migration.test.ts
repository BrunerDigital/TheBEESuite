import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import {
  canUseCorporateStripeVerification,
  corporateStripeConfirmedPayoutBank,
  corporateStripePayoutBankIsConfirmed,
  corporateStripeVerificationBindingIsValid,
  CORPORATE_STRIPE_VERIFICATION_TARGETS,
  readCorporateStripeVerificationTarget,
  stripeVerificationState,
} from "../src/lib/corporate-stripe-verification";
import { readStripeConnectAccountId } from "../src/lib/stripe-connect-readiness";
import {
  readStripeConnectMigration,
  stripeConnectMigrationTargetIsReady,
  stripeConnectSavedMethodAccount,
} from "../src/lib/stripe-connect-migration";
import { buildStripeReauthorizationInvite } from "../src/lib/stripe-reauthorization-invite";
import {
  CORPORATE_STRIPE_PORTFOLIO_PATH,
  PAYOUT_SETUP_SETTINGS_PATH,
  stripePayoutSetupFlowForCenters,
  stripePayoutSetupIsComplete,
  stripeReauthorizationHref,
} from "../src/lib/stripe-payout-setup-flow";

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

test("saved methods remain chargeable only on the retained source after a verified cutover", () => {
  const cutover = {
    stripeConnectMigrationSourceAccountId: "acct_source",
    stripeConnectMigrationTargetAccountId: "acct_target",
    stripeConnectMigrationCutoverAt: "2026-08-11T16:00:00.000Z",
    stripeConnectMigrationSourceAccountRetainedForReconciliation: true,
  };
  assert.equal(stripeConnectSavedMethodAccount({
    activeAccountId: "acct_target",
    savedMethodAccountId: "acct_source",
    centerCustomFields: cutover,
  }), "acct_source");
  assert.equal(stripeConnectSavedMethodAccount({
    activeAccountId: "acct_target",
    savedMethodAccountId: "acct_target",
    centerCustomFields: cutover,
  }), "acct_target");
  assert.equal(stripeConnectSavedMethodAccount({
    activeAccountId: "acct_target",
    savedMethodAccountId: "acct_other",
    centerCustomFields: cutover,
  }), null);
  assert.equal(stripeConnectSavedMethodAccount({
    activeAccountId: "acct_target",
    savedMethodAccountId: "acct_source",
    centerCustomFields: { ...cutover, stripeConnectMigrationSourceAccountRetainedForReconciliation: false },
  }), null);
});

test("payment setup completion cannot let an older source session replace a newer method", () => {
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(webhook, /latestSetupSessionId && latestSetupSessionId !== session\.id/);
  assert.match(webhook, /staleSetupSessionIgnored: true/);
  assert.match(webhook, /currentSetupSessionId && currentSetupSessionId !== session\.id/);
  assert.match(webhook, /staleSetupExpirationIgnored: true/);
});

test("corporate Stripe verification is pinned to the eight approved school accounts", () => {
  const expected = {
    cmp4ew5yx00046alw8i1yf63m: { school: "Cordera", accountId: "acct_1U2zAXGZOiFVCaG2" },
    cmp4ewd6p00386alw2ngcihed: { school: "Avon", accountId: "acct_1U31bWGpss446orz" },
    cmp4ewhbt00506alwam35am12: { school: "North Richland Hills", accountId: "acct_1U2zDmGoyxd1QwIu" },
    "85f871b5-b20d-4107-b5de-91d3014a1fb0": { school: "Corpus Christi", accountId: "acct_1U2zCsGlcTEcSaA2" },
    cmp4ewg8w004k6alwid0bwiur: { school: "Pisgah Forest", accountId: "acct_1U2zCaKIZA7QoGgs" },
    cmp4ewg4a004i6alwl5c6i3w4: { school: "Canton", accountId: "acct_1U2zCH2chpYNb3qS" },
    cmp4ew9h2001m6alwxssr4wr6: { school: "Oakleaf", accountId: "acct_1U2zBgK7L6OX7cUR" },
    cmp4ew8yo001e6alw32jneo3w: { school: "Beach Blvd", accountId: "acct_1U2zBOGetOO7UdiA" },
  };
  assert.deepEqual(CORPORATE_STRIPE_VERIFICATION_TARGETS, expected);
  for (const [centerId, target] of Object.entries(expected)) {
    assert.deepEqual(readCorporateStripeVerificationTarget(centerId), target);
  }
  assert.equal(readCorporateStripeVerificationTarget("center_not_approved"), null);
});

test("corporate Stripe verification is limited to platform, brand, and the exact corporate billing operator", () => {
  assert.equal(canUseCorporateStripeVerification({ role: UserRole.PLATFORM_OWNER, email: "owner@example.com" }), true);
  assert.equal(canUseCorporateStripeVerification({ role: UserRole.BRAND_ADMIN, email: "brand@example.com" }), true);
  assert.equal(canUseCorporateStripeVerification({ role: UserRole.BILLING_ADMIN, email: "corpschools@kidcityusa.com" }), true);
  assert.equal(canUseCorporateStripeVerification({ role: UserRole.BILLING_ADMIN, email: "billing@example.com" }), false);
  for (const role of [
    UserRole.REGIONAL_MANAGER,
    UserRole.CENTER_DIRECTOR,
    UserRole.ASSISTANT_DIRECTOR,
    UserRole.TEACHER,
    UserRole.PARENT_GUARDIAN,
    UserRole.AUTHORIZED_PICKUP,
    UserRole.READ_ONLY_AUDITOR,
  ]) {
    assert.equal(canUseCorporateStripeVerification({ role, email: "user@example.com" }), false, role);
  }
});

test("corporate Stripe verification live state short-circuits complete and pending accounts", () => {
  assert.equal(stripeVerificationState({
    livemode: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    feesCollector: "stripe",
    lossesCollector: "stripe",
    currentlyDueRequirementFields: [],
    pendingVerificationFields: [],
  }, true), "stripe_verification_complete");
  assert.equal(stripeVerificationState({
    livemode: true,
    chargesEnabled: false,
    payoutsEnabled: false,
    feesCollector: "stripe",
    lossesCollector: "stripe",
    currentlyDueRequirementFields: [],
    pendingVerificationFields: ["identity.business_details.address"],
  }, false), "stripe_verification_pending");
  assert.equal(stripeVerificationState({
    livemode: true,
    chargesEnabled: false,
    payoutsEnabled: false,
    feesCollector: "stripe",
    lossesCollector: "stripe",
    currentlyDueRequirementFields: ["external_account"],
    pendingVerificationFields: [],
  }, false), "stripe_verification_required");
  assert.equal(stripeVerificationState({
    livemode: true,
    chargesEnabled: false,
    payoutsEnabled: false,
    feesCollector: "stripe",
    lossesCollector: "stripe",
    currentlyDueRequirementFields: [],
    pendingVerificationFields: [],
  }, false), "stripe_verification_blocked");
  assert.equal(stripeVerificationState({
    livemode: false,
    chargesEnabled: true,
    payoutsEnabled: true,
    feesCollector: "stripe",
    lossesCollector: "stripe",
    currentlyDueRequirementFields: [],
    pendingVerificationFields: [],
  }, true), "stripe_verification_blocked");
  assert.equal(stripeVerificationState({
    livemode: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    feesCollector: "application",
    lossesCollector: "stripe",
    currentlyDueRequirementFields: [],
    pendingVerificationFields: [],
  }, true), "stripe_verification_blocked");
});

test("corporate Stripe verification requires the correct active mapping and a default USD bank", () => {
  assert.equal(corporateStripeVerificationBindingIsValid({
    activeAccountId: "acct_source",
    sourceAccountId: "acct_source",
    targetAccountId: "acct_target",
    cutoverAt: null,
  }), true);
  assert.equal(corporateStripeVerificationBindingIsValid({
    activeAccountId: "acct_target",
    sourceAccountId: "acct_source",
    targetAccountId: "acct_target",
    cutoverAt: "2026-08-11T12:00:00.000Z",
  }), true);
  assert.equal(corporateStripeVerificationBindingIsValid({
    activeAccountId: "acct_other",
    sourceAccountId: "acct_source",
    targetAccountId: "acct_target",
    cutoverAt: null,
  }), false);
  assert.equal(corporateStripePayoutBankIsConfirmed([
    { currency: "usd", defaultForCurrency: true, last4: "4242" },
  ]), true);
  assert.equal(corporateStripePayoutBankIsConfirmed([
    { currency: "usd", defaultForCurrency: false, last4: "4242" },
  ]), false);
  assert.equal(corporateStripePayoutBankIsConfirmed([
    { currency: "usd", defaultForCurrency: true, last4: null },
  ]), false);
  const fallbackBank = { currency: "cad", defaultForCurrency: true, last4: "4242", bankName: "Fallback" };
  assert.equal(corporateStripeConfirmedPayoutBank([fallbackBank]), null);
  const confirmedBank = { currency: "usd", defaultForCurrency: true, last4: "6789", bankName: "Confirmed" };
  assert.equal(corporateStripeConfirmedPayoutBank([fallbackBank, confirmedBank]), confirmedBank);
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

test("a verified account and payout bank are ready without a software-fee authorization", () => {
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
  });
  assert.equal(migration.status, "ready_for_cutover");
  assert.equal(migration.balanceAuthorized, false);
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
  assert.equal((migrationRoute.match(/customFields: \{ equals: fields as Prisma\.InputJsonValue \}/g) || []).length, 3);
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

  assert.match(portfolioPage, /CORPORATE_STRIPE_PORTFOLIO_EMAIL/);
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

test("dashboard payout entry uses the same stable school-specific reauthorization flow", () => {
  const activeSource = {
    stripeConnectAccountId: "acct_source",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    stripeConnectMigrationSourceAccountId: "acct_source",
    stripeConnectMigrationTargetAccountId: "acct_target",
    stripeConnectMigrationStatus: "prepared",
  };
  const pendingFlow = stripePayoutSetupFlowForCenters([{ id: "center one", customFields: activeSource }]);

  assert.equal(pendingFlow.href, stripeReauthorizationHref("center one"));
  assert.equal(pendingFlow.href, "/stripe-reauthorization?center=center%20one");
  assert.equal(pendingFlow.complete, false);
  assert.equal(pendingFlow.replacementInProgress, true);
  assert.equal(stripePayoutSetupIsComplete(activeSource), false);

  const readyTarget = {
    ...activeSource,
    stripeConnectMigrationTargetChargesEnabled: true,
    stripeConnectMigrationTargetPayoutsEnabled: true,
    stripeConnectMigrationTargetDetailsSubmitted: true,
    stripeConnectMigrationTargetRequirementFields: [],
    stripeConnectMigrationTargetFeesCollector: "stripe",
    stripeConnectMigrationTargetLossesCollector: "stripe",
    stripeConnectMigrationTargetPayoutBankLast4: "4242",
  };
  assert.equal(stripePayoutSetupIsComplete(readyTarget), true);

  const corporateFlow = stripePayoutSetupFlowForCenters([
    { id: "center_1", customFields: activeSource },
    { id: "center_2", customFields: { ...activeSource, stripeConnectMigrationTargetAccountId: "acct_target_2" } },
  ], { userEmail: "CORPSCHOOLS@KIDCITYUSA.COM" });
  assert.equal(corporateFlow.href, CORPORATE_STRIPE_PORTFOLIO_PATH);

  const ordinaryMultiSchoolFlow = stripePayoutSetupFlowForCenters([
    { id: "center_1", customFields: activeSource },
    { id: "center_2", customFields: { ...activeSource, stripeConnectMigrationTargetAccountId: "acct_target_2" } },
  ]);
  assert.equal(ordinaryMultiSchoolFlow.href, PAYOUT_SETUP_SETTINGS_PATH);

  const operatorOnlyCenterFlow = stripePayoutSetupFlowForCenters([{
    id: "center_1",
    customFields: activeSource,
    stripeReauthorizationAvailable: false,
  }]);
  assert.equal(operatorOnlyCenterFlow.href, PAYOUT_SETUP_SETTINGS_PATH);
});

test("dashboard and setup checklists route prepared schools through secure reauthorization", () => {
  const dashboardPage = readFileSync("src/app/dashboard/page.tsx", "utf8");
  const dashboard = readFileSync("src/components/dashboard.tsx", "utf8");
  const schoolSetup = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const payoutPanel = readFileSync("src/components/stripe-connect-panel.tsx", "utf8");

  assert.match(dashboardPage, /stripePayoutSetupFlowForCenters/);
  assert.match(dashboardPage, /directorLaunchChecklistTasksForPayoutSetup/);
  assert.match(dashboard, /checklist\.tasks/);
  assert.match(schoolSetup, /directorChecklistTasks: directorLaunchChecklistTasksForPayoutSetup/);
  assert.match(schoolSetup, /definition\.field === "integrationSetup" \? payoutSetupFlow\.href/);
  assert.match(schoolSetup, /Open school payout setup/);
  assert.match(schoolSetup, /Open other integrations/);
  assert.match(payoutPanel, /id="payout-setup"/);
  assert.match(payoutPanel, /stripeReauthorizationHref\(center\.id\)/);
  assert.match(payoutPanel, /center\.stripeReauthorizationAvailable !== false/);
  assert.match(payoutPanel, /authorized corporate representative/);
  assert.match(schoolSetup, /readCorporateStripeVerificationTarget/);
  assert.match(schoolSetup, /canUseCorporateStripeVerification/);
});

test("approved corporate verification links are current-due only and cannot invoke the software-fee action", () => {
  const verification = readFileSync("src/lib/corporate-stripe-verification.ts", "utf8");
  const schoolPage = readFileSync("src/app/stripe-reauthorization/page.tsx", "utf8");
  const card = readFileSync("src/components/corporate-stripe-verification-card.tsx", "utf8");
  const migrationRoute = readFileSync("src/app/api/billing/connect/migration/route.ts", "utf8");
  const refreshRoute = readFileSync("src/app/api/billing/connect/migration/refresh/route.ts", "utf8");

  assert.match(verification, /PLATFORM_OWNER[\s\S]*BRAND_ADMIN/);
  assert.match(verification, /BILLING_ADMIN[\s\S]*CORPORATE_SCHOOLS_EMAIL/);
  assert.doesNotMatch(verification, /REGIONAL_MANAGER|CENTER_DIRECTOR|ASSISTANT_DIRECTOR/);
  assert.match(verification, /scopeType: "CENTER"/);
  assert.match(verification, /canAccessCenter\(user, center\.id\)/);
  assert.match(verification, /center\.organization\.tenantId !== user\.tenantId/);
  assert.match(verification, /isActive: true/);
  assert.match(verification, /startsAt: \{ lte: now \}/);
  assert.match(verification, /endsAt: \{ gte: now \}/);
  assert.match(verification, /migration\.targetAccountId !== expected\.accountId/);
  assert.match(schoolPage, /retrieveStripeConnectedAccount/);
  assert.match(schoolPage, /stripeVerificationState/);
  assert.match(schoolPage, /CorporateStripeVerificationCard/);
  assert.match(schoolPage, /Terms of service/);
  assert.doesNotMatch(schoolPage, /\$99|monthly BEE Suite fee/);
  assert.match(card, /autoStart/);
  assert.match(card, /termsAccepted/);
  assert.match(card, /authorizedRepresentative: true/);
  assert.match(card, /I agree to the terms of service/);
  assert.doesNotMatch(card, /\$99|software-payment-method|stripe_balance/);
  const standardCard = readFileSync("src/components/stripe-reauthorization-card.tsx", "utf8");
  assert.match(standardCard, /I agree to the terms of service/);
  assert.doesNotMatch(standardCard, /\$99|software-payment-method|stripe_balance/);
  assert.match(migrationRoute, /collectionFields: corporateVerification \? "currently_due" : "eventually_due"/);
  assert.match(migrationRoute, /stripeConnectMigrationTargetRequirementFields: target\.account\.currentlyDueRequirementFields/);
  assert.match(migrationRoute, /const payoutBank = corporateStripeConfirmedPayoutBank\(banks\.banks\)/);
  assert.match(migrationRoute, /includeFutureRequirements: !corporateVerification/);
  assert.match(refreshRoute, /collectionFields: corporateVerification \? "currently_due" : "eventually_due"/);
  assert.match(refreshRoute, /includeFutureRequirements: !corporateVerification/);
  assert.match(refreshRoute, /portfolio=corporate&start=1/);
  assert.match(migrationRoute, /corporateStripeVerificationBindingIsValid/);
  assert.match(refreshRoute, /corporateStripeVerificationBindingIsValid/);
  assert.match(migrationRoute, /corporateStripePayoutBankIsConfirmed/);
  assert.match(refreshRoute, /corporateStripePayoutBankIsConfirmed/);
  assert.ok(migrationRoute.indexOf("if (corporateVerification)") < migrationRoute.indexOf("const [target, banks]"));
  const postStatusCheck = migrationRoute.indexOf("const verificationStatus = stripeVerificationState(target.account,");
  const reservationWrite = migrationRoute.indexOf("stripeConnectMigrationStatus: \"onboarding_opened\"");
  assert.ok(postStatusCheck >= 0);
  assert.ok(reservationWrite >= 0);
  assert.ok(postStatusCheck < reservationWrite);
  assert.match(migrationRoute, /authorizedRepresentativeConfirmed: true/);
  assert.match(migrationRoute, /termsAccepted: true/);
  assert.doesNotMatch(migrationRoute, /stripeConnectAccountId\s*:/);
  assert.doesNotMatch(refreshRoute, /stripeConnectAccountId\s*:/);
});

test("cutover is one-school-at-a-time and records the retained saved-method transition", () => {
  const cutover = readFileSync("scripts/cutover-stripe-connect-migration.ts", "utf8");
  assert.match(cutover, /--center-id is required/);
  assert.match(cutover, /--acknowledge-parent-payment-cutover/);
  assert.match(cutover, /currentSourceBankFingerprint !== storedSourceBankFingerprint/);
  assert.match(cutover, /sourcePayoutInterval !== "manual" \|\| targetPayoutInterval !== "manual"/);
  assert.match(cutover, /stripeConnectMigrationSourceSavedMethodsRemaining: sourceScopedSavedMethods\.length/);
  assert.match(cutover, /stripeConnectMigrationSourceAutopayRemaining: sourceScopedAutopay\.length/);
  assert.match(cutover, /stripeConnectMigrationPayoutReleaseStatus: "blocked_until_parent_payment_and_reconciliation_verified"/);
  assert.doesNotMatch(cutover, /createStripeBalanceSoftwareSubscription|getKidCitySoftwareFeeUnitAmountCents/);
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
  assert.match(replacement, /storedReservationAt: plan\.storedReservationAt/);
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
  assert.match(replacement, /stripeConnectMigrationPreviousTargetLastOnboardingAt: plan\.storedReservationAt/);
  assert.match(replacement, /stripeConnectMigrationLastOnboardingAt: null/);
  assert.match(replacement, /stripeConnectMigrationLastOnboardingFailureAt: null/);
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
