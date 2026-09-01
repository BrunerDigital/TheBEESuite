import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getPasswordResetRedirectUrl,
  getParentPortalPasswordResetRedirectUrl,
  getParentPortalSetupUrl,
  PARENT_PORTAL_SETUP_PATH,
} from "@/lib/supabase-auth";

const savedEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  APP_URL: process.env.APP_URL,
  AUTH_PASSWORD_RESET_REDIRECT_URL: process.env.AUTH_PASSWORD_RESET_REDIRECT_URL,
  VERCEL_URL: process.env.VERCEL_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test.afterEach(restoreEnv);

test("parent portal invite links land on setup instead of registration", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://thebeesuite.io/";
  delete process.env.APP_URL;
  process.env.AUTH_PASSWORD_RESET_REDIRECT_URL = "https://thebeesuite.io/registration";
  delete process.env.VERCEL_URL;

  assert.equal(PARENT_PORTAL_SETUP_PATH, "/parent-portal/setup");
  assert.equal(getParentPortalSetupUrl("https://preview.example.com/request"), "https://thebeesuite.io/parents/setup");
  assert.equal(
    getParentPortalPasswordResetRedirectUrl("https://preview.example.com/request"),
    "https://thebeesuite.io/reset-password?next=%2Fparent-portal%2Fsetup",
  );
});

test("parent portal invite links fall back to request origin", () => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_URL;
  delete process.env.AUTH_PASSWORD_RESET_REDIRECT_URL;
  delete process.env.VERCEL_URL;

  assert.equal(getParentPortalSetupUrl("https://pilot.thebeesuite.io/api/parent/invitations"), "https://pilot.thebeesuite.io/parents/setup");
  assert.equal(
    getPasswordResetRedirectUrl("https://pilot.thebeesuite.io/api/auth/forgot-password", PARENT_PORTAL_SETUP_PATH),
    "https://pilot.thebeesuite.io/reset-password?next=%2Fparent-portal%2Fsetup",
  );
});

test("parent setup link issuance cannot strand an active parent after provider failure", () => {
  const source = readFileSync(new URL("../src/lib/parent-portal-setup-links.ts", import.meta.url), "utf8");
  const issueLink = source.slice(
    source.indexOf("export async function issueParentPortalSetupLink"),
    source.indexOf("export async function recordParentPortalSetupLinkDelivery"),
  );
  assert.match(issueLink, /generateSupabasePasswordRecoveryLink/);
  assert.doesNotMatch(issueLink, /updateSupabaseAuthUserPasswordByEmail|randomBytes/);
  assert.ok(
    issueLink.indexOf("generateSupabasePasswordRecoveryLink") < issueLink.indexOf("sessionVersion: { increment: 1 }"),
    "the usable recovery token must exist before the app reset gate is committed",
  );
});

test("setup-link flows randomize only new parent credentials", () => {
  const provisioning = readFileSync(new URL("../src/lib/parent-portal-logins.ts", import.meta.url), "utf8");
  const registrationReview = readFileSync(new URL("../src/app/api/registration/[id]/review/route.ts", import.meta.url), "utf8");
  const documentRequests = readFileSync(new URL("../src/lib/parent-document-requests.ts", import.meta.url), "utf8");
  assert.match(registrationReview, /randomizeNewCredential:\s*true/);
  assert.match(documentRequests, /linkedReason:\s*"parent_document_request",[\s\S]*randomizeNewCredential:\s*true/);
  assert.match(documentRequests, /login\.requiresSetupLink/);
  assert.match(provisioning, /existingUser\?\.mustResetPassword && !resetToInitialPassword/);
  assert.match(provisioning, /requiresSetupLink,/);
  assert.match(provisioning, /prepareWithoutInvite \|\| randomizeNewCredential/);
  assert.match(
    provisioning,
    /updateExistingPassword:\s*resetToInitialPassword \|\| \(randomizeNewCredential && !existingUser\)/,
  );
});

test("direct parent invitations preflight ProCare data and activate prepared accounts only when invited", () => {
  const source = readFileSync(new URL("../src/app/api/parent/invitations/route.ts", import.meta.url), "utf8");
  assert.match(source, /evaluateParentInvitationReadiness/);
  assert.match(source, /buildParentLoginSetupUrl/);
  assert.match(source, /preparedWithoutInvite/);
  assert.match(source, /resetToInitialPassword:\s*preparedWithoutInvite/);
  assert.match(source, /parentPortalInvitationSentFields/);
  assert.match(source, /provisioned\.status\s*>=\s*400/);
});

