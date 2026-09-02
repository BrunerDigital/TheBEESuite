import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared collapsible sections expose accessible persisted controls and concise summaries", async () => {
  const source = await readSource("src/components/workspace-preferences.tsx");

  assert.match(source, /return `\$\{preferencePrefix\}:\$\{kind\}:\$\{id\}`/);
  assert.match(source, /aria-expanded=\{!collapsed\}/);
  assert.match(source, /aria-controls=\{contentId\}/);
  assert.match(source, /collapsedSummary \|\| description/);
  assert.match(source, /data-collapsible-panel="true"/);
  assert.match(source, /window\.addEventListener\("hashchange", expandFromLocationHash\)/);
  assert.match(source, /document\.addEventListener\("click", expandFromAnchorClick\)/);
  assert.match(source, /element\?\.focus\(\{ preventScroll: true \}\)/);
});

test("teacher portal opens focused tasks from a compact landing view", async () => {
  const source = await readSource("src/components/teacher-mobile-workspace.tsx");

  assert.match(source, /aria-label="Teacher task shortcuts"/);
  assert.match(source, /\["Check attendance", "#teacher-attendance"\]/);
  assert.match(source, /id="teacher-profile-setup"[\s\S]*?defaultCollapsed=\{profileReady\}/);
  assert.match(source, /id="teacher-roster"[\s\S]*?title="Roster"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="teacher-daily-report"[\s\S]*?title="Daily Report"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="teacher-attendance"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="teacher-location"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="teacher-photo"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="teacher-incident"[\s\S]*?defaultCollapsed/);
});

test("parent home uses status-aware compact panels without hiding today's child status", async () => {
  const source = await readSource("src/components/parent-portal-workspace.tsx");

  assert.match(source, /className="parent-portal-feature/);
  assert.match(source, /id="parent-home-attention"/);
  assert.match(source, /defaultCollapsed=\{!homeAttentionCount\}/);
  assert.match(source, /id="parent-home-announcements"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="parent-home-account"[\s\S]*?defaultCollapsed=\{balanceCents <= 0\}/);
});

test("executive and director dashboard secondary views default to compact summaries", async () => {
  const source = await readSource("src/components/dashboard.tsx");

  assert.match(source, /id=\{`dashboard-\$\{lens\}-executive-summary`\}/);
  assert.match(source, /id=\{`dashboard-\$\{lens\}-weekly-fte-progress`\}[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="dashboard-director-capacity-by-classroom"[\s\S]*?defaultCollapsed/);
  assert.match(source, /id="dashboard-director-action-queue"[\s\S]*?collapsedSummary/);
  assert.match(source, /id=\{`dashboard-\$\{tab\}-widget-\$\{widget.id\}`\}[\s\S]*?defaultCollapsed/);
});
