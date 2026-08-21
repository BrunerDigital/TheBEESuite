import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("family and communication views keep family names alphabetized", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function sortFamiliesByName<[^>]+>\(families: readonly T\[\]\)/);
  assert.match(page, /left\.name\.localeCompare\(right\.name, "en-US", \{ sensitivity: "base", numeric: true \}\)/);
  assert.equal((page.match(/orderBy: \[\{ name: "asc" \}, \{ id: "asc" \}\]/g) ?? []).length >= 3, true);
  assert.match(page, /const allFamiliesWithRequested = sortFamiliesByName\(/);
  assert.match(page, /const familiesWithRequested = sortFamiliesByName\(/);
  assert.match(page, /const familyOptions = sortFamiliesByName\(families\.map/);
});

test("the child profile captures the same exact days-per-week schedule used by billing and FTE", () => {
  const editor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /<Label htmlFor="family-editor-child-scheduled-days">Days per week<\/Label>/);
  assert.match(editor, /<SelectItem value="2">2 days\/week<\/SelectItem>/);
  assert.match(editor, /<SelectItem value="5">5 days\/week<\/SelectItem>/);
  assert.match(editor, /scheduledDaysPerWeek: childScheduledDays/);
  assert.match(editor, /Used for child scheduling and FTE calculations\./);
});
