import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPIRED_PASSWORD_RECOVERY_LINK_MESSAGE,
  MISSING_PASSWORD_RECOVERY_LINK_MESSAGE,
  passwordRecoveryUrlWithoutSecrets,
  resolvePasswordRecoveryLink,
  UNVERIFIED_PASSWORD_RECOVERY_LINK_MESSAGE,
} from "@/lib/password-recovery-url";

test("password recovery accepts BEE-generated token hashes", () => {
  assert.deepEqual(
    resolvePasswordRecoveryLink("?token_hash=hash_123&type=recovery&next=%2Fparent-portal%2Fsetup", ""),
    { status: "ready", credential: { tokenHash: "hash_123" } },
  );
});

test("password recovery accepts Supabase implicit-flow access tokens", () => {
  assert.deepEqual(
    resolvePasswordRecoveryLink("?next=%2Fdashboard", "#access_token=access_123&type=recovery&expires_in=3600"),
    { status: "ready", credential: { accessToken: "access_123" } },
  );
});

test("password recovery identifies expired or already-consumed query redirects", () => {
  assert.deepEqual(
    resolvePasswordRecoveryLink(
      "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&next=%2Fdashboard",
      "",
    ),
    { status: "invalid", reason: "expired", message: EXPIRED_PASSWORD_RECOVERY_LINK_MESSAGE },
  );
});

test("password recovery identifies provider errors returned in URL fragments", () => {
  assert.deepEqual(
    resolvePasswordRecoveryLink("?next=%2Fdashboard", "#error=access_denied&error_description=Verification+failed"),
    { status: "invalid", reason: "unverified", message: UNVERIFIED_PASSWORD_RECOVERY_LINK_MESSAGE },
  );
});

test("password recovery blocks missing and unsupported credentials before password entry", () => {
  assert.deepEqual(resolvePasswordRecoveryLink("?next=%2Fdashboard", ""), {
    status: "invalid",
    reason: "missing",
    message: MISSING_PASSWORD_RECOVERY_LINK_MESSAGE,
  });
  assert.deepEqual(resolvePasswordRecoveryLink("?code=pkce_without_verifier&next=%2Fdashboard", ""), {
    status: "invalid",
    reason: "unverified",
    message: UNVERIFIED_PASSWORD_RECOVERY_LINK_MESSAGE,
  });
});

test("password recovery removes credentials and provider errors while preserving safe routing", () => {
  assert.equal(
    passwordRecoveryUrlWithoutSecrets(
      "https://thebeesuite.io/reset-password?token_hash=hash_123&type=recovery&next=%2Fparent-portal%2Fsetup#error=access_denied",
    ),
    "/reset-password?next=%2Fparent-portal%2Fsetup",
  );
});
