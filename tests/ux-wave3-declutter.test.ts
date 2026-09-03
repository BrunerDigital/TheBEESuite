import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reporting keeps the current summary visible while collapsing report options and definitions", async () => {
  const analytics = await readSource("src/components/analytics-report-builder.tsx");
  const page = await readSource("src/components/live-ops-pages.tsx");

  assert.match(analytics, /id="analytics-report-controls"[\s\S]*?defaultCollapsed/);
  assert.match(analytics, /id="analytics-report-definition"[\s\S]*?defaultCollapsed/);
  assert.match(analytics, /id="analytics-current-summary-title"/);
  assert.match(analytics, /href="#analytics-report-controls"/);
  assert.match(analytics, /grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6/);
  assert.match(analytics, /aria-label="Available reports"[\s\S]*?flex-nowrap[\s\S]*?overflow-x-auto/);
  assert.match(analytics, /window\.history\.replaceState/);
  assert.match(page, /id="analytics-operational-overview"[\s\S]*?defaultCollapsed=/);
});

test("family and child landing screens separate review destinations from focused edit forms", async () => {
  const page = await readSource("src/components/live-ops-pages.tsx");
  const intake = await readSource("src/components/family-student-intake-form.tsx");
  const editor = await readSource("src/components/family-record-editor.tsx");
  const directories = await readSource("src/components/enrollment-visibility-panels.tsx");

  assert.match(page, /id="family-page-directory"[\s\S]*?href: "#family-directory"[\s\S]*?href: "#family-intake"[\s\S]*?href: "#family-editor"/);
  assert.match(page, /FamilyStudentIntakeForm centers=\{data\.intakeCenters\} defaultCollapsed/);
  assert.match(page, /id="child-page-directory"[\s\S]*?href: "#child-directory"[\s\S]*?href: "#child-profile-editor"/);
  assert.match(page, /id="family-summary"[\s\S]*?Restricted custody notes/);
  assert.match(page, /id="child-summary"[\s\S]*?Allergy records[\s\S]*?Medical notes/);
  assert.match(intake, /id="family-intake"[\s\S]*?defaultCollapsed=\{defaultCollapsed\}/);
  assert.match(editor, /id="family-editor"[\s\S]*?defaultCollapsed=\{!initialFamilyId && !initialChildId && !searchQuery\}/);
  assert.match(directories, /id="family-directory"/);
  assert.match(directories, /id="child-directory"/);
});

test("staff review sections stay compact while action anchors open the shared editing workspace", async () => {
  const page = await readSource("src/components/live-ops-pages.tsx");
  const workspace = await readSource("src/components/staff-management-panel.tsx");
  const checklist = await readSource("src/components/staff-onboarding-checklist-panel.tsx");
  const preview = await readSource("src/app/ui-preview/page.tsx");

  assert.match(page, /id="staff-page-directory"[\s\S]*?href: "#staff-assignment"[\s\S]*?href: "#staff-profile"[\s\S]*?href: "#staff-schedule"/);
  assert.match(page, /id="staff-directory"[\s\S]*?defaultCollapsed=/);
  assert.match(page, /id="staff-upcoming-schedule"[\s\S]*?defaultCollapsed/);
  assert.match(workspace, /id="staff-management-workspace"[\s\S]*?defaultCollapsed/);
  assert.match(workspace, /id="staff-certification"[\s\S]*?defaultCollapsed/);
  assert.match(workspace, /id="staff-schedule"[\s\S]*?defaultCollapsed/);
  assert.match(checklist, /id="staff-onboarding-checklist"/);
  assert.match(preview, /href: "\/ui-preview\?view=staff-declutter#staff-assignment"/);
  assert.match(preview, /href: "\/ui-preview\?view=staff-declutter#staff-profile"/);
  assert.match(preview, /href: "\/ui-preview\?view=staff-declutter#staff-schedule"/);
});

test("communications labels review and compose destinations separately", async () => {
  const page = await readSource("src/components/live-ops-pages.tsx");

  assert.match(page, /id="message-page-directory"/);
  assert.match(page, /href: isParentMessagingView \? "#message-history" : "#message-inbox"/);
  assert.match(page, /href: isParentMessagingView \? "#message-composer" : "#new-message-composer"/);
  assert.match(page, /href: "#message-notification-preferences"/);
});
