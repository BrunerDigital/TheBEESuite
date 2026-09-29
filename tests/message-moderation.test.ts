import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { screenMessageContent } from "../src/lib/message-content-safety";
import { canReportVisibleMessage, resolveMessageReportLeaders } from "../src/lib/message-report-policy";

test("reserved review reports never resolve operational notification recipients", async () => {
  for (const reporterEmail of [
    "app-review-parent@thebeesuite.io",
    "app-review-teacher@thebeesuite.io",
    " APP-REVIEW-TEACHER@THEBEESUITE.IO ",
  ]) {
    const recipients = await resolveMessageReportLeaders({
      reporterEmail,
      centerId: "demo-center",
      loadLeaders: async () => {
        assert.fail("Review reports must not look up school leadership inboxes.");
      },
    });
    assert.deepEqual(recipients, []);
  }
});

test("ordinary school reports retain all resolved leadership recipients", async () => {
  const leaders = [{ id: "director" }, { id: "assistant-director" }];
  const queriedCenters: string[] = [];
  const recipients = await resolveMessageReportLeaders({
    reporterEmail: "parent@example.com",
    centerId: "school-center",
    loadLeaders: async (centerId) => {
      queriedCenters.push(centerId);
      return leaders;
    },
  });
  assert.deepEqual(queriedCenters, ["school-center"]);
  assert.deepEqual(recipients, leaders);
});

test("a report without a school does not resolve leadership recipients", async () => {
  assert.deepEqual(await resolveMessageReportLeaders({
    reporterEmail: "parent@example.com",
    centerId: null,
    loadLeaders: async () => {
      assert.fail("A report without a school must not query operational recipients.");
    },
  }), []);
});

test("message safety screen blocks executable links, hidden controls, solicitation, credential requests, and direct threats", () => {
  assert.equal(screenMessageContent("Hello", "Ordinary childcare update.").allowed, true);
  assert.equal(screenMessageContent("Data", "Data: attendance was complete today.").allowed, true);
  assert.equal(screenMessageContent("Link", "javascript:alert(1)").category, "unsafe_link");
  assert.equal(screenMessageContent("Link", "data:text/html,<script>alert(1)</script>").category, "unsafe_link");
  assert.equal(screenMessageContent("Hidden", "hello\u202Eworld").category, "hidden_control");
  assert.equal(screenMessageContent("Threat", "I will hurt you").category, "direct_threat");
  assert.equal(screenMessageContent("Photo", "send me an explicit photo").category, "sexual_solicitation");
  assert.equal(screenMessageContent("Code", "share your verification code").category, "credential_request");
});

test("message reporting fails closed across tenants and permits only visible received messages", () => {
  const viewer = { id: "parent-1", tenantId: "tenant-1", role: "PARENT_GUARDIAN", centerIds: [], canAccessEveryCenter: false };
  const message = {
    senderId: "staff-1",
    assignedToId: null,
    threadKey: "family:family-1",
    tenantId: "tenant-1",
    centerId: "center-1",
    isFamilyMessage: true,
    guardianUserIds: ["parent-1"],
    currentClassroomIds: ["room-1"],
  };
  assert.equal(canReportVisibleMessage(viewer, message), true);
  assert.equal(canReportVisibleMessage(viewer, { ...message, tenantId: "tenant-2" }), false);
  assert.equal(canReportVisibleMessage(viewer, { ...message, senderId: "parent-1" }), false);
  assert.equal(canReportVisibleMessage({ ...viewer, id: "parent-2" }, message), false);
  assert.equal(canReportVisibleMessage({ ...viewer, id: "teacher-1", role: "TEACHER", centerIds: ["center-1"], assignedClassroomId: "room-1" }, message), true);
  assert.equal(canReportVisibleMessage({ ...viewer, id: "teacher-1", role: "TEACHER", centerIds: ["center-1"], assignedClassroomId: "room-2" }, message), false);
  assert.equal(canReportVisibleMessage({ ...viewer, id: "teacher-1", role: "TEACHER", centerIds: ["center-1"], assignedClassroomId: "room-1" }, { ...message, guardianUserIds: [] }), true);
  assert.equal(canReportVisibleMessage(viewer, { ...message, guardianUserIds: [] }), false);
});

test("message report route is origin-protected, idempotent, audited, preserved, and leadership-notified", async () => {
  const source = await readFile(new URL("../src/app/api/communications/messages/[id]/report/route.ts", import.meta.url), "utf8");
  const parent = await readFile(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /hasTrustedMutationOrigin\(request\)/);
  assert.match(source, /deterministicReportId/);
  assert.match(source, /message\.moderation\.reported/);
  assert.match(source, /sentiment: "needs_review"/);
  assert.match(source, /notification\.createMany/);
  assert.doesNotMatch(source, /message\.delete/);
  assert.match(parent, /item\.canReport \? <MessageReportButton messageId=\{item\.id\}/);
});
