import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const productionCopySurfaces = [
  "scripts/render-kokomo-actual-app-walkthrough-videos.mjs",
  "src/app/resources/page.tsx",
  "src/components/automation-workflow-builder.tsx",
  "src/components/campaign-workspace.tsx",
  "src/components/crm/crm-workspace.tsx",
  "src/components/dashboard.tsx",
  "src/components/data-readiness-center.tsx",
  "src/components/device-session-panel.tsx",
  "src/components/executive-admin-console.tsx",
  "src/components/integration-setup-panel.tsx",
  "src/components/live-ops-pages.tsx",
  "src/components/login-form.tsx",
  "src/components/message-conversation-inbox.tsx",
  "src/components/notification-preferences-panel.tsx",
  "src/components/onboarding-flow.tsx",
  "src/components/parent-portal-invite-button.tsx",
  "src/components/reputation-workspace.tsx",
  "src/components/tenant-controls-panel.tsx",
  "src/lib/communications-kit.ts",
  "src/lib/dashboard-widgets.ts",
  "src/lib/demo-data.ts",
  "src/lib/executive-admin-validation.ts",
  "src/lib/integration-setup.ts",
].map(source).join("\n");

test("production copy avoids pilot and internal approval jargon", () => {
  assert.doesNotMatch(
    productionCopySurfaces,
    /live pilot|role-gated|human-reviewed|tenant-wide|tenant workflows|provider accepted/i,
  );
  assert.doesNotMatch(
    productionCopySurfaces,
    /Ready for pilot workflows|health indicators for the pilot|>Pilot only<|>Multi-location pilot|>Enterprise pilot/i,
  );
  assert.doesNotMatch(
    productionCopySurfaces,
    /No tenant campaigns|Internal thread · tenant scoped|using this tenant account data|tenant-specific encrypted credentials|Tenant Credentials|Enter tenant credential|Human review required/i,
  );
  assert.match(productionCopySurfaces, /value: "human_required", label: "Staff review required"/);
});

test("limited-rollout values and accurate AI labels remain intact", () => {
  const onboarding = source("src/components/onboarding-flow.tsx");
  const tenantControls = source("src/components/tenant-controls-panel.tsx");
  const aiSurfaces = [
    source("src/components/automation-workflow-builder.tsx"),
    source("src/components/live-ops-pages.tsx"),
    source("src/lib/dashboard-widgets.ts"),
  ].join("\n");

  assert.match(onboarding, /value="Multi-location pilot - all features included">Multi-location plan - all features included/);
  assert.match(onboarding, /value="Enterprise pilot configuration">Enterprise launch configuration/);
  assert.match(tenantControls, /value="pilot">Limited rollout/);
  assert.match(tenantControls, /row\.rollout === "disabled" \? "pilot"/);
  assert.match(aiSurfaces, /Generate AI summary/);
  assert.match(aiSurfaces, /AI assist/);
  assert.match(aiSurfaces, /AI can help draft wording/);
  assert.match(aiSurfaces, /AI daily brief/);
});

test("delivery and account-scope copy explains outcomes in plain language", () => {
  const resources = source("src/app/resources/page.tsx");
  const inviteButton = source("src/components/parent-portal-invite-button.tsx");
  const notificationPreferences = source("src/components/notification-preferences-panel.tsx");
  const login = source("src/components/login-form.tsx");

  assert.match(resources, /Accepted means the email service received it for delivery/);
  assert.match(inviteButton, /Accepted for delivery/);
  assert.match(inviteButton, /The welcome email was accepted for delivery/);
  assert.match(notificationPreferences, /Role defaults apply across this account/);
  assert.match(notificationPreferences, /device notification center/);
  assert.match(login, /only shows locations assigned to your account/);
});

test("the current parent invitation guide sources use temporary-password language", () => {
  const guideGraphicSources = [
    source("scripts/render-current-instruction-graphics.mjs"),
    source("public/brand/the-bee-suite/explainers/current/parent-access-install.svg"),
    source("public/brand/the-bee-suite/explainers/current/director-daily-flow.svg"),
  ].join("\n");

  assert.match(guideGraphicSources, /temporary password from the invitation/);
  assert.match(guideGraphicSources, /email, and temporary password/);
  assert.doesNotMatch(
    guideGraphicSources,
    /school-issued first-login password|email, and first-login password|human-reviewed/i,
  );
  assert.match(guideGraphicSources, /School staff must review custody, pickup, medical, incident, billing, and compliance decisions/);
});

test("parent invitation and document errors do not expose server exceptions", () => {
  const invitationRoute = source("src/app/api/parent/invitations/route.ts");
  const documentRoute = source("src/app/api/parent/documents/[id]/submit/route.ts");

  assert.doesNotMatch(invitationRoute, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(documentRoute, /error instanceof Error \? error\.message/);
  assert.match(invitationRoute, /We couldn't confirm whether the invitation finished/);
  assert.match(invitationRoute, /Refresh this family before trying again/);
  assert.match(documentRoute, /It has not been submitted\. Try again\./);
});
