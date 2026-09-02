import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { roleExperienceFor, roleExperiences } from "@/lib/role-experience";

const applicationRoles = [
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "TEACHER",
  "BILLING_ADMIN",
  "PARENT_GUARDIAN",
  "AUTHORIZED_PICKUP",
  "READ_ONLY_AUDITOR",
];

test("every application role has a distinct task-oriented landing model", () => {
  assert.deepEqual(Object.keys(roleExperiences).sort(), [...applicationRoles].sort());
  for (const role of applicationRoles) {
    const experience = roleExperienceFor(role);
    assert.equal(experience.role, role);
    assert.ok(experience.homeLabel.length > 3);
    assert.ok(experience.mainPriorities.length >= 2);
    assert.ok(experience.primaryActions.length >= 1 && experience.primaryActions.length <= 4);
    assert.ok(experience.attentionAreas.length >= 2);
    assert.ok(experience.primaryNavigation.length >= 1 && experience.primaryNavigation.length <= 5);
    assert.ok(experience.mobileNavigation.length >= 1 && experience.mobileNavigation.length <= 4);
  }
});

test("the shared shell uses primary navigation and progressively disclosed neighborhoods", () => {
  const source = readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
  assert.match(source, /Your street/);
  assert.match(source, /Explore more/);
  assert.match(source, /navigationNeighborhoodLabel/);
  assert.match(source, /<details[\s\S]*<summary/);
  assert.match(source, /<WorkspaceSelector/);
  assert.match(source, /Change workspace/);
});

test("workspace selection guards the shared authenticated entry points before data loads", () => {
  for (const file of [
    "src/app/dashboard/page.tsx",
    "src/app/[slug]/page.tsx",
    "src/app/crm-leads/page.tsx",
    "src/app/data-readiness/page.tsx",
    "src/app/check-in/page.tsx",
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /workspaceSelectionRedirect/);
  }
  const api = readFileSync(new URL("../src/app/api/workspace/selection/route.ts", import.meta.url), "utf8");
  assert.match(api, /user\.workspace\?\.options\.some/);
  assert.match(api, /createSessionToken/);
  assert.doesNotMatch(api, /prisma\./);
  const autopay = readFileSync(new URL("../src/app/api/billing/autopay/route.ts", import.meta.url), "utf8");
  assert.match(autopay, /chargeMode && user\.workspace\?\.mode === "all"/);
  assert.match(autopay, /Choose one location from the workspace menu/);
});
