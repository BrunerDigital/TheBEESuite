import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const preview = readFileSync("src/app/device-preview/page.tsx", "utf8");
const parentSetup = readFileSync("src/components/parent-portal-setup-form.tsx", "utf8");
const parentLogin = readFileSync("src/components/login-form.tsx", "utf8");

test("parent portal renders one focused destination at a time", () => {
  for (const view of ["home", "updates", "messages", "payments"] as const) {
    assert.match(workspace, new RegExp(`activeView === ["']${view}["']`));
  }
  assert.match(workspace, /activeView === "family" && activeFamilySection === "children"/);
  assert.match(workspace, /activeView === "family" && activeFamilySection === "check-in"/);
  assert.match(workspace, /activeView === "family" && activeFamilySection === "documents"/);
  assert.match(workspace, /activeView === "family" && activeFamilySection === "profile"/);
  assert.match(workspace, /activeView === "family" && activeFamilySection === "notifications"/);
});

test("Today is a summary and Updates is one date-based history", () => {
  assert.match(workspace, /See today’s check-in status, classroom, schedule, and latest\s+update from your school/);
  assert.match(workspace, /Choose a date to review that day’s report, activities, and photos/);
  assert.match(workspace, /aria-label="Updates for the selected date"/);
  assert.match(workspace, /Daily report · \{report\.child\.fullName\}/);
  assert.doesNotMatch(workspace, /Photos and Moments|Daily Activities/);
});

test("parent-facing copy does not expose pilot, provider, or kiosk implementation jargon", () => {
  const parentFacingSource = [workspace, parentSetup, parentLogin].join("\n");
  assert.doesNotMatch(parentFacingSource, /Live pilot|human-reviewed|AI suggestions|vibe|Outstanding payout requirement fields/i);
  assert.doesNotMatch(parentFacingSource, /Tablet camera|Find Family|staff clock|BusyBees/i);
  assert.doesNotMatch(workspace, /Schools absorb Stripe|Agency split under review|Account ledger|School scoped/i);
  assert.match(workspace, /No processing fee is added to your payment/);
});

test("parent shell uses real destinations and a quiet parent-specific visual frame", () => {
  assert.match(shell, /Family portal navigation/);
  assert.match(shell, /Profile &amp; security/);
  assert.match(shell, /Notifications/);
  assert.match(globals, /data-role="PARENT_GUARDIAN"/);
  assert.match(globals, /\.dashboard-workspace[\s\S]*background-image: none/);
  assert.match(globals, /:is\(\[data-slot="card"\], \.glass-panel\)/);
});

test("development preview exercises the real workspace without allowing mutations", () => {
  assert.match(preview, /<ParentPortalWorkspace/);
  assert.match(preview, /previewMode/);
  assert.match(preview, /normalizeParentPortalView\(screen\)/);
  assert.match(workspace, /function previewOnly\(\)/);
  assert.ok((workspace.match(/if \(previewOnly\(\)\) return;/g) ?? []).length >= 10);
  assert.doesNotMatch(preview, /prisma\.|auth\.admin|method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
});
