import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("teacher landing keeps setup and viewing data compact while actions open focused anchors", async () => {
  const teacher = await readSource("src/components/teacher-mobile-workspace.tsx");
  const checklist = await readSource("src/components/setup-checklist-panel.tsx");

  assert.match(teacher, /Today in your classroom/);
  assert.match(teacher, /aria-label="Teacher task shortcuts"[\s\S]*grid grid-cols-2 gap-2/);
  assert.match(teacher, /min-h-11 w-full justify-start whitespace-normal text-left/);
  assert.match(teacher, /id="teacher-profile-setup"[\s\S]*defaultCollapsed/);
  assert.match(teacher, /id="teacher-staff-clock"[\s\S]*collapsedSummary=[\s\S]*defaultCollapsed/);
  assert.match(checklist, /defaultCollapsed\?: boolean/);
  assert.match(checklist, /collapsedSummary=\{`\$\{completedCount\}\/\$\{tasks\.length\} complete`\}/);
});

test("anchored disclosure navigation expands the task without making it the next default", async () => {
  const preferences = await readSource("src/components/workspace-preferences.tsx");

  assert.match(preferences, /const expandForNavigation = useCallback/);
  assert.match(preferences, /setCollapsed\(false\)/);
  assert.match(preferences, /useExpandForHash\(id, expandForNavigation\)/);
  const transientExpansion = preferences.slice(
    preferences.indexOf("const expandForNavigation"),
    preferences.indexOf("return { collapsed:", preferences.indexOf("const expandForNavigation")),
  );
  assert.doesNotMatch(transientExpansion, /localStorage\.setItem/);
});

test("report exports stay discoverable without crowding the mobile collapsed header", async () => {
  const analytics = await readSource("src/components/analytics-report-builder.tsx");

  assert.match(analytics, /headerActions=\{\([\s\S]*hidden flex-wrap gap-2 sm:flex/);
  assert.match(analytics, /sm:hidden" aria-label="Report exports"/);
  assert.ok((analytics.match(/Export CSV/g) ?? []).length >= 2);
  assert.ok((analytics.match(/Print report/g) ?? []).length >= 2);
});

test("dynamic family media bypasses the optimizer that rejects arbitrary signed or demo URLs", async () => {
  const parent = await readSource("src/components/parent-portal-workspace.tsx");
  const featuredMedia = parent.slice(
    parent.indexOf("{featuredMediaSrc ? ("),
    parent.indexOf(") : (", parent.indexOf("{featuredMediaSrc ? (")),
  );

  assert.match(featuredMedia, /src=\{featuredMediaSrc\}/);
  assert.match(featuredMedia, /unoptimized/);
});

test("shared controls provide explicit focus and phone-sized targets", async () => {
  const button = await readSource("src/components/ui/button.tsx");
  const css = await readSource("src/app/globals.css");

  assert.match(button, /focus-visible:outline-2/);
  assert.match(button, /focus-visible:outline-offset-2/);
  assert.match(css, /\.bee-app-frame :is\(a\[href\], button, summary, \[role="button"\], \[data-slot="button"\]\):focus-visible/);
  assert.match(css, /outline: 2px solid var\(--primary\) !important/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.bee-app-frame \[data-slot="button"\][\s\S]*min-height: 2\.75rem/);
  assert.match(css, /:has\(> svg:only-child\)[\s\S]*min-width: 2\.75rem/);
});
