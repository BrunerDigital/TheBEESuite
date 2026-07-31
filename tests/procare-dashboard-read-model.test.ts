import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SCHOOL_DASHBOARD_LIST_LIMIT } from "../src/lib/dashboard-query-limits";

test("school dashboard directory limit covers a normal full ProCare export", () => {
  assert.ok(SCHOOL_DASHBOARD_LIST_LIMIT >= 454);
  assert.ok(SCHOOL_DASHBOARD_LIST_LIMIT <= 5_000);

  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  assert.equal(page.match(/take: SCHOOL_DASHBOARD_LIST_LIMIT/g)?.length, 4);
});

test("bounded family and child directories expose their full database counts", () => {
  const panels = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");
  const pages = readFileSync(new URL("../src/components/live-ops-pages.tsx", import.meta.url), "utf8");

  assert.match(panels, /Showing the first/);
  assert.match(panels, /visibleFamilies\.length < visibleFamilyCount/);
  assert.match(panels, /visibleChildren\.length < visibleChildCount/);
  assert.match(pages, /allFamilyCount=\{data\.stats\.allFamilyTotal\}/);
  assert.match(pages, /allChildCount=\{data\.stats\.allTotal\}/);
});

test("dashboard and reporting teacher metrics require active users", () => {
  const dashboard = readFileSync(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
  const schoolPages = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const reporting = readFileSync(new URL("../src/lib/reporting-analytics.ts", import.meta.url), "utf8");
  const inactiveTeacherFilter = /user:\s*\{\s*role:\s*UserRole\.TEACHER\s*\}/g;

  assert.doesNotMatch(dashboard, inactiveTeacherFilter);
  assert.doesNotMatch(reporting, inactiveTeacherFilter);
  assert.equal(schoolPages.match(inactiveTeacherFilter)?.length, 1, "only the staff-history directory may include inactive teachers");
  assert.ok((schoolPages.match(/role:\s*UserRole\.TEACHER,\s*isActive:\s*true/g) ?? []).length >= 8);
  assert.doesNotMatch(dashboard, /classroom\._count\.staff \|\| 1/);
});
