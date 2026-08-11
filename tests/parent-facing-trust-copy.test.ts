import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync("src/components/login-form.tsx", "utf8");
const forgotPassword = readFileSync("src/components/forgot-password-form.tsx", "utf8");
const resetPassword = readFileSync("src/components/reset-password-form.tsx", "utf8");
const parentSetup = readFileSync("src/components/parent-portal-setup-form.tsx", "utf8");
const webPush = readFileSync("src/components/web-push-control.tsx", "utf8");
const support = readFileSync("src/app/support/page.tsx", "utf8");
const resources = readFileSync("src/app/resources/page.tsx", "utf8");
const terms = readFileSync("src/app/terms/page.tsx", "utf8");
const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
const communicationsKit = readFileSync("src/lib/communications-kit.ts", "utf8");
const installManager = readFileSync("src/components/pwa-install-manager.tsx", "utf8");
const appLauncher = readFileSync("src/app/app/page.tsx", "utf8");
const parentWorkspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

test("parent trust surfaces exclude prototype, shared-password, and internal-review language", () => {
  const surfaces = [login, forgotPassword, resetPassword, parentSetup, webPush, support, terms, privacy].join("\n");

  assert.doesNotMatch(
    surfaces,
    /Live pilot|pilot safeguards|AI-generated|AI-assisted|human-reviewed|role-gated|PARENT_GUARDIAN|BusyBees|default password|school-issued first-login password|coming soon/i,
  );
  assert.doesNotMatch(terms, /tenant scoping|rate limits|AI and Automation|authorized humans/i);
  assert.doesNotMatch(privacy, /tenant access rules|communication providers|related school workflows/i);
});

test("parents see a limited-downtime message during a school payment account transition", () => {
  assert.match(parentWorkspace, /Card and bank payments should remain available/);
  assert.match(parentWorkspace, /retry in a few minutes/);
  assert.match(parentWorkspace, /balance, payment history, and saved payment details remain protected/);
});

test("parent sign-in, recovery, and setup forms expose real labels and recovery states", () => {
  assert.match(login, /type=\{portal === "parents" \? "email" : "text"\}/);
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.match(login, /spellCheck=\{false\}/);
  assert.match(login, /aria-busy=\{isPending\}/);
  assert.match(forgotPassword, /name="email"/);
  assert.match(forgotPassword, /role="status"/);
  assert.match(resetPassword, /name="currentPassword"/);
  assert.match(resetPassword, /name="newPassword"/);
  assert.match(resetPassword, /name="confirmPassword"/);
  assert.match(resetPassword, /Request a new reset link/);
  assert.doesNotMatch(resetPassword, /nativeButton=\{false\}[\s\S]{0,80}freshResetHref/);
  assert.match(parentSetup, /name="fullName"/);
  assert.match(parentSetup, /name="phone"/);
  assert.match(parentSetup, /name="relation"/);
  assert.match(parentSetup, /name="preferredCommunication"/);
  assert.match(parentSetup, /name="checkInPin"/);
  assert.match(parentSetup, /aria-pressed=\{guardian\.id === selectedGuardian\.id\}/);
});

test("linked family help stays family-specific and points to current Parent Portal locations", () => {
  assert.match(support, /const familyFaqs = processFaqs\.filter/);
  assert.match(support, /\{familyFaqs\.map/);
  assert.doesNotMatch(support, /\{processFaqs\.map/);
  assert.doesNotMatch(support, /App Store access|SOPs and guides|Profile Settings|FTE/i);
  assert.match(support, /Family → Profile &amp; Security/);
  assert.match(support, /flex w-full flex-wrap items-center gap-2/);
  assert.match(resources, /Add the Parent Portal to Your Device/);
  assert.match(resources, /password from your school invitation/);
  assert.doesNotMatch(resources, /school-issued first-login password/);
  assert.doesNotMatch(communicationsKit, /THE BEE SUITE • HUMAN-REVIEWED WORKFLOW|Profile Settings/);
  assert.match(communicationsKit, /THE BEE SUITE • STEP-BY-STEP GUIDE/);
  assert.match(communicationsKit, /Family → Profile & Security/);
  assert.match(communicationsKit, /Family → Documents/);
});

test("device-alert states render controls only when tapping performs an action", () => {
  assert.match(webPush, /\{actionable \? \(/);
  assert.match(webPush, /role="status"/);
  assert.match(webPush, /Add to Home Screen First/);
  assert.match(webPush, /Allow Alerts in Device Settings/);
  assert.doesNotMatch(webPush, /disabled=\{working \|\| !actionable\}/);
});

test("shared install and sign-in choices use literal copy without internal jargon", () => {
  const adjacentSurfaces = [installManager, appLauncher].join("\n");

  assert.doesNotMatch(adjacentSurfaces, /role-based launcher|workflows?|workspace|platform controls|local app|admin workflows|coming soon|App Store/i);
  assert.match(installManager, /Add \$\{context\.appName\} to this device/);
  assert.match(installManager, /In Safari, tap Share, then choose Add to Home Screen/);
  assert.match(appLauncher, /Where do you want to go\?/);
  assert.match(appLauncher, /Each one opens a separate page/);
  assert.match(appLauncher, /For school-managed lobby tablets only/);
  assert.doesNotMatch(appLauncher, /InfoTip/);
  assert.doesNotMatch(appLauncher, /nativeButton=\{false\}/);
  assert.match(installManager, /min-h-11/);

  for (const href of ["/parents", "/teachers", "/directors", "/executives", "/check-in"]) {
    assert.match(appLauncher, new RegExp(`href: ["']${href}["']`));
  }
});

test("every parent action used by the audited surfaces has an application route", () => {
  const routeFiles = [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/forgot-password/route.ts",
    "src/app/api/auth/reset-password/route.ts",
    "src/app/api/auth/force-password-reset/route.ts",
    "src/app/api/parent/setup/route.ts",
    "src/app/api/notifications/push-subscription/route.ts",
    "src/app/api/parent/tuition-cadence/route.ts",
    "src/app/api/communications/messages/route.ts",
    "src/app/api/parent/contact-requests/route.ts",
    "src/app/api/parent/incidents/[id]/acknowledge/route.ts",
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/parent/products/purchase/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
    "src/app/api/parent/preferences/route.ts",
    "src/app/api/profile/password/route.ts",
    "src/app/api/privacy/deletion-requests/route.ts",
    "src/app/api/parent/documents/[id]/submit/route.ts",
  ];

  for (const routeFile of routeFiles) {
    assert.equal(existsSync(routeFile), true, routeFile);
  }
});
