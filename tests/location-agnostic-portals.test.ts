import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const locationNames = /\b(?:Kokomo|Granbury|Garland|Canton|Centennial|Sarasota|Oakleaf|Beach Blvd|Cordera|Longmont)\b/i;

// These files hold reviewed source evidence, migration aliases, rollout contacts,
// or examples. They are data/configuration boundaries, not location-specific UI
// implementations or feature switches.
const reviewedLocationDataFiles = new Set([
  "src/components/executive-admin-console.tsx",
  "src/components/fte-bulk-import-panel.tsx",
  "src/lib/active-school-locations.ts",
  "src/lib/billing-balance-audit.ts",
  "src/lib/corporate-stripe-verification.ts",
  "src/lib/kidcity-corporate-rollout.ts",
  "src/lib/kidcity-legacy-center-aliases.ts",
  "src/lib/parent-billing-visibility.ts",
  "src/lib/stripe-billing-approval.ts",
]);

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? filesBelow(file) : [file];
  });
}

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

test("school operations, teacher, and parent portals use shared runtime entrypoints", () => {
  const page = source("src/app/[slug]/page.tsx");

  assert.match(page, /if \(slug === "parent-portal"\)/);
  assert.match(page, /if \(slug === "teacher-portal"\)/);
  assert.match(page, /slug === "classroom-dashboard"/);
  assert.doesNotMatch(page, locationNames);
});

test("location names cannot become runtime feature switches outside reviewed data boundaries", () => {
  const unexpected = filesBelow("src")
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !reviewedLocationDataFiles.has(file))
    .filter((file) => locationNames.test(source(file)));

  assert.deepEqual(unexpected, [], `Move location-specific behavior into shared, school-scoped logic: ${unexpected.join(", ")}`);
});

test("portal UI components remain free of named-location behavior", () => {
  const portalComponents = [
    "src/components/parent-portal-workspace.tsx",
    "src/components/teacher-mobile-workspace.tsx",
    "src/components/dashboard.tsx",
    "src/components/live-ops-pages.tsx",
  ];

  for (const file of portalComponents) {
    assert.doesNotMatch(source(file), locationNames, `${file} must behave the same for every authorized school`);
  }
});