test("payer portal preparation is explicit, audited, and cannot send invitations", () => {
  const source = readFileSync(new URL("../scripts/prepare-payer-portal-accounts.ts", import.meta.url), "utf8");
  assert.match(source, /--acknowledge-no-invites/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /safeTargetFingerprint/);
  assert.match(source, /isSupabaseAuthCompatibleEmail/);
  assert.match(source, /hasConflictingGuardianFamilyLinks/);
  assert.match(source, /hasActiveParentLink/);
  assert.match(source, /linked app user has a different email/);
  assert.match(source, /linked to a non-parent app user/);
  const provisioning = readFileSync(new URL("../src/lib/parent-portal-logins.ts", import.meta.url), "utf8");
  assert.match(provisioning, /email:\s*\{ equals: email, mode: "insensitive" \}/);
  assert.match(provisioning, /prisma\.user\.update/);
  assert.match(source, /prepareWithoutInvite:\s*!existingUser \|\| !existingAuthEmails\.has\(email\)/);
  assert.match(source, /--include-authorized-pickups/);
  assert.match(source, /--exclude-tx-tyler/);
  assert.match(source, /pickupExternalIds\.has\(clean\(guardian\.externalId\)\)/);
  assert.match(source, /Supabase Auth account exists without a matching app parent user/);
  assert.match(source, /parent_portal\.payer_account_prepared/);
  assert.match(source, /invitationSent:\s*false/);
  assert.doesNotMatch(source, /sendEmail|issueParentPortalSetupLink|recordEmailDeliveryAttempt/);
});

test("production payer invitation waves are corporate-scoped, explicit, and API-guarded", () => {
  const source = readFileSync(new URL("../scripts/send-kidcity-parent-invitation-wave.ts", import.meta.url), "utf8");
  assert.match(source, /--apply/);
  assert.match(source, /--confirm-production-send/);
  assert.match(source, /TARGET_LOCATIONS = \["Beach Blvd", "Oakleaf", "Canton NC"\]/);
  assert.match(source, /rolloutSchoolEmailCandidates/);
  assert.match(source, /centerMatches\.length !== 1/);
  assert.match(source, /function isParentPayerGuardian/);
  assert.match(source, /guardian\.isBillingContact/);
  assert.match(source, /guardian\.family\.pickups\.some/);
  assert.match(source, /clean\(pickup\.externalId\) === externalId/);
  assert.match(source, /preparedWithoutInvite/);
  assert.match(source, /existingLinkedAccountReady/);
  assert.match(source, /guardian\.user\.role === UserRole\.PARENT_GUARDIAN/);
  assert.match(source, /authEmails\.has\(normalizedEmail\)/);
  assert.match(source, /prior_delivery_pending_retry/);
  assert.match(source, /\/api\/parent\/invitations/);
  assert.match(source, /verifySupabasePassword\(email\(guardian\.email\), DEFAULT_PARENT_INITIAL_PASSWORD\)/);
  assert.match(source, /parentPortalFields\(guardian\.customFields\)\.preparedWithoutInvite === true/);
  assert.match(source, /existingAccountInvites/);
  assert.match(source, /your BEE Suite Parent Portal is ready/);
  assert.match(source, /Critical stop/);
  assert.doesNotMatch(source, /sendEmail|ensureParentPortalLoginForGuardian/);
});

test("all-location imported parent waves require concrete relationship safety and explicit live authorization", () => {
  const source = readFileSync(new URL("../scripts/send-imported-parent-invitation-wave.ts", import.meta.url), "utf8");
  assert.match(source, /--confirm-all-imported-locations/);
  assert.match(source, /--scope-miss-honeys/);
  assert.match(source, /--confirm-miss-honeys-locations/);
  assert.match(source, /--acknowledge-director-confirmation-waived/);
  assert.match(source, /--repair-interrupted-preparation-flags/);
  assert.match(source, /--retry-unconfigured-provider-skips/);
  assert.match(source, /--use-direct-import-profile-evidence-authorized-by-user/);
  assert.match(source, /--acknowledge-prior-invited-inactive-profiles-excluded/);
  assert.match(source, /"kid-city-usa"/);
  assert.match(source, /miss-honeys-learning-center/);
  assert.match(source, /trial_setup/);
  assert.match(source, /Expected exactly one active center-director audit actor/);
  assert.match(source, /scope === "miss_honeys"/);
  assert.match(source, /hasActiveChild/);
  assert.match(source, /scope !== "miss_honeys" && matches\.some/);
  assert.match(source, /verifiedParentPayer/);
  assert.match(source, /exactAuthorizedPickup/);
  assert.doesNotMatch(source, /evaluateProcareInvitationBatchReadiness/);
  assert.doesNotMatch(source, /procareImportBatch\.findMany/);
  assert.doesNotMatch(source, /latestBatchByFamilyId/);
  assert.match(source, /alreadyInvitedOutsideCurrentReadiness/);
  assert.doesNotMatch(source, /verified_guardian_source_id_required/);
  assert.doesNotMatch(source, /verified_family_source_id_required/);
  assert.doesNotMatch(source, /all_active_children_verified_required/);
  assert.doesNotMatch(source, /reviewed_import_batch_required/);
  assert.match(source, /directProfileEvidenceAuthorizedByUser/);
  assert.match(source, /active_child_required/);
  assert.match(source, /cross_center_email/);
  assert.match(source, /same_center_multiple_families/);
  assert.match(source, /conflicting_guardian_identity/);
  assert.match(source, /parentPortalAccessDisabled/);
  assert.match(source, /already_invited/);
  assert.match(source, /prior_delivery_requires_manual_review/);
  assert.match(source, /delivery\.lastError === "SendGrid is not configured\."/);
  assert.match(source, /Live sending requires a configured platform SendGrid key and sender address/);
  assert.match(source, /ensureParentPortalLoginForGuardian/);
  assert.match(source, /recordEmailDeliveryAttempt/);
  assert.match(source, /parentPortalInvitationSentFields/);
  assert.match(source, /verifySupabasePassword/);
  assert.match(source, /directorConfirmationWaivedByUser: true/);
  assert.match(source, /const branding = BEE_SUITE_BRANDING/);
  assert.match(source, /fromName: branding\.name/);
});

