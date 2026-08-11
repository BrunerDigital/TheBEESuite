import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KioskCheckIn } from "../src/components/kiosk-check-in";

const familyRouteSource = readFileSync("src/app/check-in/[centerId]/family/page.tsx", "utf8");
const sharedRouteSource = readFileSync("src/app/check-in/[centerId]/page.tsx", "utf8");
const credentialCardSource = readFileSync("src/components/guardian-kiosk-credential-card.tsx", "utf8");
const credentialPanelSource = readFileSync("src/components/parent-kiosk-credential-panel.tsx", "utf8");
const kioskSource = readFileSync("src/components/kiosk-check-in.tsx", "utf8");

const center = {
  id: "center_1",
  name: "Test School",
  place: "Test City, IN",
  timeZone: "America/Indiana/Indianapolis",
};

test("family check-in route is fail-closed even when staff is requested", () => {
  const markup = renderToStaticMarkup(createElement(KioskCheckIn, {
    center,
    initialMode: "staff",
    familyOnly: true,
  }));

  assert.match(markup, /School Check-In/);
  assert.match(markup, /Enter your 4-digit Family PIN/);
  assert.match(markup, />Verify Family PIN</);
  assert.doesNotMatch(markup, /Start Over|Clears in/);
  assert.doesNotMatch(markup, />Staff</);
  assert.doesNotMatch(markup, /Staff time clock|Continue to Staff Clock|Work email|Clock In|Clock Out/);
});

test("shared lobby still renders its staff clock entry mode", () => {
  const markup = renderToStaticMarkup(createElement(KioskCheckIn, {
    center,
    initialMode: "staff",
  }));

  assert.match(markup, />Family check-in</);
  assert.match(markup, />Staff time clock</);
  assert.match(markup, /Staff time clock/);
  assert.match(markup, /Work email \(optional\)/);
  assert.match(markup, /Continue to Staff Clock/);
});

test("family route opts into family-only presentation while the shared lobby keeps mode selection", () => {
  assert.match(familyRouteSource, /initialMode="family" familyOnly/);
  assert.doesNotMatch(familyRouteSource, /searchParams|mode=staff/);
  assert.match(sharedRouteSource, /requestedMode === "staff" \? "staff" : "family"/);
  assert.doesNotMatch(sharedRouteSource, /familyOnly/);
  assert.match(kioskSource, /const activeKioskMode: KioskMode = familyOnly \? "family" : kioskMode/);
  assert.match(kioskSource, /if \(familyOnly && mode !== "family"\) return/);
  assert.equal(kioskSource.match(/if \(familyOnly\) return/g)?.length, 2);
});

test("parent check-in card hides raw credentials and uses plain-language actions", () => {
  assert.doesNotMatch(credentialCardSource, /Copy QR|navigator\.clipboard|QR scan payload|Kiosk:\s*\{/);
  assert.match(credentialCardSource, /Print Check-In Card/);
  assert.match(credentialCardSource, /Open Family Check-In/);
  assert.match(credentialCardSource, /<Link href=\{credential\.kioskPath\} prefetch=\{false\}/);
  assert.doesNotMatch(credentialCardSource, /window\.location\.assign/);
  assert.match(credentialPanelSource, /if \(previewMode\) return/);
  assert.match(credentialPanelSource, /disabled=\{previewMode \|\| isPending/);
  assert.match(kioskSource, /familyOnly \? "Scan your Family QR code" : "Scan a Family QR code"/);
  assert.match(kioskSource, /pendingAction === "family_lookup" \? "Verifying…" : "Verify Family PIN"/);
});
