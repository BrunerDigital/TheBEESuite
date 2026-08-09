import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");

test("landing page makes sign-in the primary action", () => {
  for (const expected of [
    "Welcome to The BEE Suite",
    "Sign In to The BEE Suite",
    "Choose Your Workspace",
    "Already signed in?",
  ]) {
    assert.ok(pageSource.includes(expected), `missing entry-first copy: ${expected}`);
  }

  assert.ok(pageSource.includes('href="/login"'), "missing generic sign-in link");
  assert.ok(pageSource.includes('href="#get-started"'), "missing new-user shortcut");
  assert.ok(
    pageSource.indexOf('<Link href="/login"') < pageSource.indexOf('<section id="get-started"'),
    "the sign-in action should render before the new-user setup section",
  );
});

test("landing page provides direct role workspace entry", () => {
  const rolePortals = [
    ["Director Workspace", "/directors"],
    ["Executive Workspace", "/executives"],
    ["Teacher Workspace", "/teachers"],
    ["Parent & Guardian Portal", "/parents"],
  ];

  for (const [label, href] of rolePortals) {
    assert.ok(pageSource.includes(label), `missing role portal label: ${label}`);
    assert.ok(pageSource.includes(`href: "${href}"`), `missing role portal link: ${href}`);
  }
});

test("landing page separates new-user setup paths from portal login", () => {
  const setupPaths = [
    ["I Received an Invitation", "/login"],
    ["I’m Setting Up Parent Access", "/parents/setup"],
    ["I’m Registering a Child", "/registration"],
    ["I’m Setting Up a School", "/onboarding"],
  ];

  for (const [label, href] of setupPaths) {
    assert.ok(pageSource.includes(label), `missing setup choice: ${label}`);
    assert.ok(pageSource.includes(`href: "${href}"`), `missing setup route: ${href}`);
  }
});

test("landing page keeps support and device guidance visible", () => {
  for (const href of ["/resources", "/support", "/app"]) {
    assert.ok(pageSource.includes(`href: "${href}"`) || pageSource.includes(`href="${href}"`), `missing help link: ${href}`);
  }

  for (const expected of ["Help & Guides", "Need Help Getting In?", "Use The BEE Suite on Your Device"]) {
    assert.ok(pageSource.includes(expected), `missing support content: ${expected}`);
  }
});

test("landing page is accessible, responsive, and no longer a long sales funnel", () => {
  for (const expected of [
    'href="#main-content"',
    '<main id="main-content">',
    'aria-label="Primary navigation"',
    'aria-hidden="true"',
    "sm:grid-cols-2",
    "md:grid-cols-2",
    "xl:grid-cols-4",
    "min-h-11",
  ]) {
    assert.ok(pageSource.includes(expected), `missing UX safeguard: ${expected}`);
  }

  for (const removed of [
    "LandingHeroShowcase",
    "Current product proof",
    "Request a workspace",
    "A CRM built around childcare enrollment",
    "Ready to connect the whole school day?",
    'id="billing"',
    'id="product-maps"',
    "transition-all",
  ]) {
    assert.ok(!pageSource.includes(removed), `sales-funnel content remains: ${removed}`);
  }
});
