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

test("approved ProCare parent welcome email explains the transition and guarded billing setup", () => {
  const input = {
    guardianName: "Taylor Parent",
    centerLabel: "Kid City USA - Beach Blvd",
    email: "taylor@example.com",
    loginUrl: "https://thebeesuite.io/parents/setup",
    transitioningFromProcare: true,
    billingCutoverApproved: true,
  };
  const text = buildParentPortalInvitationText(input);
  const html = buildParentPortalInvitationHtml({ ...input, branding });

  for (const copy of [text, html]) {
    assert.match(copy, /Welcome to The BEE Suite/i);
    assert.match(copy, /Kid City USA - Beach Blvd is transitioning from ProCare to The BEE Suite/i);
    assert.match(copy, /ProCare will remain available alongside The BEE Suite/i);
    assert.match(copy, /teachers and families/i);
    assert.match(copy, /has approved its billing cutover to The BEE Suite/i);
    assert.match(copy, /open Payments/i);
    assert.match(copy, /Do not pay the same tuition charge in both/i);
    assert.match(copy, /invoice (appearing in the portal )?is not an automatic charge/i);
    assert.match(copy, /autopay applies only after you authorize it/i);
    assert.match(copy, /BusyBees/);
    assert.match(copy, /Add to Home Screen/i);
    assert.match(copy, /Android/i);
    assert.match(copy, /card or bank option/i);
    assert.match(copy, /secure payment form/i);
    assert.match(copy, /Do not create another family or child record/i);
    assert.doesNotMatch(copy, /vercel\.app/i);
  }
});

test("unapproved ProCare parent welcome email keeps the existing tuition source of truth", () => {
  const input = {
    guardianName: "Taylor Parent",
    centerLabel: "Kid City USA - Beach Blvd",
    email: "taylor@example.com",
    loginUrl: "https://thebeesuite.io/parents/setup",
    transitioningFromProcare: true,
  };
  const text = buildParentPortalInvitationText(input);
  const html = buildParentPortalInvitationHtml({ ...input, branding });

  for (const copy of [text, html]) {
    assert.match(copy, /continue following your school's current tuition instructions/i);
    assert.match(copy, /does not move the next tuition cycle to The BEE Suite/i);
    assert.match(copy, /after its billing cutover is approved/i);
    assert.doesNotMatch(copy, /Tuition for next week will be billed through The BEE Suite/i);
    assert.doesNotMatch(copy, /has approved its billing cutover to The BEE Suite/i);
  }
});

test("standard parent welcome email does not announce a ProCare billing transition", () => {
  const input = {
    guardianName: "Taylor Parent",
    centerLabel: "Kid City USA - Beach Blvd",
    email: "taylor@example.com",
    loginUrl: "https://thebeesuite.io/parents/setup",
  };
  const text = buildParentPortalInvitationText(input);
  const html = buildParentPortalInvitationHtml({ ...input, branding });

  assert.match(html, /<meta charset="utf-8">/i);
  for (const copy of [text, html]) {
    assert.doesNotMatch(copy, /transitioning from ProCare/i);
    assert.doesNotMatch(copy, /Tuition for next week will be billed through The BEE Suite/i);
    assert.match(copy, /Save card/i);
    assert.match(copy, /Connect bank account/i);
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
    assert.doesNotMatch(copy, /BusyBees/i);
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
  assert.match(route, /resetToInitialPassword:\s*preparedWithoutInvite/);
  assert.match(route, /guardian\.family\.sourceSystem\?\.toLowerCase\(\) === "procare"/);
  assert.match(route, /guardian\.family\.children\.some/);
  assert.match(route, /stripeSchoolBillingApproval/);
  assert.match(route, /customFields: center\.customFields/);
  assert.match(route, /billingCutoverApproved,/);
  assert.match(route, /transitioningFromProcare,/);
  assert.match(route, /your BEE Suite Parent Portal is ready/);

  assert.match(component, /Send Parent Feature Guide & FAQ/);
  assert.match(component, /disabled=\{isPending \|\| !email \|\| !linked\}/);
  assert.match(component, /submit\("guide"\)/);

  assert.match(corporateTestRunner, /buildParentPortalGuideHtml/);
  assert.match(corporateTestRunner, /purpose: "parent_guide_email"/);
  assert.match(corporateTestRunner, /to: \[args\.recipient\]/);
  assert.match(corporateTestRunner, /results\.length \* 2/);
});
