import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { screenMessageContent } from "../src/lib/message-content-safety";
import { canReportVisibleMessage } from "../src/lib/message-report-policy";

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
