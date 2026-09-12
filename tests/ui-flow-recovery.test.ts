import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requestWithNetworkRecovery } from "../src/lib/client-request-recovery";
import { dashboardNotificationHref } from "../src/lib/dashboard-notification-navigation";
import { zonedDateKey } from "../src/lib/zoned-date-time";

test("network recovery preserves server responses and never retries an uncertain write", async () => {
  const original = new Response(JSON.stringify({ ok: true }), { status: 201 });
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.method, "POST");
    return original;
  };
  assert.equal(await requestWithNetworkRecovery("/api/example", { method: "POST" }, "Check before retrying.", fetcher), original);
  assert.equal(calls, 1);
  const failed: typeof fetch = async () => { calls++; throw new TypeError("Network unavailable"); };
  const response = await requestWithNetworkRecovery("/api/example", { method: "POST" }, "Check before retrying.", failed);
  assert.equal(calls, 2);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Check before retrying.", outcomeUnknown: true });
});

test("network recovery does not replace authorization or validation responses", async () => {
  for (const status of [400, 401, 403, 409, 429, 500]) {
    const original = new Response("Rejected", { status });
    assert.equal(await requestWithNetworkRecovery("/api/example", { method: "POST" }, "Uncertain", async () => original), original);
  }
});

test("dashboard summaries open the workflow without becoming a literal search", () => {
  assert.equal(dashboardNotificationHref({ text: "3 parent messages need a response", widgetId: "familyCommunication" }, {
    familyCommunication: { href: "/family-detail?view=messages" },
  }), "/family-detail?view=messages");
  assert.equal(dashboardNotificationHref({ text: "4 high-fit leads should be prioritized", widgetId: "enrollmentPipeline" }, {
    enrollmentPipeline: { href: "/crm-leads" },
  }), "/crm-leads");
  assert.equal(dashboardNotificationHref({ text: "2 incident reports need review", widgetId: "complianceQueue", href: "/classroom-dashboard?view=incidents" }, {
    complianceQueue: { href: "/forms?view=compliance" },
  }), "/classroom-dashboard?view=incidents");
  assert.equal(dashboardNotificationHref("A notice", {}), "/notifications");
  for (const href of ["https://example.com", "//example.com", "/\\example.com", "/\n/example.com"]) {
    assert.equal(dashboardNotificationHref({ text: "Notice", href }, {}), "/notifications");
  }
});

test("parent replies preserve text and attachments and confirm context changes", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const reply = source.slice(source.indexOf("function startMessageReply"), source.indexOf("function requestContactUpdate"));
  assert.match(reply, /message\.trim\(\) \|\| messageAttachments\.length/);
  assert.ok(reply.indexOf("window.confirm") < reply.indexOf("setReplyToMessageId"));
  assert.doesNotMatch(reply, /setMessage\(""\)|setMessageAttachments\(\[\]\)/);
});

test("successful acknowledgment updates the button and attention count before refresh", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const action = source.slice(source.indexOf("function acknowledgeIncident"), source.indexOf("function payFamilyBalance"));
  assert.ok(action.indexOf("if (!response.ok)") < action.indexOf("setAcknowledgedIncidentIds"));
  assert.ok(action.indexOf("setAcknowledgedIncidentIds") < action.indexOf("router.refresh()"));
  assert.match(source, /!incident\.parentAcknowledgedAt && !acknowledgedIncidentIds\.has\(incident\.id\)/);
  assert.match(source, /incident\.parentAcknowledgedAt \|\| acknowledgedIncidentIds\.has\(incident\.id\)/);
  assert.match(source, /<Badge role="status">Acknowledged<\/Badge>/);
});

test("parent announcement history is reachable without expanding the home by default", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(source, /<details[^>]*data-earlier-announcements>/);
  assert.match(source, /Earlier announcements \(\{announcements\.length - 1\}\)/);
  assert.match(source, /announcements\.slice\(1\)\.map/);
  assert.doesNotMatch(source, /<details[^>]*\bopen\b[^>]*data-earlier-announcements/);
});

test("parent update grouping uses the school's day across midnight and daylight saving", () => {
  assert.equal(zonedDateKey("2026-09-12T01:30:00Z", "America/New_York"), "2026-09-11");
  assert.equal(zonedDateKey("2026-09-12T01:30:00Z", "Asia/Tokyo"), "2026-09-12");
  for (const time of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) assert.equal(zonedDateKey(time, "America/New_York"), "2026-11-01");
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(source, /const key = zonedDateKey\(value, timeZone\)/);
  assert.match(source, /const timeZone = centerTimeZone \|\| workspaceTimeZone/);
  assert.match(source, /\[updateReports, updatePhotos, timeZone, updatesHistoryEnabled\]/);
  assert.match(source, /ensureDay\(item\.takenAt\)/);
});

test("teacher profile and media recovery retain drafts on uncertain outcomes", () => {
  const source = readFileSync("src/components/teacher-mobile-workspace.tsx", "utf8");
  const profile = source.slice(source.indexOf("function saveTeacherProfile"), source.indexOf("function updateMeal"));
  const photo = source.slice(source.indexOf("function submitPhoto"), source.indexOf("const activeDailyReportChildren"));
  for (const action of [profile, photo]) {
    assert.match(action, /await requestWithNetworkRecovery/);
    assert.ok(action.indexOf("if (previewMode)") < action.indexOf("await requestWithNetworkRecovery"));
    assert.match(action, /could not confirm whether/);
  }
  assert.ok(profile.indexOf("if (!response.ok)") < profile.indexOf('setProfileKioskPin("")'));
  assert.ok(photo.indexOf("if (!response.ok)") < photo.indexOf("setPhoto(null)"));
  assert.match(photo, /before uploading again to avoid a duplicate/);
});
