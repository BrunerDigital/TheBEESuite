import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useParentUpdatesHistory } from "../src/components/use-parent-updates-history";
import type { ParentUpdatesPage } from "../src/lib/parent-updates-history";
import { parentPortalWorkspaceHref } from "../src/lib/parent-portal-navigation";
import { appendParentUpdateRows, isParentUpdateDay, isParentUpdatesPage, parseParentUpdatesRequest } from "../src/lib/parent-updates-history";
import { parentUpdateDayWindow } from "../src/lib/parent-updates-query";
import { parentUpdatesPreview } from "../src/lib/parent-updates-preview";

const report = { id: "report-001", date: "2026-09-11T12:00:00.000Z", sentAt: "2026-09-11T20:00:00.000Z", mood: null, teacherNote: "Fake note", suppliesNeeded: null, checkInAt: null, checkOutAt: null, child: { fullName: "Fake Child" }, meals: [], naps: [], diapers: [], activities: [] };
const photo = { id: "photo-001", takenAt: "2026-09-11T12:00:00.000Z", caption: "Fake moment", url: "https://files.example.test/fake.png", child: { fullName: "Fake Child" } };
const request = { familyId: "fake-family", day: "2026-09-11", kind: "day" as const, cursor: null };
const page = { ok: true, familyId: request.familyId, requestDay: request.day, day: request.day, timeZone: "America/New_York", requestKind: "day", requestCursor: null, reports: [report], photos: [photo], nextReportCursor: null, nextPhotoCursor: null, earlierDay: "2026-09-09", laterDay: "2026-09-12" };

test("update dates reject normalized impossible dates and retain actual DST school days", () => {
  for (const day of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-00-01", "2026-09-00", "2026-09-31", "2026-9-01", "2026-09-11T00:00:00Z", "0000-01-01", null]) assert.equal(isParentUpdateDay(day), false);
  assert.equal(isParentUpdateDay("2024-02-29"), true);
  for (const [day, hours] of [["2026-03-08", 23], ["2026-11-01", 25]] as const) {
    const window = parentUpdateDayWindow(day, "America/New_York")!;
    assert.equal((window.end.getTime() - window.start.getTime()) / 3_600_000, hours);
  }
  assert.equal(parentUpdateDayWindow("2026-02-30", "America/New_York"), null);
});
test("update parameters distinguish day navigation from bounded stream continuation", () => {
  assert.deepEqual(parseParentUpdatesRequest(new URLSearchParams("familyId=fake-family")), { familyId: "fake-family", day: null, kind: "day", cursor: null });
  assert.deepEqual(parseParentUpdatesRequest(new URLSearchParams("familyId=fake-family&day=2026-09-11&kind=photos&cursor=photo-051")), { familyId: "fake-family", day: "2026-09-11", kind: "photos", cursor: "photo-051" });
  for (const query of ["", "familyId=../bad", "familyId=fake-family&day=2026-02-30", "familyId=fake-family&day=", "familyId=fake-family&kind=photos", "familyId=fake-family&cursor=photo-001", "familyId=fake-family&day=2026-09-11&kind=reports", "familyId=fake-family&day=2026-09-11&kind=unknown&cursor=a", "familyId=fake-family&familyId=other", "familyId=fake-family&childId=child-001"]) assert.equal(parseParentUpdatesRequest(new URLSearchParams(query)), null, query);
});
test("update receipts correlate family school day stream cursor and exact private-safe projection", () => {
  assert.equal(isParentUpdatesPage(page, request, page.timeZone), true);
  for (const patch of [{ ok: false }, { familyId: "other" }, { day: "2026-09-12" }, { requestDay: null }, { timeZone: "Asia/Tokyo" }, { requestKind: "photos" }, { requestCursor: "wrong" }, { nextReportCursor: "arbitrary" }, { earlierDay: "2026-09-11" }, { laterDay: "2026-09-10" }, { storageKey: "private" }, { reports: [report, report] }, { reports: [{ ...report, sentAt: null }] }, { reports: [{ ...report, childId: "private" }] }, { photos: [{ ...photo, createdAt: "private" }] }, { photos: [{ ...photo, takenAt: "2026-09-11T01:00:00Z" }] }, { photos: [{ ...photo, url: "supabase://private/key" }] }, { photos: [{ ...photo, url: "https://user:secret@files.example.test" }] }, { reports: [{ ...report, naps: [{ id: "nap", startsAt: "invalid", endsAt: null }] }] }]) {
    assert.equal(isParentUpdatesPage({ ...page, ...patch }, request, page.timeZone), false, JSON.stringify(patch));
  }
  assert.equal(isParentUpdatesPage({ ...page, photos: [{ ...photo, url: null }] }, request, page.timeZone), true);
});
test("bounded update receipt requires descending timestamp and ID and a real last-row continuation", () => {
  const reports = Array.from({ length: 50 }, (_, index) => ({ ...report, id: "report-" + String(100 - index).padStart(3, "0") }));
  assert.equal(isParentUpdatesPage({ ...page, reports, nextReportCursor: "report-051" }, request, page.timeZone), true);
  assert.equal(isParentUpdatesPage({ ...page, reports: reports.toReversed() }, request, page.timeZone), false);
  assert.equal(isParentUpdatesPage({ ...page, reports: [...reports, report] }, request, page.timeZone), false);
  assert.equal(isParentUpdatesPage({ ...page, reports, nextReportCursor: "report-052" }, request, page.timeZone), false);
  const continued = { ...request, kind: "reports" as const, cursor: "report-051" };
  assert.equal(isParentUpdatesPage({ ...page, requestKind: "reports", requestCursor: continued.cursor, photos: [] }, continued, page.timeZone), true);
  assert.equal(isParentUpdatesPage({ ...page, requestKind: "reports", requestCursor: continued.cursor }, continued, page.timeZone), false);
  assert.deepEqual(appendParentUpdateRows([report], [report, { ...report, id: "older" }]).map(row => row.id), ["report-001", "older"]);
});
test("actual parent updates route preserves scope, privacy, bounded history and Home independence", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/parent-updates-history-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /101 equal-time reports and photos/); assert.match(result.stdout, /mixed schools and tenants/);
});

