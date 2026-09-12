import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sameTeacherDraftTargets, teacherReportDraftSignature, validateTeacherDraftTargets } from "../src/lib/teacher-draft-targets";

test("teacher report selection rejects 41 children rather than silently dropping a recipient", () => {
  const roster = Array.from({ length: 42 }, (_, index) => `fake-${index}`);
  for (const count of [0, 1, 39, 40]) assert.deepEqual(validateTeacherDraftTargets(roster.slice(0, count), roster), { ok: true, ids: roster.slice(0, count) });
  for (const count of [41, 42]) assert.equal(validateTeacherDraftTargets(roster.slice(0, count), roster).ok, false);
  assert.deepEqual(validateTeacherDraftTargets([roster[0], roster[0]], roster), { ok: true, ids: [roster[0]] });
});

test("removed teacher report recipients fail closed instead of saving the remaining subset", () => {
  assert.equal(validateTeacherDraftTargets(["a", "b"], ["b"]).ok, false);
  assert.equal(validateTeacherDraftTargets(["removed"], ["another-child"]).ok, false);
  assert.equal(sameTeacherDraftTargets(["a", "b"], ["b", "a"]), true);
  assert.equal(sameTeacherDraftTargets(["a"], ["b"]), false);
});

test("teacher draft comparisons preserve every entered field while ignoring generated row IDs", () => {
  const draft = { mood: "Happy", date: "2026-09-11", noNap: false, sendToParent: false, meals: [{ id: "a", food: "Fake lunch", amount: "Some", touched: true }] };
  assert.equal(teacherReportDraftSignature(draft), teacherReportDraftSignature({ ...draft, meals: [{ ...draft.meals[0], id: "b" }] }));
  for (const changed of [{ ...draft, noNap: true }, { ...draft, sendToParent: true }, { ...draft, mood: "Tired" }, { ...draft, date: "2026-09-12" }]) assert.notEqual(teacherReportDraftSignature(draft), teacherReportDraftSignature(changed));
});

test("teacher child transitions and attendance cannot silently retarget unsent content", () => {
  const source = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  assert.doesNotMatch(source, /roster.find\(\(child\) => child.id === selectedChildId\) \?\? roster\[0\]/);
  assert.doesNotMatch(source, /\.slice\(0, 40\)/);
  assert.doesNotMatch(source, /chooseChild\(child.id\);\s*submitAttendance/);
  assert.match(source, /changesChild && hasSingleChildDraft/);
  assert.match(source, /changesReports && hasReportDraft/);
  assert.match(source, /if \(hasReportDraft && !window.confirm/);
  assert.match(source, /const target = validateTeacherDraftTargets\(selectedDailyReportChildIds/);
  assert.match(source, /<fieldset\s+disabled=\{isPending\}/);
  assert.match(source, /ref=\{photoInputRef\}/);
  assert.match(source, /useUnsavedChangesGuard/);
  assert.match(source, /locationTarget !== "area:Playground"/);
  assert.match(source, /if \(changesReports\) resetDailyReportDrafts\(\{ preserveSettings: true \}\)/);
  assert.match(source, /onQueued: \(\) => \{\s*markDailyReportsLocally\(targetChildIds, "queued"\);\s*resetDailyReportDrafts\(\{ preserveSettings: true \}\)/);
  assert.match(source, /onSuccess: \(\) => \{\s*markDailyReportsLocally\(targetChildIds, sendToParent \? "sent" : "draft"\);\s*resetDailyReportDrafts\(\{ preserveSettings: true \}\)/);
});
