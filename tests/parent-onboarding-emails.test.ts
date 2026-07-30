import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildParentPortalGuideHtml,
  buildParentPortalGuideText,
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
} from "../src/lib/parent-portal-invitations";

const branding = {
  name: "Kid City USA",
  tagline: "Where Kids Can BEE Kids",
  logoSrc: "/brand/kid-city-usa/logo-horizontal.png",
  logoAlt: "Kid City USA logo",
};

test("parent welcome email includes login, home-screen, and secure payment setup", () => {
  const input = {
    guardianName: "Taylor Parent",
    centerLabel: "Kid City USA - Beach Blvd",
    email: "taylor@example.com",
    loginUrl: "https://thebeesuite.io/parents/setup",
  };
  const text = buildParentPortalInvitationText(input);
  const html = buildParentPortalInvitationHtml({ ...input, branding });

  for (const copy of [text, html]) {
    assert.match(copy, /Welcome to The BEE Suite/i);
    assert.match(copy, /BusyBees/);
    assert.match(copy, /Add to Home Screen/i);
    assert.match(copy, /Android/i);
    assert.match(copy, /Set Up Card Autopay/i);
    assert.match(copy, /Set Up Instant Bank/i);
    assert.match(copy, /secure Stripe/i);
    assert.doesNotMatch(copy, /vercel\.app/i);
  }
});

test("parent feature guide provides an FAQ and operating SOP without resetting credentials", () => {
  const input = {
    guardianName: "Taylor Parent",
    centerLabel: "Kid City USA - Beach Blvd",
    loginUrl: "https://thebeesuite.io/parents",
    portalUrl: "https://thebeesuite.io/parent-portal",
  };
  const text = buildParentPortalGuideText(input);
  const html = buildParentPortalGuideHtml({ ...input, branding });

  for (const copy of [text, html]) {
    assert.match(copy, /daily reports/i);
    assert.match(copy, /photos/i);
    assert.match(copy, /messages/i);
    assert.match(copy, /kiosk PIN/i);
    assert.match(copy, /Forgot (your )?password/i);
    assert.match(copy, /missing a child/i);
    assert.match(copy, /Do not add a duplicate/i);
    assert.match(copy, /payment/i);
    assert.match(copy, /never (send|include).*password/i);
  }
});

test("director guide action requires a linked parent and keeps delivery school-scoped and audited", () => {
  const route = readFileSync("src/app/api/parent/invitations/route.ts", "utf8");
  const component = readFileSync("src/components/parent-portal-invite-button.tsx", "utf8");
  const corporateTestRunner = readFileSync("scripts/send-kidcity-corporate-parent-invite-tests.ts", "utf8");

  assert.match(route, /messageType === "guide"/);
  assert.match(route, /!guardian\.userId \|\| existingUser\?\.id !== guardian\.userId/);
  assert.match(route, /purpose: "parent_guide_email"/);
  assert.match(route, /action: "parent_portal\.guide_sent"/);
  assert.match(route, /disableClickTracking: true/);
  assert.match(route, /canAccessCenter\(user, center\.id\)/);
  assert.match(route, /resetToInitialPassword: false/);
  assert.doesNotMatch(route, /resetToInitialPassword: true/);

  assert.match(component, /Send Parent Feature Guide & FAQ/);
  assert.match(component, /disabled=\{isPending \|\| !email \|\| !linked\}/);
  assert.match(component, /submit\("guide"\)/);

  assert.match(corporateTestRunner, /buildParentPortalGuideHtml/);
  assert.match(corporateTestRunner, /purpose: "parent_guide_email"/);
  assert.match(corporateTestRunner, /to: \[args\.recipient\]/);
  assert.match(corporateTestRunner, /results\.length \* 2/);
});