test("initial history never renders another family's snapshot even before effects run", () => {
  const initial = page as ParentUpdatesPage;
  function Probe({ familyId, enabled }: { familyId: string; enabled: boolean }) {
    const history = useParentUpdatesHistory({ familyId, initial, enabled, request: async () => { throw new Error("No network authorized"); } });
    return createElement("output", null, history.page?.reports.map(row => row.id).join(",") ?? "none");
  }
  for (const enabled of [true, false]) {
    assert.equal(renderToStaticMarkup(createElement(Probe, { familyId: "another-family", enabled })), "<output>none</output>");
    assert.equal(renderToStaticMarkup(createElement(Probe, { familyId: request.familyId, enabled })), "<output>report-001</output>");
  }
});
test("history document links retain only valid dates in Updates and preserve scoped family", () => {
  const options = { familyId: "fake-family", updateDay: "2026-09-11", hash: "daily-updates" };
  assert.equal(parentPortalWorkspaceHref({ view: "updates", ...options }), "/parent-portal?view=updates&familyId=fake-family&updateDay=2026-09-11#daily-updates");
  assert.doesNotMatch(parentPortalWorkspaceHref({ view: "home", ...options }), /updateDay=/);
  assert.doesNotMatch(parentPortalWorkspaceHref({ view: "updates", ...options, updateDay: "2026-02-30" }), /updateDay=/);
  assert.match(parentPortalWorkspaceHref({ view: "updates", ...options, previewHrefBase: "/demo?role=parent&updateDay=old" }), /screen=updates/);
});

test("server integration gates heavy history to Updates and keeps failed Home truth unknown", () => {
  const source = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const parent = source.slice(source.indexOf("const parentHistoryEnabled ="), source.indexOf('if (slug === "teacher-portal")'));
  assert.match(parent, /parentHistoryEnabled && \(parentUpdatesRequested \|\| parentHomeRequested\)/);
  assert.match(parent, /home = parentHomeRequested \? await readParentUpdatesHome/);
  assert.match(parent, /rows = !parentUpdatesRequested \|\| invalidUpdateDay \? null : await readParentUpdatesRows/);
  assert.equal((parent.match(/childId: \{ in: parentHistoryEnabled \? \[\] : childIds \}/g) ?? []).length, 2, "Legacy streams use a truly empty IN, not a potentially real magic child ID");
  assert.match(parent, /homeUpdatesUnavailable=\{parentHistoryEnabled && parentHomeRequested && !parentUpdateSnapshot\?\.home\}/);
  assert.match(parent, /homeUpdateDay=\{zonedDateKey\(today, parentServiceDay\.timeZone\)\}/);
  assert.match(parent, /logOperationalError\("parent_updates.snapshot_failed", error, \{ view: parentHomeRequested \? "home" : "updates" \}\)/);
  const ui = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(ui, /homeUpdatesUnavailable \? "Update status unavailable/);
  assert.match(ui, /updatesHistoryUnavailable \? "Try latest updates" : "Latest"/);
  assert.match(ui, /updateDay: latestReport \? zonedDateKey\(latestReport.date, timeZone\) : null, hash: latestReport \? "daily-reports" : null/);
});
test("parent date focus correction reuses active-only geometry without stealing later focus", () => {
  const ui = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(ui, /onFocus=\{event => \{ const control = event.currentTarget; requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => revealFocusedPortalControl\(control\)\)\); \}\}/);
  const helper = readFileSync("src/lib/focused-portal-control.ts", "utf8");
  assert.match(helper, /activeElement !== trigger/); assert.doesNotMatch(helper, /\.focus\(/);
  assert.match(readFileSync("src/lib/teacher-child-picker-focus.ts", "utf8"), /revealFocusedPortalControl as revealFocusedTeacherChildPicker/);
  assert.match(ui, /id="parent-update-day" type="date" autoComplete="off"/);
  assert.doesNotMatch(ui, /addEventListener\("pageshow"/);
});
test("development history preview proves photo-only latest, exact empty day and invalid date safely", () => {
  assert.equal(parentUpdatesPreview(undefined)?.day, "2026-09-12");
  assert.equal(parentUpdatesPreview(undefined)?.reports.length, 0);
  assert.equal(parentUpdatesPreview(undefined)?.photos.length, 1);
  const prior = parentUpdatesPreview("2026-09-11")!; assert.equal(prior.reports.length, 1); assert.equal(prior.laterDay, "2026-09-12");
  const empty = parentUpdatesPreview("2026-09-10")!; assert.equal(empty.day, "2026-09-10"); assert.equal(empty.reports.length + empty.photos.length, 0);
  assert.equal(empty.earlierDay, "2026-09-09"); assert.equal(empty.laterDay, "2026-09-11");
  assert.equal(parentUpdatesPreview("2026-02-30"), null); assert.equal(parentUpdatesPreview(["2026-09-11"]), null);
  const route = readFileSync("src/app/device-preview/page.tsx", "utf8");
  assert.match(route, /if \(process.env.NODE_ENV !== "development"\) notFound\(\)/);
  assert.match(route, /<DevicePreviewGuard/);
});
