import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("every individual task exposes the same controlled guarded child picker", () => {
  const source = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  for (const [task, id, label] of [["teacher-photo", "photo-child", "Child for photo"], ["teacher-incident", "incident-child", "Child for incident"], ["teacher-location", "location-child", "Child to move"]]) {
    const start = source.indexOf(`<CollapsibleCard id="${task}"`);
    const section = source.slice(start, source.indexOf("</CollapsibleCard>", start));
    assert.match(section, new RegExp(`<TeacherChildPicker id="${id}" label="${label}"`));
    assert.match(section, /groups=\{byClassroom\} selectedChildId=\{selectedChildId\} disabled=\{isPending\} onChildChange=\{chooseChild\}/);
    assert.doesNotMatch(section.split(">")[0], /description=/, "Expanded forms must not repeat the child above its picker");
  }
  assert.equal((source.match(/<TeacherChildPicker /g) ?? []).length, 3);
  assert.equal((source.match(/setSelectedChildId\(/g) ?? []).length, 1, "Only the existing guarded transition changes individual context");
  assert.match(source, /<fieldset\s+disabled=\{isPending\}/);
  assert.match(source, /changesChild && hasSingleChildDraft/);
  assert.match(source, /selectedDailyReportChildIds.length > 1 \? selectedDailyReportChildIds : \[childId\]/);
  const incidentStart = source.indexOf('<CollapsibleCard id="teacher-incident"');
  const incident = source.slice(incidentStart, source.indexOf("</CollapsibleCard>", incidentStart));
  assert.doesNotMatch(incident.split(">")[0], /description=/, "Generic guidance cannot precede the selected child on small screens");
  assert.ok(incident.indexOf('id="incident-child"') < incident.indexOf("Send an objective record"));
  assert.match(source, /Current location: \{locationFor\(selectedChild\)\}/);
});

test("shared child picker shows full current identity without fallback or private option fields", () => {
  const source = readFileSync("src/components/teacher-child-picker.tsx", "utf8");
  assert.match(source, /children.find\(child => child.id === selectedChildId\)/);
  assert.match(source, /value=\{selected\?\.id \?\? ""\}/);
  assert.match(source, /disabled=\{disabled \|\| !children.length\}/);
  assert.match(source, /children.some\(child => child.id === value\)/);
  assert.match(source, /<SelectValue[^>]*>\{selected\?\.fullName\}/);
  assert.match(source, /aria-describedby=\{`\$\{id\}-hint`\}/);
  assert.match(source, /Shared child for Photo, Incident and Location/);
  assert.doesNotMatch(source, /children\[0\]|useState|useEffect|fetch\(|truncate|custody|medical|allerg/i);
});

test("short teacher screens stop reserving a header that is no longer sticky", () => {
  const source = readFileSync("src/app/product-ui.css", "utf8");
  const marker = "/* The short-screen header is in document flow";
  const start = source.indexOf(marker);
  assert.ok(start > source.indexOf('scroll-margin-top: calc(var(--bee-app-header-height, 4.75rem) + 1rem)'));
  assert.match(source.slice(start - 65, start), /@media \(max-height: 640px\) and \(max-width: 1023px\)/);
  const rule = source.slice(start, source.indexOf("\n  }", start));
  assert.match(rule, /\.bee-app-frame:has\(\.app-bottom-navigation\) \.teacher-mobile-workspace/);
  assert.match(rule, /#teacher-quick-log, #teacher-home-heading, a, button, input, textarea, \[role="combobox"\]/);
  assert.match(rule, /scroll-margin-block-start: 12px/);
  assert.doesNotMatch(rule, /scroll-margin-block-end|font-size|parent-portal/);
});
