import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync("src/components/login-form.tsx", "utf8");
const forgotPassword = readFileSync("src/components/forgot-password-form.tsx", "utf8");
const resetPassword = readFileSync("src/components/reset-password-form.tsx", "utf8");
const paymentRequest = readFileSync("src/app/payment-method-form/[token]/page.tsx", "utf8");
const paymentShortLink = readFileSync("src/app/payment-method-form/r/[code]/page.tsx", "utf8");
const parentWorkspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const previewQa = readFileSync("scripts/qa-device-preview.ts", "utf8");

test("general sign-in routes every supported role family to an actionable portal", () => {
  for (const href of ["/executives", "/directors", "/teachers", "/parents"]) {
    assert.match(login, new RegExp(`href: ["']${href}["']`));
  }
  for (const role of [
    "Platform owners",
    "brand admins",
    "regional managers",
    "read-only auditors",
    "Directors",
    "assistant directors",
    "billing administrators",
    "Teachers",
    "Parents",
    "authorized pickup users",
  ]) {
    assert.match(login, new RegExp(role, "i"));
  }
  assert.match(login, /<nav aria-label="Choose a role-specific sign-in page"/);
});

test("recovery and invalid payment-link screens expose one main landmark and a page heading", () => {
  assert.match(forgotPassword, /<main className=/);
  assert.match(resetPassword, /<main className=/);
  assert.match(paymentRequest, /<h1[^>]*>Payment setup link unavailable<\/h1>/);
  assert.match(paymentShortLink, /<h1[^>]*>Payment setup link unavailable<\/h1>/);
});

test("family section tabs stay within their scroll container at tablet widths", () => {
  assert.match(parentWorkspace, /id="parent-family-section-nav" className="[^"]*max-w-full[^"]*overflow-x-auto/);
  assert.doesNotMatch(parentWorkspace, /id="parent-family-section-nav" className="[^"]*sm:min-w-max/);
  assert.match(parentWorkspace, /md:grid md:grid-cols-3 md:overflow-visible xl:grid-cols-6/);
});

test("device preview permits inert local brand-media links without permitting app navigation", () => {
  assert.match(previewQa, /url\.pathname\.startsWith\("\/brand\/"\)/);
  assert.match(previewQa, /url\.pathname !== "\/device-preview"/);
});
