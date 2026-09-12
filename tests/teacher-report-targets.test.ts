import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("compact report targets stay separate from individual-task context and disclose every recipient", () => {
  const source = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  const start = source.indexOf('<section id="teacher-quick-log"');
  const section = source.slice(start, source.indexOf("</section>", start));
  assert.match(section, /tabIndex=\{-1\}/);
  assert.equal((section.match(/<Label/g) ?? []).length, 1);
  assert.match(section, /htmlFor="daily-report-child"[\s\S]*Report targets/);
  assert.match(section, /onValueChange=\{\(value\) => \{ if \(value\) setDailyReportTargets\(\[value\]\)/);
  assert.doesNotMatch(section, /chooseChild|selectedChild\??\./);
  assert.match(section, /<details[^>]*data-report-recipients/);
  assert.match(section, /View selected children/);
  assert.match(section, /activeDailyReportChildren.map\(\(child\) => <li/);
  assert.doesNotMatch(section, /activeDailyReportChildren.slice/);
  assert.match(source, /onClick=\{\(\) => chooseChild\(child.id\)\}/, "Individual selection remains available in the roster");
  assert.match(section, /onClick=\{selectPresentDailyReports\}/);
  assert.match(section, /setDailyReportTargets\(roster.map/);
  assert.match(section, /MAX_CHILDREN_PER_REPORT_BATCH/);
  assert.doesNotMatch(section, /truncate|line-clamp/);
  assert.match(section, /No children are on your roster/);
  assert.match(section, /Select disabled=\{!roster.length\}/);
});

test("target-specific styles wrap full names and retain touch targets without shrinking text", () => {
  const css = readFileSync("src/components/teacher-report-targets.module.css", "utf8");
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.toolbar[\s\S]*?flex-wrap: wrap/);
  assert.match(css, /-webkit-line-clamp: unset/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /font-size|text-size-adjust|zoom:|scale\(/);
});
