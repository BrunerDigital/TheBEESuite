import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("critical onboarding and payment entry points explain connection failures", () => {
  const login = readFileSync("src/components/login-form.tsx", "utf8");
  const parentSetup = readFileSync("src/components/parent-portal-setup-form.tsx", "utf8");
  const paymentSetup = readFileSync("src/components/payment-method-request-form.tsx", "utf8");
  const paymentPage = readFileSync("src/app/payment-method-form/[token]/page.tsx", "utf8");

  assert.match(login, /could not reach the sign-in service/i);
  assert.match(parentSetup, /Your entries are still here/i);
  assert.match(paymentSetup, /No payment was started/i);
  assert.match(paymentSetup, /payment-method-request\/session/);
  assert.match(paymentSetup, /payment-method-request\/checkout/);
  assert.match(paymentPage, /Ask your school office to send a new secure payment setup link/i);
  assert.match(paymentPage, /Return to parent portal sign in/i);
});

test("login and password recovery preserve controlled input when services are unreachable", () => {
  const login = readFileSync("src/components/login-form.tsx", "utf8");
  const forgot = readFileSync("src/components/forgot-password-form.tsx", "utf8");
  const reset = readFileSync("src/components/reset-password-form.tsx", "utf8");
  const forgotRoute = readFileSync("src/app/api/auth/forgot-password/route.ts", "utf8");

  assert.match(login, /value=\{email\}/);
  assert.match(login, /could not reach the sign-in service/i);
  assert.match(forgot, /value=\{email\}/);
  assert.match(forgot, /Your email is still here/i);
  assert.match(reset, /value=\{password\}/);
  assert.match(reset, /value=\{confirmPassword\}/);
  assert.match(reset, /Your entries are still here/i);
  assert.match(reset, /linkStatus === "ready"/);
  assert.match(reset, /Reset link unavailable/);
  assert.match(reset, /Request a new reset link/);
  assert.match(reset, /addEventListener\("hashchange", resolveCurrentRecoveryState\)/);
  assert.match(reset, /removeEventListener\("hashchange", resolveCurrentRecoveryState\)/);
  assert.match(reset, /passwordRecoveryUrlWithoutSecrets\(window\.location\.href\)/);
  assert.match(forgot, /Use only the newest email/i);
  assert.match(forgotRoute, /generateSupabasePasswordRecoveryLink/);
  assert.match(forgotRoute, /buildPasswordResetTokenUrl/);
  assert.match(forgotRoute, /disableClickTracking:\s*true/);
  assert.match(forgotRoute, /categories:\s*\["password-reset",\s*"transactional"\]/);
  assert.doesNotMatch(forgotRoute, /requestSupabasePasswordReset\(/);
  assert.match(forgotRoute, /status:\s*503/);
  assert.match(forgotRoute, /providerStatus === 429/);
  assert.match(forgotRoute, /providerStatus === 0/);
  assert.doesNotMatch(forgotRoute, /if \(!delivery\.ok\)[\s\S]{0,400}status:\s*503/);
  assert.match(readFileSync("src/lib/supabase-auth.ts", "utf8"), /AbortSignal\.timeout\(10_000\)/);
  assert.match(forgotRoute, /delivery_unavailable/);
  assert.match(forgotRoute, /passwordResetEmailCooldownKey\(email\)/);
  assert.match(forgotRoute, /passwordResetIpVolumeKey\(ip\)/);
  assert.doesNotMatch(forgotRoute, /forgot-password:\$\{[^}]*email/);
  assert.doesNotMatch(forgotRoute, /metadata:[^\n]*(email|recipient)/i);
});

test("parent sign-in and setup use invitation-specific credentials and current install guidance", () => {
  const login = readFileSync("src/components/login-form.tsx", "utf8");
  const parentSetup = readFileSync("src/components/parent-portal-setup-form.tsx", "utf8");
  const forgot = readFileSync("src/components/forgot-password-form.tsx", "utf8");
  const reset = readFileSync("src/components/reset-password-form.tsx", "utf8");
  const webPush = readFileSync("src/components/web-push-control.tsx", "utf8");
  const parentTrustSurfaces = [login, parentSetup, forgot, reset, webPush].join("\n");

  assert.match(login, /password from your school invitation/i);
  assert.match(parentSetup, /Review Your Family/i);
  assert.doesNotMatch(parentSetup, /Use Your School Invitation/i);
  assert.match(login, /Forgot password/i);
  assert.doesNotMatch([login, parentSetup].join("\n"), /BusyBees|default (?:first[- ]login )?password/i);
  assert.match(parentSetup, /Add the Parent Portal to your Home Screen/i);
  assert.doesNotMatch(parentSetup, /App Store app is expected|within about a week|coming soon/i);
  assert.match(webPush, /Device alerts aren’t available yet/i);
  assert.match(webPush, /Alerts Unavailable/);
  assert.doesNotMatch(webPush, /Push setup pending|secure server configuration/i);
  assert.doesNotMatch(parentTrustSurfaces, /PARENT_GUARDIAN|live pilot|pilot safeguards|role-gated|human-reviewed|AI-generated/i);
});

test("payment return states cover expiry, cancellation, failure, retry, and confirmation", () => {
  const paymentForm = readFileSync("src/components/payment-method-request-form.tsx", "utf8");
  const paymentPage = readFileSync("src/app/payment-method-form/[token]/page.tsx", "utf8");
  const checkoutRoute = readFileSync("src/app/api/billing/payment-method-request/checkout/route.ts", "utf8");

  assert.match(paymentPage, /payment setup link unavailable/i);
  assert.match(paymentPage, /send a new secure payment setup link/i);
  assert.match(paymentForm, /paymentStatus === "cancelled"/);
  assert.match(paymentForm, /No payment was submitted/i);
  assert.match(paymentForm, /paymentStatus === "failed"/);
  assert.match(paymentForm, /try again using a bank account or debit or credit card/i);
  assert.match(paymentForm, /paymentStatus === "success"/);
  assert.match(paymentForm, /payment method was submitted/i);
  assert.match(paymentForm, /review the current status and receipt/i);
  assert.match(paymentForm, /Open the Parent Portal/i);
  assert.match(checkoutRoute, /successUrl/);
  assert.match(checkoutRoute, /cancelUrl/);
});

test("critical public forms retain accessible labels, announcements, focus rings, and touch targets", () => {
  const alert = readFileSync("src/components/ui/alert.tsx", "utf8");
  const input = readFileSync("src/components/ui/input.tsx", "utf8");
  const button = readFileSync("src/components/ui/button.tsx", "utf8");
  const sources = [
    readFileSync("src/components/login-form.tsx", "utf8"),
    readFileSync("src/components/forgot-password-form.tsx", "utf8"),
    readFileSync("src/components/reset-password-form.tsx", "utf8"),
    readFileSync("src/components/parent-portal-setup-form.tsx", "utf8"),
    readFileSync("src/components/payment-method-request-form.tsx", "utf8"),
  ].join("\n");

  assert.match(alert, /role="alert"/);
  assert.match(input, /focus-visible:ring-3/);
  assert.match(button, /focus-visible:ring-3/);
  assert.match(sources, /<Label htmlFor=/);
  assert.match(sources, /className="h-11"/);
  assert.match(sources, /min-h-11/);
  assert.match(sources, /aria-describedby=/);
});
