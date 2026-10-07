import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const showcaseSource = readFileSync(path.join(root, "src/components/landing-hero-showcase.tsx"), "utf8");
const themeToggleSource = readFileSync(path.join(root, "src/components/public-theme-toggle.tsx"), "utf8");

test("landing page leads with the product and keeps sign-in primary", () => {
  for (const expected of [
    "The school day, connected.",
    "One secure suite for enrollment, classrooms, family communication, billing, and multi-location oversight.",
    "Sign In to The BEE Suite",
    "See the product",
    "Built for directors, teachers, families, and multi-school teams.",
  ]) {
    assert.ok(pageSource.includes(expected), `missing product-first copy: ${expected}`);
  }

  assert.ok(pageSource.includes('href="/login"'), "missing generic sign-in link");
  assert.ok(pageSource.includes('href="#product"'), "missing product shortcut");
  assert.ok(
    pageSource.indexOf('href="/login"') < pageSource.indexOf('id="product"'),
    "the sign-in action should render before the product detail",
  );
});

test("landing page presents real product screens in device mockups", () => {
  for (const expected of [
    "LandingHeroShowcase",
    "LandingRoleShowcase",
    'data-device="laptop"',
    'data-device="tablet"',
    'data-device="phone"',
    "/brand/the-bee-suite/screenshots/current/director-desktop-dashboard-light.png",
    "/brand/the-bee-suite/screenshots/current/teacher-ipad-daily-report-light.png",
    "/brand/the-bee-suite/screenshots/current/parent-iphone-overview-light.png",
    "/brand/the-bee-suite/screenshots/current/executive-desktop-dashboard-light.png",
  ]) {
    assert.ok(pageSource.includes(expected) || showcaseSource.includes(expected), `missing product showcase detail: ${expected}`);
  }

  assert.ok(showcaseSource.includes('loading={preload ? "eager" : undefined}'), "hero LCP image should load eagerly");
  assert.ok(showcaseSource.includes('fetchPriority={preload ? "high" : undefined}'), "hero LCP image should receive high fetch priority");
  assert.ok(showcaseSource.includes("sizes="), "device images should provide responsive sizes");
  assert.ok(showcaseSource.includes("data-hero-product-stage"), "hero should expose its composed product stage");
  assert.ok(showcaseSource.includes("connected-schools.webp"), "hero should use the recent branding graphic");
  assert.ok(showcaseSource.includes('width={2048}') && showcaseSource.includes('height={682}'), "hero branding retains its intrinsic ratio");
  assert.ok(showcaseSource.includes("(max-width: 1023px) 92vw"), "branding should request responsive mobile sizes");
});

test("landing page uses the recent branding imagery alongside product proof", () => {
  for (const expected of [
    "/brand/the-bee-suite/landing/connected-schools.webp",
    "/brand/the-bee-suite/landing/connected-growth.webp",
    "Built for the way schools actually work.",
    "Welcome families with a smoother front desk.",
    "Keep classroom updates close at hand.",
    "Give leaders one clear operating picture.",
  ]) {
    assert.ok(pageSource.includes(expected) || showcaseSource.includes(expected), `missing school-use proof: ${expected}`);
  }

  assert.ok(pageSource.includes('id="in-schools"'));
  assert.ok(!pageSource.includes("bg-gradient-to-t"), "school photography should not receive a color overlay");
});

test("landing page preserves every role workspace entry", () => {
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

  assert.ok(pageSource.includes('id="workspaces"'));
  assert.ok(pageSource.includes("Your workspace is ready."));
});

test("landing page preserves setup, support, and device paths", () => {
  const paths = [
    ["Use an invitation", "/login"],
    ["Set up parent access", "/parents/setup"],
    ["Register a child", "/registration"],
    ["Set up a school", "/onboarding"],
    ["Help &amp; Guides", "/resources"],
    ["Support", "/support"],
    ["Use on your device", "/app"],
  ];

  for (const [label, href] of paths) {
    assert.ok(pageSource.includes(label), `missing setup or support label: ${label}`);
    assert.ok(pageSource.includes(`href: "${href}"`) || pageSource.includes(`href="${href}"`), `missing route: ${href}`);
  }

  assert.ok(pageSource.includes('id="get-started"'));
});

test("landing page remains accessible, responsive, and motion-conscious", () => {
  for (const expected of [
    'href="#main-content"',
    'id="main-content"',
    'aria-label="Primary navigation"',
    'aria-hidden="true"',
    "min-h-11",
    "min-h-12",
    "touch-manipulation",
    "sm:grid-cols-2",
    "lg:grid-cols-2",
    "motion-safe:",
  ]) {
    assert.ok(pageSource.includes(expected) || showcaseSource.includes(expected), `missing UX safeguard: ${expected}`);
  }

  for (const expected of [
    'role="tablist"',
    'role="tab"',
    'role="tabpanel"',
    "aria-selected",
    "aria-controls",
    "aria-labelledby",
  ]) {
    assert.ok(showcaseSource.includes(expected), `missing accessible product tab behavior: ${expected}`);
  }

  assert.ok(!pageSource.includes("animate-pulse"), "ambient motion must not run continuously");
  assert.ok(!showcaseSource.includes("setInterval"), "product screens must not auto-advance");
});

test("landing page follows the baby blue, ink, white, and honey visual system in both themes", () => {
  for (const expected of [
    "bg-[#071018]",
    "bg-white",
    "bg-[#edf7ff]",
    "bg-[#edf7ff] text-slate-950 dark:bg-[#07131d] dark:text-white",
    "linear-gradient(118deg,#edf7ff_0%,#edf7ff_51%,#d7edff_100%)",
    "dark:bg-[linear-gradient(118deg,#07131d_0%,#07131d_58%,#0b1c28_100%)]",
    "bg-[#f6bd2c]",
    "dark:bg-[#071018]",
    "dark:bg-[#0a151f]",
    "dark:bg-[#0d1b26]",
    "/brand/the-bee-suite/logo-primary-horizontal-white.png",
    "PublicThemeToggle",
    "tracking-[-0.06em]",
    "[clip-path:polygon(0_35%,50%_100%,100%_35%,100%_100%,0_100%)]",
  ]) {
    assert.ok(pageSource.includes(expected), `missing landing visual treatment: ${expected}`);
  }

  for (const expected of [
    'aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}',
    "aria-pressed={isDark}",
    "useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot)",
    "new MutationObserver(onStoreChange)",
    'document.documentElement.classList.toggle("dark", nextDark)',
    'localStorage.setItem(themeStorageKey, nextDark ? "dark" : "light")',
    "touch-manipulation",
    "focus-visible:ring-2",
  ]) {
    assert.ok(themeToggleSource.includes(expected), `missing theme toggle safeguard: ${expected}`);
  }
});

test("landing page avoids the previous access-directory and long-funnel treatments", () => {
  for (const removed of [
    "HoneycombAccessRail",
    "Choose Your Workspace",
    "Current product proof",
    "A CRM built around childcare enrollment",
    "Ready to connect the whole school day?",
    'id="billing"',
    'id="product-maps"',
    "hive-texture",
    "transition-all",
  ]) {
    assert.ok(!pageSource.includes(removed), `outdated landing treatment remains: ${removed}`);
  }
});
