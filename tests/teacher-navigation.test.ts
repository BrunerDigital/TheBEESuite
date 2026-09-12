import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTeacherWorkspaceLocation, teacherActiveTask, teacherTaskHref } from "../src/lib/teacher-navigation";

const portal = { pathname: "/teacher-portal", search: "centerId=fake-center&keep=1" };
const preview = { pathname: "/device-preview", search: "view=teacher&scenario=history-qa&keep=1", previewMode: true };
test("teacher task links preserve the current document and all query state", () => {
  for (const location of [portal, preview]) for (const target of ["teacher-home-heading", "teacher-roster", "teacher-quick-log", "teacher-profile-setup"]) {
    assert.equal(teacherTaskHref(`/teacher-portal#${target}`, location), `#${target}`);
  }
  for (const href of ["/family-detail?view=messages", "/dashboard#teacher-roster", "/teacher-portal?centerId=other#teacher-roster", "https://example.test/teacher-portal#teacher-roster"]) {
    assert.equal(teacherTaskHref(href, portal), href);
  }
  for (const location of [{ ...preview, previewMode: false }, { ...preview, search: "view=parent" }, { pathname: "/family-detail", search: "view=messages" }]) {
    assert.equal(isTeacherWorkspaceLocation(location), false);
    assert.equal(teacherTaskHref("/teacher-portal#teacher-roster", location), "/teacher-portal#teacher-roster");
  }
});
test("teacher active task follows URL shortcuts and history instead of the last clicked tab", () => {
  for (const location of [portal, preview]) {
    for (const hash of ["", "#teacher-home-heading"]) assert.equal(teacherActiveTask({ ...location, hash }), "Today");
    for (const hash of ["#teacher-roster", "#teacher-attendance", "#teacher-location"]) assert.equal(teacherActiveTask({ ...location, hash }), "Roster");
    for (const hash of ["#teacher-quick-log", "#teacher-daily-report", "#teacher-photo", "#teacher-incident", "#teacher-%64aily-report"]) assert.equal(teacherActiveTask({ ...location, hash }), "Log");
    for (const hash of ["#teacher-profile-setup", "#teacher-staff-clock", "#unrelated", "#%E0%A4%A"]) assert.equal(teacherActiveTask({ ...location, hash }), null);
  }
  assert.equal(teacherActiveTask({ pathname: "/family-detail", search: "view=messages&familyId=fake", hash: "" }), "Messages");
  assert.equal(teacherActiveTask({ pathname: "/family-detail", search: "view=billing", hash: "#teacher-roster" }), null);
});
test("teacher fixture enables only draft navigation while retaining preview data guards", () => {
  const workspace = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const previewPage = readFileSync("src/app/device-preview/page.tsx", "utf8");
  assert.match(workspace, /process\.env\.NODE_ENV === "development" && previewHistoryGuard/);
  assert.match(previewPage, /TeacherMobileWorkspace previewMode previewHistoryGuard=\{scenario === "history-qa"\}/);
  assert.match(previewPage, /process\.env\.NODE_ENV !== "development"\) notFound/);
  assert.match(shell, /useSyncExternalStore\(subscribeToHashChange, locationHashSnapshot, serverHashSnapshot\)/);
  assert.match(shell, /window\.addEventListener\("hashchange", onChange\)/);
  assert.match(shell, /window\.addEventListener\("popstate", onChange\)/);
  assert.match(shell, /<TeacherTaskLink href="\/teacher-portal#teacher-profile-setup"/);
  assert.match(workspace, /id="teacher-home-heading" tabIndex=\{-1\}/);
});

test("compact teacher headers keep disclosure controls beside titles without changing other workspaces", () => {
  const workspace = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  const cards = readFileSync("src/components/workspace-preferences.tsx", "utf8");
  assert.equal((workspace.match(/\bcompactHeader\b/g) ?? []).length, 8);
  assert.match(cards, /compactHeader = false/);
  assert.match(cards, /compactHeader \? "grid grid-cols-\[minmax\(0,1fr\)_auto\] items-start gap-2"/);
  assert.match(cards, /compactHeader && headerActions \? <div className="col-span-2 min-w-0">\{headerActions\}/);
});
