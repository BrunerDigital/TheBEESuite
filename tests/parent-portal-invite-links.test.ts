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
  assert.match(source, /isBillingContact:\s*true/);
  assert.match(source, /preparedWithoutInvite/);
  assert.match(source, /prior_delivery_pending_retry/);
  assert.match(source, /\/api\/parent\/invitations/);
  assert.match(source, /verifySupabasePassword\(email\(guardian\.email\), DEFAULT_PARENT_INITIAL_PASSWORD\)/);
  assert.match(source, /Critical stop/);
  assert.doesNotMatch(source, /sendEmail|ensureParentPortalLoginForGuardian/);
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
