import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const currentGuides = [
  "docs/BEE_SUITE_COMPLETE_GUIDE.md",
  "docs/BEE_SUITE_SCHOOL_DATA_IMPORT_AND_PARENT_LAUNCH_EMAILS.md",
  "docs/BEE_SUITE_SCHOOL_TRANSITION_ANNOUNCEMENT_EMAIL.md",
  "docs/SUPPORT_ESCALATION_GUIDE.md",
  "docs/sops/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md",
  "docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md",
  "docs/sops/EXECUTIVE_ADMIN_SOP.md",
  "docs/sops/DIRECTOR_SOP.md",
  "docs/sops/BILLING_ADMIN_SOP.md",
  "docs/sops/TEACHER_SOP.md",
  "docs/sops/PARENT_PORTAL_SOP.md",
  "docs/sops/PARENT_PORTAL_INSTALL_GUIDE.md",
  "docs/sops/PARENT_ACH_PAYMENT_GUIDE.md",
  "docs/sops/KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md",
];

test("current guides are dated July 29 or later and exclude superseded workflow copy", () => {
  for (const path of currentGuides) {
    const content = readFileSync(path, "utf8");
    assert.match(content, /(?:July (?:29|30|31)|August (?:1|2)), 2026/, path);
    assert.doesNotMatch(content, /creates? (?:a |the )?Friday invoice/i, path);
    assert.doesNotMatch(content, /bank payment is the preferred payment method/i, path);
    assert.doesNotMatch(content, /create your password.*setup link/i, path);
  }
});

test("school transition announcement preserves per-school launch and billing gates", () => {
  const email = readFileSync("docs/BEE_SUITE_SCHOOL_TRANSITION_ANNOUNCEMENT_EMAIL.md", "utf8");
  const sop = readFileSync("docs/sops/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md", "utf8");
  const readyToSendEmail = email.split("## Ready-To-Send Email")[1]?.split("## Sender Check Before Sending")[0] || "";

  assert.match(email, /standalone owner\/director announcement sent manually/);
  assert.match(readyToSendEmail, /Your families' and children's information has been imported/);
  assert.match(readyToSendEmail, /Parent Portal invitations have been emailed/);
  assert.match(readyToSendEmail, /Owners were emailed a secure Stripe onboarding link last week/);
  assert.match(email, /do not invoice, collect, or process the same tuition cycle in both systems/i);
  assert.match(email, /ProCare should remain the billing source of record until that written cutover is approved/);
  assert.doesNotMatch(readyToSendEmail, /import-complete confirmation|parent-invitation completion confirmation|dashboard-linked/i);
  assert.doesNotMatch(email, /The BEE Suite is complete, active/i);

  assert.match(sop, /Owner Payout Setup/);
  assert.match(sop, /Parent Portal Readiness/);
  assert.match(sop, /Billing And Payment Cutover/);
  assert.match(sop, /GO Or NO-GO Record/);
  assert.match(sop, /HELD OFF` is not `PASS/);
  assert.doesNotMatch(sop, /BusyBees/i);
});

test("public resources describe current parent, tuition, FTE, and launch flows", () => {
  const resources = readFileSync("src/app/resources/page.tsx", "utf8");

  assert.match(resources, /school-issued first-login password/);
  assert.match(resources, /presents card first/);
  assert.match(resources, /Thursday schedule/);
  assert.match(resources, /Friday at 12 PM Eastern/);
  assert.match(resources, /HELD OFF gate is not a PASS/);
  assert.match(resources, /ProCare as the source of record/);
  assert.match(resources, /object-contain/);
  assert.match(resources, /Tap a screen to open the full view/);
  assert.doesNotMatch(resources, /Section link/);
  assert.doesNotMatch(resources, /Captured July 27, 2026/);
  assert.doesNotMatch(resources, /warning banners and developer controls excluded/);
});

test("all canonical instruction graphics referenced by public resources exist", () => {
  const resources = readFileSync("src/app/resources/page.tsx", "utf8");
  const paths = [...resources.matchAll(/graphicSrc: "([^"]+)"/g)].map(
    ([, path]) => `public${path}`,
  );

  assert.ok(paths.length >= 9);
  for (const path of new Set(paths)) {
    assert.match(path, /(?:explainers|sop-graphics)\/current\/[^/]+\.png$/);
    assert.equal(existsSync(path), true, path);
  }
});

test("role screenshot coverage matches the approved device mix", () => {
  const resources = readFileSync("src/app/resources/page.tsx", "utf8");
  const screenshotPaths = [...resources.matchAll(/src: "(\/brand\/the-bee-suite\/screenshots\/[^"]+)"/g)].map(
    ([, path]) => `public${path}`,
  );

  assert.ok(screenshotPaths.filter((path) => path.includes("parent-iphone-")).length >= 5);
  assert.ok(screenshotPaths.some((path) => path.includes("parent-ipad-")));
  assert.ok(screenshotPaths.some((path) => path.includes("parent-desktop-")));
  assert.ok(screenshotPaths.filter((path) => path.includes("teacher-ipad-")).length >= 2);
  assert.ok(screenshotPaths.some((path) => path.includes("teacher-desktop-")));
  assert.ok(screenshotPaths.filter((path) => path.includes("director-desktop-")).length >= 2);
  assert.ok(screenshotPaths.filter((path) => path.includes("executive-desktop-")).length >= 2);
  assert.equal(screenshotPaths.some((path) => path.includes("director-ipad-") || path.includes("director-iphone-")), false);
  assert.equal(screenshotPaths.some((path) => path.includes("executive-ipad-") || path.includes("executive-iphone-")), false);
  assert.equal(screenshotPaths.some((path) => path.includes("2026-07-07")), false);

  for (const path of screenshotPaths) {
    assert.match(path, /screenshots\/current\/.+-light\.png$/);
    assert.equal(existsSync(path), true, path);
  }
});

test("screenshot-derived role SOP graphics are current and complete", () => {
  const expected = [
    "teacher-classroom-device-guide",
    "director-desktop-operations-guide",
    "executive-desktop-oversight-guide",
    "parent-multidevice-portal-guide",
    "role-device-standards-guide",
  ];

  for (const name of expected) {
    assert.equal(
      existsSync(`public/brand/the-bee-suite/sop-graphics/current/${name}.png`),
      true,
      name,
    );
    assert.equal(
      existsSync(`public/brand/the-bee-suite/sop-graphics/current/${name}.svg`),
      true,
      name,
    );
  }
});

test("public guide sources do not point at versioned visual directories or publish shared passwords", () => {
  const publicGuideSources = [
    ...currentGuides,
    "docs/sops/README.md",
    "src/app/resources/page.tsx",
    "src/app/page.tsx",
    "src/lib/communications-kit.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(publicGuideSources, /screenshots\/2026-/);
  assert.doesNotMatch(publicGuideSources, /sop-graphics\/2026-/);
  assert.doesNotMatch(publicGuideSources, /explainers\/[^"')\s]*2026-/);
  assert.doesNotMatch(publicGuideSources, /BusyBees/i);
});
