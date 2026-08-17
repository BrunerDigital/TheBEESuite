import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  "src/components/parent-portal-workspace.tsx",
  "utf8",
);
const kioskCredentials = readFileSync(
  "src/components/parent-kiosk-credential-panel.tsx",
  "utf8",
);

const actionContracts = [
  [workspace, "/api/parent/tuition-cadence", "src/app/api/parent/tuition-cadence/route.ts"],
  [workspace, "/api/communications/messages", "src/app/api/communications/messages/route.ts"],
  [workspace, "/api/parent/contact-requests", "src/app/api/parent/contact-requests/route.ts"],
  [workspace, "/api/parent/incidents/", "src/app/api/parent/incidents/[id]/acknowledge/route.ts"],
  [workspace, "/api/billing/family-payment", "src/app/api/billing/family-payment/route.ts"],
  [workspace, "/api/billing/checkout-session", "src/app/api/billing/checkout-session/route.ts"],
  [workspace, "/api/parent/products/purchase", "src/app/api/parent/products/purchase/route.ts"],
  [workspace, "/api/billing/payment-method-session", "src/app/api/billing/payment-method-session/route.ts"],
  [workspace, "/api/parent/preferences", "src/app/api/parent/preferences/route.ts"],
  [workspace, "/api/profile/password", "src/app/api/profile/password/route.ts"],
  [workspace, "/api/privacy/deletion-requests", "src/app/api/privacy/deletion-requests/route.ts"],
  [workspace, "/api/parent/documents/", "src/app/api/parent/documents/[id]/submit/route.ts"],
  [kioskCredentials, "/api/parent/kiosk-credential", "src/app/api/parent/kiosk-credential/route.ts"],
] as const;

test("every parent portal action points to a concrete POST route", () => {
  for (const [source, requestPath, routePath] of actionContracts) {
    assert.match(source, new RegExp(requestPath.replaceAll("/", "\\/")), requestPath);
    assert.equal(existsSync(routePath), true, routePath);
    assert.match(
      readFileSync(routePath, "utf8"),
      /export (?:async function|const) POST\b/,
      routePath,
    );
  }
});

test("parent billing and setup actions resolve one linked family before mutation", () => {
  for (const routePath of [
    "src/app/api/parent/tuition-cadence/route.ts",
    "src/app/api/parent/products/purchase/route.ts",
    "src/app/api/parent/kiosk-credential/route.ts",
    "src/app/api/parent/setup/route.ts",
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
  ]) {
    const route = readFileSync(routePath, "utf8");
    assert.match(route, /getCurrentUser\(\)/, routePath);
    assert.match(route, /getParentPortalFamilyScope\(user\.id, user\.tenantId,/, routePath);
  }
});

test("record-level parent actions recheck the signed-in guardian link", () => {
  const routes = [
    "src/app/api/communications/messages/route.ts",
    "src/app/api/parent/contact-requests/route.ts",
    "src/app/api/parent/documents/[id]/submit/route.ts",
    "src/app/api/parent/incidents/[id]/acknowledge/route.ts",
    "src/app/api/parent/preferences/route.ts",
    "src/app/api/privacy/deletion-requests/route.ts",
  ];

  for (const routePath of routes) {
    const route = readFileSync(routePath, "utf8");
    assert.match(route, /getCurrentUser\(\)/, routePath);
    assert.match(route, /guardian(?:\.userId|s\.some)[\s\S]{0,180}user\.id/, routePath);
  }
});

test("password and payment routes fail closed around identity and provider readiness", () => {
  const passwordRoute = readFileSync(
    "src/app/api/profile/password/route.ts",
    "utf8",
  );
  assert.match(passwordRoute, /verifySupabasePassword\(user\.email, currentPassword\)/);
  assert.match(passwordRoute, /updateSupabaseAuthUserPasswordByEmail/);
  assert.match(passwordRoute, /sessionVersion: \{ increment: 1 \}/);
  assert.match(passwordRoute, /checkPersistentRateLimit/);

  for (const routePath of [
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/checkout-session/route.ts",
  ]) {
    const route = readFileSync(routePath, "utf8");
    assert.match(route, /getStripeSecretKey/, routePath);
    assert.match(route, /getStripeWebhookSecret/, routePath);
    assert.match(route, /retrieveStripeConnectedAccount/, routePath);
  }
});

test("preview actions remain guarded before parent API calls", () => {
  assert.ok((workspace.match(/if \(previewOnly\(\)\) return;/g) ?? []).length >= 10);
  assert.match(workspace, /Preview only — no family information was changed\./);
  assert.match(kioskCredentials, /if \(previewMode\) return;/);
});

test("parent actions turn offline fetch failures into recoverable UI errors", () => {
  assert.match(
    workspace,
    /async function parentPortalRequest[\s\S]*try \{[\s\S]*return await fetch\(input, init\);[\s\S]*catch \{[\s\S]*status: 503/,
  );
  assert.match(
    workspace,
    /We could not reach The BEE Suite\. Check your connection and try again\./,
  );
  assert.equal((workspace.match(/\bfetch\(/g) ?? []).length, 1);
  assert.ok((workspace.match(/await parentPortalRequest\(/g) ?? []).length >= 13);
});

test("parent payment redirects preserve the selected family billing view", () => {
  assert.equal((workspace.match(/returnPath: workspaceHref\("family", \{ familyId: family\.id, section: "billing" \}\)/g) ?? []).length, 4);
  assert.doesNotMatch(workspace, /returnPath: "\/parent-portal"/);
});

test("parent account checkout keeps the workspace interactive and reports mobile progress inline", () => {
  const paymentAction = workspace.slice(
    workspace.indexOf("function payFamilyBalance"),
    workspace.indexOf("function payBalance"),
  );

  assert.doesNotMatch(paymentAction, /startTransition/);
  assert.match(paymentAction, /setPaymentCheckoutMethod\(paymentMethodCategory\)/);
  assert.match(paymentAction, /setPaymentCheckoutError\(message\)/);
  assert.match(workspace, /Opening secure checkout…/);
  assert.match(workspace, /Secure payment setup can take a few seconds on a mobile connection\./);
  assert.match(workspace, /No payment was started\. Choose a payment method to try again\./);
  assert.match(workspace, /aria-busy=\{paymentCheckoutMethod === "card"\}/);
});

test("profile password controls use a semantic form and submit contract", () => {
  assert.match(workspace, /<form[\s\S]*onSubmit=\{\(event\) => \{[\s\S]*updateProfilePassword\(\);/);
  assert.match(workspace, /id="profile-current-password"/);
  assert.match(workspace, /id="profile-new-password"/);
  assert.match(workspace, /id="profile-confirm-password"/);
  assert.match(workspace, /type="submit"[\s\S]{0,220}Update Password/);
});
