import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("teacher daily tasks precede setup without losing accessible roster actions", () => {
  const teacher = source("src/components/teacher-mobile-workspace.tsx");
  assert.ok(teacher.indexOf('aria-label="Teacher task shortcuts"') < teacher.indexOf('id="teacher-profile-setup"'));
  assert.match(teacher, /aria-pressed=\{selectedChild\?\.id === child\.id\}/);
  for (const action of ["Check in", "Check out", "Mark absent"]) assert.ok(teacher.includes(`aria-label={\`${action} \${child.fullName}\`}`));
  assert.match(teacher, /No children assigned yet/);
  assert.match(teacher, /!isOnline \|\| offlineQueue\.length > 0/);
  assert.match(teacher, /Sync queued actions/);
  const css = source("src/app/product-ui.css");
  assert.match(css, /\.teacher-mobile-workspace :is\(\[data-collapsible-card="true"\], #teacher-quick-log\)\s*\{\s*scroll-margin-top: calc\(var\(--bee-app-header-height, 4\.75rem\) \+ 1rem\)/);
  const captures = source("scripts/capture-app-store-screenshot-drafts.mjs");
  assert.match(captures, /expandedSelector: "#teacher-roster", focusSelector: "#teacher-roster"/);
  assert.match(captures, /expandedSelector: "#teacher-daily-report", focusSelector: "#teacher-quick-log"/);
});

test("actual teacher preview cannot initialize, replay, upload or mutate production data", () => {
  const teacher = source("src/components/teacher-mobile-workspace.tsx");
  assert.match(teacher, /useEffect\(\(\) => \{\s*if \(previewMode\) return;/);
  for (const [start, end] of [["async function postJsonOrQueue", "function flushOfflineQueue"], ["function flushOfflineQueue", "function attendanceFor"], ["function saveTeacherProfile", "function submitAttendance"], ["function submitPhoto", "const activeDailyReportChildren"]]) {
    const block = teacher.slice(teacher.indexOf(start), teacher.indexOf(end));
    assert.ok(block.indexOf("if (previewMode)") >= 0, start);
    assert.ok(block.indexOf("if (previewMode)") < block.indexOf("fetch("), start);
  }
  assert.match(teacher, /!appReviewMode && !previewMode \? \([\s\S]*<SetupChecklistPanel/);
  const preview = source("src/app/device-preview/page.tsx");
  assert.match(preview, /<TeacherMobileWorkspace previewMode/);
  assert.match(preview, /function PortfolioPreview[\s\S]*<ExecutiveDashboard live=/);
});

test("dashboard priorities reuse scoped destinations and empty states remain truthful", () => {
  const dashboard = source("src/components/dashboard.tsx");
  assert.ok((dashboard.match(/href=\{actionQueueHref\(item\)\}/g) ?? []).length === 2);
  assert.match(dashboard, /function actionQueueHref[\s\S]*widgetSummaries\[item\.widgetId\]\?\.href[\s\S]*withQueryParam/);
  assert.match(dashboard, /<h2[^>]*id="dashboard-needs-attention"/);
  assert.match(dashboard, /You’re up to date/);
  assert.match(dashboard, /View all \{actionQueue\.length\} items/);
  assert.match(dashboard, /<Link key=\{school\.id\} href=\{fteReportHref\(school\.id, metrics\.currentWeekKey\)\}/);
  assert.match(dashboard, /No schools in this workspace/);
  assert.match(dashboard, /storageId="dashboard-command-center-kpis"/);
});

test("home zoom and tablet control rules retain readable, full-width actions", () => {
  const css = source("src/app/parent-mobile-home.css");
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 9rem\), 1fr\)\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  const product = source("src/app/product-ui.css");
  assert.match(product, /dashboard-compact-kpis \.honeycomb-kpi-controls button[\s\S]*min-width: 44px;[\s\S]*min-height: 44px/);
  const guard = source("src/components/device-preview-guard.tsx");
  assert.match(guard, /data-preview-destination/);
  assert.match(guard, /event\.stopPropagation\(\);[\s\S]*window\.location\.assign\(href\)/);
});
