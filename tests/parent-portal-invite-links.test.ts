import assert from "node:assert/strict";
import test from "node:test";
import {
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
  assert.equal(getParentPortalSetupUrl("https://preview.example.com/request"), "https://thebeesuite.io/parent-portal/setup");
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

  assert.equal(getParentPortalSetupUrl("https://pilot.thebeesuite.io/api/parent/invitations"), "https://pilot.thebeesuite.io/parent-portal/setup");
});
