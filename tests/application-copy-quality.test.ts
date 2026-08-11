import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("parent, enrollment, and dashboard copy uses plain operational labels", () => {
  const parent = source("src/components/parent-portal-workspace.tsx");
  const enrollment = source("src/components/crm/crm-workspace.tsx");
  const dashboard = source("src/components/dashboard.tsx");
  const dashboardPage = source("src/app/dashboard/page.tsx");
  const workspacePage = source("src/app/[slug]/page.tsx");

  assert.match(parent, /Debit or credit card/);
  assert.match(parent, /Pay with Link/);
  assert.match(parent, /Connect bank account/);
  assert.match(parent, /Send change request/);
  assert.match(parent, /displayTokenLabel\(child\.enrollmentStatus\)/);
  assert.match(enrollment, /"CRM Location ID"/);
  assert.doesNotMatch(enrollment, /"School Location Label"/);
  assert.match(parent, /displayTokenLabel\(invoice\.status\)/);
  assert.match(parent, /displayTokenLabel\(documentsNeedingAction\[0\]\.status\)/);
  assert.match(parent, /displayTokenLabel\(meal\.mealType\)/);
  assert.match(parent, /displayTokenLabel\(event\.type\)/);
  assert.match(parent, /displayTokenLabel\(incident\.type\)/);
  assert.match(enrollment, /Enrollment pipeline/);
  assert.match(enrollment, /Selected inquiry/);
  assert.match(dashboard, /School operations overview/);
  assert.doesNotMatch(
    [parent, enrollment, dashboard, dashboardPage, workspacePage].join("\n"),
    /Live CRM|SaaS tenant|visible to your role|command center|open CRM tasks|CRM follow-up tasks|The BEE Suite CRM/i,
  );
});

test("shared module descriptions avoid prototype and implementation language", () => {
  const modules = source("src/lib/demo-data.ts");

  assert.match(modules, /title: "Operations overview"/);
  assert.match(modules, /title: "Enrollment inquiries"/);
  assert.match(modules, /title: "AI assistant"/);
  assert.match(modules, /title: "Brand settings"/);
  assert.match(modules, /title: "Users and access"/);
  assert.match(modules, /title: "Help and guides"/);
  assert.doesNotMatch(
    modules,
    /Command Center|Daily command center|Brand-ready SaaS|SaaS billing plans|Auth-ready users|Role-aware prompt context|AI guardrails documentation|Private Supabase Storage media/i,
  );
});

test("the inert role preview uses task-focused copy", () => {
  const preview = source("src/app/device-preview/page.tsx");

  assert.match(preview, /Director overview/);
  assert.match(preview, /Common director tasks/);
  assert.doesNotMatch(preview, /Director command center|Frequent director workflows/);
});

test("an unavailable SMS integration does not claim a message was queued", () => {
  const smsRoute = source("src/app/api/integrations/sms/route.ts");

  assert.match(smsRoute, /"SMS not sent"/);
  assert.doesNotMatch(smsRoute, /SMS queued as configuration task/);
});

test("upload failures do not expose storage-provider errors", () => {
  const uploadRoutes = [
    source("src/app/api/profile/photo/route.ts"),
    source("src/app/api/communications/messages/route.ts"),
    source("src/app/api/documents/[id]/upload/route.ts"),
    source("src/app/api/teacher/media/route.ts"),
  ].join("\n");

  assert.doesNotMatch(uploadRoutes, /error instanceof Error \? error\.message/);
  assert.match(uploadRoutes, /We couldn't upload your profile photo/);
  assert.match(uploadRoutes, /The message was not sent/);
  assert.match(uploadRoutes, /It was not saved/);
  assert.match(uploadRoutes, /It was not shared/);
});

test("automation summaries use readable actions and statuses", () => {
  const automation = source("src/components/automation-workflow-builder.tsx");

  assert.match(automation, /Choose when an automation runs/);
  assert.match(automation, /actionSummary\(automation\.action\)/);
  assert.match(automation, /displayTokenLabel\(automation\.status\)/);
  assert.match(automation, /displayTokenLabel\(automation\.runs\[0\]\.status\)/);
  assert.doesNotMatch(automation, /action payloads|jsonSummary\(automation\.action\)/);
});

test("data import tasks display readable status and risk labels", () => {
  const readiness = source("src/components/data-readiness-center.tsx");

  assert.match(readiness, /statusCopy\[task\.status\]\.label/);
  assert.match(readiness, /riskLabel\(task\.risk\)/);
  assert.match(readiness, /statusCopy\[selectedTask\.status\]\.label/);
  assert.doesNotMatch(readiness, />\{task\.status\}<|>\{task\.risk\}</);
});
