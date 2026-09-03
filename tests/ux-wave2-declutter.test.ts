import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("documents separate action shortcuts from expandable records", async () => {
  const source = await readSource("src/components/live-ops-pages.tsx");
  const checklist = await readSource("src/components/required-document-checklist-panel.tsx");

  assert.match(source, /aria-label="Document tasks"/);
  assert.match(source, /href="#required-document-action-rows"/);
  assert.match(source, /href="#document-signature-request"/);
  assert.match(source, /id="document-records"[\s\S]*?defaultCollapsed=\{!data\.stats\.pending\}/);
  assert.match(source, /id="document-request-editor"[\s\S]*?defaultCollapsed/);
  assert.match(source, /OperationsActionHub[\s\S]*?defaultEntity="document"[\s\S]*?embedded/);
  assert.match(checklist, /id="required-document-action-rows"[\s\S]*?defaultCollapsed/);
  assert.doesNotMatch(checklist, /id="required-document-action-rows"[\s\S]*?defaultCollapsed=\{!visibleRequestableItems\.length\}/);
});

test("compliance keeps safety summaries visible and opens focused entry tools by anchor", async () => {
  const page = await readSource("src/components/live-ops-pages.tsx");
  const licensing = await readSource("src/components/licensing-configuration-panel.tsx");
  const drills = await readSource("src/components/emergency-drill-log-panel.tsx");
  const medication = await readSource("src/components/medication-log-panel.tsx");
  const tasks = await readSource("src/components/compliance-task-panel.tsx");

  assert.match(page, /aria-label="Compliance tasks"/);
  assert.match(page, /id="compliance-recent-medication-logs"[\s\S]*?defaultCollapsed/);
  assert.match(licensing, /id="compliance-licensing-configuration"[\s\S]*?defaultCollapsed/);
  assert.match(drills, /id="compliance-emergency-drills"[\s\S]*?defaultCollapsed/);
  assert.match(medication, /id="compliance-medication-log"[\s\S]*?defaultCollapsed/);
  assert.match(tasks, /id="compliance-task-workspace"[\s\S]*?defaultCollapsed/);
});

test("communications exposes inbox and compose actions while collapsing secondary settings", async () => {
  const page = await readSource("src/components/live-ops-pages.tsx");
  const composer = await readSource("src/components/message-reply-panel.tsx");
  const preferences = await readSource("src/components/notification-preferences-panel.tsx");

  assert.match(page, /aria-label="Message tasks"/);
  assert.match(page, /href="#new-message-composer"/);
  assert.match(page, /id="message-history"[\s\S]*?defaultCollapsed=\{!data\.stats\.unread\}/);
  assert.match(composer, /id=\{composerId\}[\s\S]*?defaultCollapsed=\{defaultCollapsed && !replyDraft\}/);
  assert.match(preferences, /id="message-notification-preferences"[\s\S]*?defaultCollapsed/);
});

test("reporting shows concise summaries before detailed tables", async () => {
  const analytics = await readSource("src/components/analytics-report-builder.tsx");
  const form = await readSource("src/components/fte-report-form.tsx");
  const explorer = await readSource("src/components/fte-report-explorer.tsx");

  for (const id of [
    "analytics-enrollment-details",
    "analytics-lead-source-details",
    "analytics-attendance-details",
    "analytics-billing-details",
    "analytics-message-details",
    "analytics-staff-hour-details",
  ]) assert.match(analytics, new RegExp(`id="${id}"[\\s\\S]*?defaultCollapsed`));

  assert.match(form, /id=\{`fte-\$\{mode\}-legacy-fields`\}[\s\S]*?defaultCollapsed/);
  assert.match(form, /id=\{`fte-\$\{mode\}-report-history`\}[\s\S]*?defaultCollapsed/);
  assert.match(explorer, /id="fte-trend-and-breakdowns"[\s\S]*?defaultCollapsed/);
  assert.match(explorer, /id="fte-school-navigator"[\s\S]*?defaultCollapsed/);
  assert.match(explorer, /id="fte-filtered-report-history"[\s\S]*?defaultCollapsed/);
});

test("teacher document detail cards stay compact unless a custody warning needs visibility", async () => {
  const source = await readSource("src/components/live-ops-pages.tsx");

  assert.match(source, /id=\{`teacher-document-child-\$\{child\.id\}`\}/);
  assert.match(source, /defaultCollapsed=\{!hasCustodyWarning\(child\.family\)\}/);
  assert.match(source, /forceExpanded=\{hasCustodyWarning\(child\.family\)\}/);
  assert.match(source, /id="teacher-visible-files"[\s\S]*?defaultCollapsed/);
});
