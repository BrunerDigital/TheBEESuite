import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveFteReportSelection } from "../src/lib/fte-report-selection";

test("FTE links select only authorized schools and exact calendar dates", () => {
  for (const week of ["2024-02-29", "2026-09-09", "2026-12-31"]) {
    assert.deepEqual(resolveFteReportSelection(["a", "b"], "b", week), { centerId: "b", weekStart: week, error: null });
  }
  for (const week of ["2026-02-29", "2026-04-31", "2026-13-01", "yesterday", "2026-09-09T00:00:00Z"]) {
    assert.ok(resolveFteReportSelection(["a"], "a", week).error);
  }
  assert.ok(resolveFteReportSelection(["a"], "b", "2026-09-07").error);
  assert.ok(resolveFteReportSelection([], "b", "2026-09-07").error);
  assert.deepEqual(resolveFteReportSelection(["a", "b"]), { centerId: null, weekStart: null, error: null });
});

test("historical FTE targets supplement recent rows through the same scoped query", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /resolveFteReportSelection\(visibleCenterIds/);
  assert.match(page, /!selection.error && selection.weekStart/);
  assert.match(page, /getFteReports\(selection.centerId \? \[selection.centerId\] : visibleCenterIds/);
  assert.match(page, /centerId: centerIdFilter\(centerIds\), .*weekStart: new Date/);
  assert.match(page, /new Map\(\[\.\.\.recentFteReports, \.\.\.requestedFteReports\]/);
});

test("FTE editors preserve saved zeros, exact targets and historical isolation", () => {
  const form = readFileSync("src/components/fte-report-form.tsx", "utf8");
  const explorer = readFileSync("src/components/fte-report-explorer.tsx", "utf8");
  assert.match(form, /if \(report\) return formFromReport\(report, mode\)/);
  assert.match(form, /weekStart === defaultWeekStart\(\) \? defaultValuesForCenter\(centerId, prefills\) : undefined/);
  assert.match(form, /loadForm\(formForTarget\(form.centerId, value\)\)/);
  assert.match(form, /if \(confirmDiscard\(\)\) loadForm\(formForTarget\(form.centerId, form.weekStart\)\)/);
  for (const source of [form, explorer]) {
    assert.match(source, /fteCount: String\(report.fteCount\)/);
    assert.match(source, /requestWithNetworkRecovery/);
    assert.match(source, /useUnsavedChangesGuard/);
  }
});

test("read-only FTE users retain history without write or forbidden export controls", () => {
  const pages = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  assert.match(pages, /const canManageFte = data.canManageFte === true/);
  assert.match(pages, /canManageFte \? <FteReportForm/);
  assert.match(pages, /canManageFte \? <a/);
  assert.match(pages, /isExecutive && canApproveFte && !data.selection\?\.error \? <FteBulkImportPanel/);
  assert.match(pages, /canEdit=\{canApproveFte\}/);
  assert.match(pages, /mode=\{canApproveFte \? "executive" : "director"\}/);
  const route = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.equal(route.match(/canApproveFte: isExecutiveFteManager\(user.role\)/g)?.length, 2, "Approval permission follows the role even in a one-school workspace");
  const form = readFileSync("src/components/fte-report-form.tsx", "utf8");
  assert.match(form, /currentWeekReport\?\.status === "approved" && mode !== "executive"/);
});