test("Tyler portal preparation is school-scoped, source-locked, and cannot send invitations", () => {
  const source = readFileSync(new URL("../scripts/prepare-tyler-parent-portal-accounts.ts", import.meta.url), "utf8");
  assert.match(source, /CENTER_LOCATION_ID = "Kid City USA - TX \| Tyler"/);
  assert.match(source, /IMPORT_SOURCE = "tyler_procare_cross_report_import_2026_07_31"/);
  assert.match(source, /EXPECTED_ENROLLED_CHILDREN = 133/);
  assert.match(source, /EXPECTED_ENROLLED_FAMILIES = 98/);
  assert.match(source, /--confirm-tx-tyler/);
  assert.match(source, /--acknowledge-no-invites/);
  assert.match(source, /--recover-prepared-auth-orphan/);
  assert.match(source, /--repair-interrupted-preparation-flags/);
  assert.match(source, /prepareWithoutInvite: !account\.appUserExists \|\| !account\.authUserExists/);
  assert.match(source, /invitationSent: false/);
  assert.doesNotMatch(source, /sendEmail|inviteUserByEmail|issueParentPortalSetupLink|recordEmailDeliveryAttempt/);
});

test("Longmont PDF balance and parent access reconciliation is source-locked and payment-preserving", () => {
  const source = readFileSync(new URL("../scripts/reconcile-longmont-pdf-parent-access.ts", import.meta.url), "utf8");
  const balanceApply = source.slice(source.indexOf("async function applyBalances"), source.indexOf("async function resetAndVerifyExistingAccess"));
  assert.match(source, /--confirm-longmont-pdf-reconciliation/);
  assert.match(source, /--confirm-preserve-payments-and-invoices/);
  assert.match(source, /--confirm-reset-invited-parent-passwords/);
  assert.match(source, /ac04f12c3c011041d2ea60a6fe33bbaf36c564906a10d49b3eb35a746a974b78/);
  assert.match(source, /EXPECTED_PDF_ROWS = 135/);
  assert.match(source, /EXPECTED_MATCHED_FAMILIES = 115/);
  assert.match(source, /paymentsMutated: false/);
  assert.match(source, /invoicesMutated: false/);
  assert.match(source, /longmont_pdf_password_verified/);
  assert.match(source, /verifySupabasePassword/);
  assert.match(source, /EXPECTED_NEW_INVITES = 7/);
  assert.match(balanceApply, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(balanceApply, /changed after its Longmont reconciliation; refusing to overwrite later activity/);
  assert.match(balanceApply, /changed before reconciliation commit/);
  assert.ok(balanceApply.indexOf("const existingLedger") < balanceApply.indexOf("tx.billingAccount.upsert"));
});

test("Granbury timeout retry is single-delivery scoped and explicitly authorized", () => {
  const source = readFileSync(new URL("../scripts/retry-granbury-parent-invite-timeout.ts", import.meta.url), "utf8");
  assert.match(source, /--confirm-granbury-parent-invite-timeout-retry/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /providerMessageId: null/);
  assert.match(source, /Expected one scoped Granbury timeout delivery/);
  assert.match(source, /claimIntegrationDeliveryForRetry/);
  assert.ok(source.indexOf("claimIntegrationDeliveryForRetry({") < source.indexOf("result = await sendEmail"));
  assert.match(source, /disableClickTracking: true/);
  assert.match(source, /verifySupabasePassword/);
  assert.match(source, /parent_portal\.guardian_invitation_timeout_retry_accepted/);
  assert.match(source, /deliveryRecordReused: true/);
});
