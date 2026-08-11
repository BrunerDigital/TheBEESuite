import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { centers, modules } from "@/lib/demo-data";
import {
  executiveAnnouncementDemoRows,
  executiveDailyReportDemoRows,
  executiveParentMessageDemoRows,
  executiveParentPortalDemo,
} from "@/lib/executive-demo-data";
import { removeDemoMarkersFromUserView } from "@/lib/user-view-text";

test("known presentation fixture markers are removed from user-facing text", () => {
  assert.equal(removeDemoMarkersFromUserView("Demo Brand Executive"), "Brand Executive");
  assert.equal(removeDemoMarkersFromUserView("Kid City USA - Demo"), "Kid City USA - Little Harbor");
  assert.equal(removeDemoMarkersFromUserView("Demo parent message with warm professional tone."), "Parent message with warm professional tone.");
  assert.equal(removeDemoMarkersFromUserView("Demo website inquiry"), "Website inquiry");
  assert.equal(removeDemoMarkersFromUserView("demoexec@demo.thebeesuite.io"), "executive@example.com");
});

test("presentation cleanup leaves stored source wording unchanged", () => {
  assert.equal(removeDemoMarkersFromUserView("ProCare Preschool"), "ProCare Preschool");
  assert.equal(removeDemoMarkersFromUserView("procare_family_account_id"), "procare_family_account_id");
});

test("fallback presentation data no longer labels itself as demo content", () => {
  const visibleFallbackContent = JSON.stringify({
    centers,
    moduleMetrics: modules.flatMap((module) => [...module.metrics, ...module.records]),
    announcements: executiveAnnouncementDemoRows.map((row) => [row.title, row.body, row.audience]),
    reports: executiveDailyReportDemoRows.map((row) => [row.child.fullName, row.teacherNote, row.classroom?.center]),
    messages: executiveParentMessageDemoRows.map((row) => [row.subject, row.body, row.family]),
    parentPortal: {
      family: [
        executiveParentPortalDemo.family.name,
        executiveParentPortalDemo.family.billingEmail,
        ...executiveParentPortalDemo.family.guardians.flatMap((guardian) => [guardian.fullName, guardian.email]),
        ...executiveParentPortalDemo.family.children.map((child) => child.fullName),
      ],
      invoiceNumbers: executiveParentPortalDemo.invoices.map((invoice) => invoice.number),
      reportChildren: executiveParentPortalDemo.dailyReports.map((report) => report.child.fullName),
      incidentChildren: executiveParentPortalDemo.incidents.map((incident) => incident.child.fullName),
      messageCopy: executiveParentPortalDemo.messages.flatMap((message) => [message.subject, message.body]),
      documentNames: executiveParentPortalDemo.documents.map((document) => document.name),
      announcementCopy: executiveParentPortalDemo.announcements.flatMap((announcement) => [announcement.title, announcement.body]),
    },
  });

  assert.doesNotMatch(visibleFallbackContent, /\bdemo\b/i);
});

test("actual user components do not render demo notices", async () => {
  const componentPaths = [
    "../src/components/dashboard.tsx",
    "../src/components/live-ops-pages.tsx",
    "../src/components/classroom-ratio-assignment-panel.tsx",
    "../src/components/parent-portal-workspace.tsx",
  ];
  const source = (await Promise.all(componentPaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");

  assert.doesNotMatch(source, /Demo account data/);
  assert.doesNotMatch(source, /Demo account preview/);
  assert.doesNotMatch(source, />Demo view</);
  assert.doesNotMatch(source, /Demo workspace/);
  assert.doesNotMatch(source, /Demo school/);
});
