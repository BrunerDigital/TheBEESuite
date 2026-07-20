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

  assert.match(login, /value=\{email\}/);
  assert.match(login, /could not reach the sign-in service/i);
  assert.match(forgot, /value=\{email\}/);
  assert.match(forgot, /Your email is still here/i);
  assert.match(reset, /value=\{password\}/);
  assert.match(reset, /value=\{confirmPassword\}/);
  assert.match(reset, /Your entries are still here/i);
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
  assert.match(paymentForm, /retry with Instant Bank Login or Debit\/Credit Card/i);
  assert.match(paymentForm, /paymentStatus === "success"/);
  assert.match(paymentForm, /secure payment confirmation/i);
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
  assert.match(sources, /aria-describedby=/);
});
