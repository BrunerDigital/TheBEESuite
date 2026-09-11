import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("parent mobile actions stay labeled and use a zoom-responsive two-column minimum", () => {
  const parent = read("src/components/parent-portal-workspace.tsx");
  assert.match(parent, /min-h-14[\s\S]*\{mobileLabel\}/);
  for (const label of ["School Check-In", "Message School", "Photos & Reports", "View Payments"]) assert.ok(parent.includes(`"${label}"`));
  assert.match(read("src/app/parent-mobile-home.css"), /repeat\(auto-fit, minmax\(min\(100%, 7\.5rem\), 1fr\)\)/);
  assert.match(parent, /flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5/);
  assert.match(parent, /child\.today\?\.label \|\| "Not marked today"/);
  assert.match(parent, /Daily report ready/);
});

test("teacher overview consolidates status and all six shortcuts after critical warnings", () => {
  const teacher = read("src/components/teacher-mobile-workspace.tsx");
  const overview = teacher.indexOf("data-teacher-home-overview");
  assert.ok(overview > teacher.indexOf("{selectedCustodyWarning ? ("));
  assert.ok(overview > teacher.indexOf("Sync queued actions"));
  const block = teacher.slice(overview, teacher.indexOf("{kioskAccess ? (", overview));
  assert.match(block, /isOnline && !offlineQueue\.length/);
  for (const id of ["attendance", "daily-report", "photo", "incident", "roster", "profile-setup"]) assert.ok(block.includes(`#teacher-${id}`));
  assert.match(read("src/app/product-ui.css"), /max\(7rem, calc\(\(100% - 1rem\) \/ 3\)\)/);
});

test("shared review restrictions remain visible with keyboard-expandable full explanation", () => {
  const teacher = read("src/components/teacher-mobile-workspace.tsx");
  assert.match(teacher, /appReviewMode \? \([\s\S]*<details[\s\S]*data-teacher-review-notice/);
  assert.match(teacher, /<summary[^>]*min-h-11[\s\S]*Shared review profile is protected/);
  assert.match(teacher, /cannot change the shared profile, create a staff kiosk code, or clock time/);
  assert.match(teacher, /if \(appReviewMode\) \{[\s\S]*Profile and staff kiosk-code changes are disabled/);
});

test("density QA requires visible actions, keyboard navigation, text zoom, and no data writes", () => {
  const qa = read("scripts/qa-mobile-density.ts");
  assert.match(qa, /assertNonProductionBaseUrl/);
  assert.match(qa, /request\.method\(\) !== "GET"/);
  assert.match(qa, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(qa, /metrics\.actions\.every\(\(action\) => action\.visible\)/);
  assert.match(qa, /for \(const zoom of \[1, 2\]\)/);
  assert.match(qa, /element\.contains\(document\.activeElement\)/);
  assert.match(qa, /assert\.equal\(results\.length, 42\)/);
});
