import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const heroSource = readFileSync(
  path.join(root, "src/components/landing-hero-showcase.tsx"),
  "utf8",
);
const combinedSource = `${pageSource}\n${heroSource}`;

test("landing page presents the current role and device views", () => {
  for (const expected of [
    "2026-07-27-light/director-desktop-dashboard-light.png",
    "2026-07-27-light/teacher-ipad-daily-report-light.png",
    "2026-07-27-light/parent-iphone-overview-light.png",
    "2026-07-27-light/executive-desktop-dashboard-light.png",
    "Current light-mode product",
    "Director desktop",
    "Teacher iPad",
    "Parent iPhone",
    "Executive desktop",
  ]) {
    assert.match(combinedSource, new RegExp(expected.replaceAll(".", "\\.")));
  }
});

test("landing page describes the current operating and rollout flows", () => {
  for (const expected of [
    "Thursday invoice",
    "School-linked registration",
    "ProCare migration with review",
    "School-local daily operations",
    "Payment readiness by school",
    "School-scoped marketing accounts",
    "Independent launch gates",
    "selected FTE reporting period",
  ]) {
    assert.ok(
      combinedSource.toLowerCase().includes(expected.toLowerCase()),
      `missing current landing-page copy: ${expected}`,
    );
  }

  for (const href of ["/resources", "/registration", "/onboarding"]) {
    assert.ok(combinedSource.includes(`href="${href}"`), `missing link to ${href}`);
  }
});

test("landing page uses the current SOP and explainer graphics", () => {
  const assetPaths = [
    ...combinedSource.matchAll(/src(?:=|:)\s*"(\/brand\/[^"]+\.(?:png|webp))"/g),
  ].map((match) => match[1]);

  assert.ok(assetPaths.length >= 12, "expected a substantial set of current product graphics");
  assert.ok(assetPaths.some((asset) => asset.includes("2026-07-27-v3")));
  assert.ok(assetPaths.some((asset) => asset.includes("2026-07-27-light")));
  assert.ok(assetPaths.some((asset) => asset.includes("/sop-graphics/")));

  for (const asset of assetPaths) {
    assert.ok(
      existsSync(path.join(root, "public", asset.slice(1))),
      `landing-page asset does not exist: ${asset}`,
    );
  }
});

test("landing page excludes stale and unverified marketing content", () => {
  for (const staleCopy of [
    "May 16, 2025",
    "Welcome back, Maya",
    "real customer reviews",
    "Capacity planning before empty seats",
    "LandingSavingsCalculator",
    "Native app path",
    "testimonials",
  ]) {
    assert.ok(
      !combinedSource.toLowerCase().includes(staleCopy.toLowerCase()),
      `stale landing-page content remains: ${staleCopy}`,
    );
  }
});
